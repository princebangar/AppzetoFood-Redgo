// src/context/cart-context.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { buildCartLineId } from "@food/utils/foodVariants"
import { useProfile } from "@food/context/ProfileContext"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

// Default cart context value to prevent errors during initial render
const defaultCartContext = {
  _isProvider: false, // Flag to identify if this is from the actual provider
  cart: [],
  items: [],
  itemCount: 0,
  total: 0,
  lastAddEvent: null,
  lastRemoveEvent: null,
  addToCart: () => {
    debugWarn('CartProvider not available - addToCart called')
  },
  removeFromCart: () => {
    debugWarn('CartProvider not available - removeFromCart called')
  },
  updateQuantity: () => {
    debugWarn('CartProvider not available - updateQuantity called')
  },
  getCartCount: () => 0,
  isInCart: () => false,
  getCartItem: () => null,
  clearCart: () => {
    debugWarn('CartProvider not available - clearCart called')
  },
  cleanCartForRestaurant: () => {
    debugWarn('CartProvider not available - cleanCartForRestaurant called')
  },
  replaceCart: () => {
    debugWarn('CartProvider not available - replaceCart called')
  },
  // Expose both carts for advanced use cases
  deliveryCart: [],
  takeawayCart: [],
}

const CartContext = createContext(defaultCartContext)

const normalizeCartData = (rawCart) => {
  if (!Array.isArray(rawCart)) return []

  return rawCart
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const parsedQuantity = Number(item.quantity)
      const parsedPrice = Number(item.price)
      const normalizedRestaurantName =
        typeof item.restaurant === "string"
          ? item.restaurant
          : typeof item.restaurant?.name === "string"
            ? item.restaurant.name
            : ""

      const normalizedRestaurantId =
        item.restaurantId ||
        item.restaurant_id ||
        item.restaurant?._id ||
        item.restaurant?.restaurantId ||
        null

      const normalizedImage =
        item.image ||
        item.imageUrl ||
        item.product?.imageUrl ||
        item.product?.image ||
        ""

      const baseItemId =
        item.itemId ||
        item.productId ||
        item.foodId ||
        item.baseItemId ||
        item.menuItemId ||
        item.id ||
        item._id ||
        `cart-item-${index}`

      const variantId = item.variantId || item.variant?._id || item.variant?.id || ""
      const variantName =
        typeof item.variantName === "string"
          ? item.variantName
          : typeof item.variant?.name === "string"
            ? item.variant.name
            : ""
      const parsedVariantPrice = Number(
        item.variantPrice ?? item.variant?.price ?? item.price,
      )
      const lineItemId =
        item.lineItemId ||
        item.cartLineId ||
        buildCartLineId(baseItemId, variantId)

      return {
        ...item,
        id: lineItemId,
        lineItemId,
        itemId: String(baseItemId),
        productId: String(baseItemId),
        variantId: variantId ? String(variantId) : "",
        variantName,
        variantPrice: Number.isFinite(parsedVariantPrice) ? parsedVariantPrice : 0,
        name: item.name || item.product?.name || "Item",
        quantity:
          Number.isFinite(parsedQuantity) && parsedQuantity > 0
            ? Math.floor(parsedQuantity)
            : 1,
        price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
        restaurant: normalizedRestaurantName,
        restaurantId: normalizedRestaurantId,
        image: normalizedImage,
        imageUrl: normalizedImage,
      }
    })
}

const resolveCartEntryId = (items, itemId, variantId = "") => {
  const normalizedItemId = String(itemId || "")
  const safeItems = Array.isArray(items) ? items : []

  const directMatch = safeItems.find((item) => item.id === normalizedItemId)
  if (directMatch) return directMatch.id

  const preferredId = buildCartLineId(normalizedItemId, variantId)

  const exactMatch = safeItems.find((item) => item.id === preferredId)
  if (exactMatch) return exactMatch.id

  if (!variantId) {
    const legacyBaseMatch = safeItems.find(
      (item) =>
        String(item.itemId || item.productId || item.id || "") === normalizedItemId &&
        !String(item.variantId || "").trim(),
    )
    if (legacyBaseMatch) return legacyBaseMatch.id
  }

  return preferredId
}

// ─── localStorage helpers ───────────────────────────────────────────────────

const loadCartFromStorage = (key) => {
  if (typeof window === "undefined") return []
  try {
    const saved = localStorage.getItem(key)
    const parsed = saved ? JSON.parse(saved) : []
    return normalizeCartData(parsed)
  } catch {
    return []
  }
}

const saveCartToStorage = (key, cart) => {
  try {
    const isAuthenticated =
      localStorage.getItem("user_authenticated") === "true" ||
      !!localStorage.getItem("user_accessToken")
    if (cart.length > 0 || isAuthenticated) {
      localStorage.setItem(key, JSON.stringify(normalizeCartData(cart)))
    }
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

// ─── Clean-cart-on-mount helper ─────────────────────────────────────────────

const cleanMultiRestaurantCart = (rawCart) => {
  const safeCart = normalizeCartData(rawCart)
  if (safeCart.length === 0) return safeCart

  const restaurantIds = safeCart.map((item) => item.restaurantId).filter(Boolean)
  const restaurantNames = safeCart.map((item) => item.restaurant).filter(Boolean)
  const uniqueIds = [...new Set(restaurantIds)]
  const normalizeName = (n) => (n ? n.trim().toLowerCase() : "")
  const uniqueNamesSet = new Set(restaurantNames.map(normalizeName))

  if (uniqueIds.length <= 1 && uniqueNamesSet.size <= 1) return safeCart

  // Keep items from the first restaurant only
  const firstId = uniqueIds[0]
  const firstName = restaurantNames[0]
  const firstNameNorm = normalizeName(firstName)

  return safeCart.filter((item) => {
    const itemNameNorm = normalizeName(item.restaurant)
    if (firstNameNorm && itemNameNorm) return itemNameNorm === firstNameNorm
    if (firstId && item.restaurantId) {
      return (
        item.restaurantId === firstId ||
        item.restaurantId === firstId.toString() ||
        item.restaurantId.toString() === firstId
      )
    }
    return false
  })
}

// ─── CartProvider ────────────────────────────────────────────────────────────

export function CartProvider({ children }) {
  // Delivery cart (backward compat key: "cart")
  const [deliveryCart, setDeliveryCart] = useState(() => loadCartFromStorage("cart"))
  // Takeaway cart (separate key: "takeaway_cart")
  const [takeawayCart, setTakeawayCart] = useState(() => loadCartFromStorage("takeaway_cart"))

  // Track last add/remove events for animation
  const [lastAddEvent, setLastAddEvent] = useState(null)
  const [lastRemoveEvent, setLastRemoveEvent] = useState(null)

  // Get current orderType — drives which cart is "active".
  // ProfileProvider must wrap CartProvider in UserLayout for this to work.
  const profile = useProfile()
  const isTakeaway = profile?.orderType === "takeaway"

  // Active cart + its setter
  const cart = isTakeaway ? takeawayCart : deliveryCart
  const setCart = isTakeaway ? setTakeawayCart : setDeliveryCart

  // ── Persist each cart independently ────────────────────────────────────────
  useEffect(() => {
    saveCartToStorage("cart", deliveryCart)
  }, [deliveryCart])

  useEffect(() => {
    saveCartToStorage("takeaway_cart", takeawayCart)
  }, [takeawayCart])

  // ── Clean corrupted data on mount (once per cart) ──────────────────────────
  useEffect(() => {
    const cleaned = cleanMultiRestaurantCart(deliveryCart)
    if (cleaned.length !== deliveryCart.length) setDeliveryCart(cleaned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const cleaned = cleanMultiRestaurantCart(takeawayCart)
    if (cleaned.length !== takeawayCart.length) setTakeawayCart(cleaned)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── addToCart ──────────────────────────────────────────────────────────────
  const addToCart = (item, sourcePosition = null) => {
    const safeCart = normalizeCartData(cart)
    if (safeCart.length > 0) {
      const firstItemRestaurantId = safeCart[0]?.restaurantId
      const firstItemRestaurantName = safeCart[0]?.restaurant
      const newItemRestaurantId = item?.restaurantId
      const newItemRestaurantName = item?.restaurant
      const normalizeName = (name) => (name ? String(name).trim().toLowerCase() : "")

      const firstRestaurantNameNormalized = normalizeName(firstItemRestaurantName)
      const newRestaurantNameNormalized = normalizeName(newItemRestaurantName)
      const hasNameMismatch =
        firstRestaurantNameNormalized &&
        newRestaurantNameNormalized &&
        firstRestaurantNameNormalized !== newRestaurantNameNormalized

      const hasIdMismatch =
        !firstRestaurantNameNormalized &&
        !newRestaurantNameNormalized &&
        firstItemRestaurantId &&
        newItemRestaurantId &&
        String(firstItemRestaurantId) !== String(newItemRestaurantId)

      if (hasNameMismatch || hasIdMismatch) {
        const message = `Cart already contains items from "${firstItemRestaurantName || "another restaurant"}". Please clear cart or complete order first.`
        return { ok: false, error: message, code: "RESTAURANT_MISMATCH" }
      }
    }

    if (!item?.restaurantId && !item?.restaurant) {
      return {
        ok: false,
        error: "Item is missing restaurant information. Please refresh the page.",
        code: "MISSING_RESTAURANT",
      }
    }

    setCart((prev) => {
      const safePrev = normalizeCartData(prev)
      if (safePrev.length > 0) {
        const firstItemRestaurantId = safePrev[0]?.restaurantId
        const firstItemRestaurantName = safePrev[0]?.restaurant
        const newItemRestaurantId = item?.restaurantId
        const newItemRestaurantName = item?.restaurant

        const normalizeName = (name) => (name ? name.trim().toLowerCase() : "")
        const firstRestaurantNameNormalized = normalizeName(firstItemRestaurantName)
        const newRestaurantNameNormalized = normalizeName(newItemRestaurantName)

        if (firstRestaurantNameNormalized && newRestaurantNameNormalized) {
          if (firstRestaurantNameNormalized !== newRestaurantNameNormalized) {
            debugError("❌ Cannot add item: Restaurant name mismatch!")
            return safePrev
          }
        } else if (firstItemRestaurantId && newItemRestaurantId) {
          if (firstItemRestaurantId !== newItemRestaurantId) {
            debugError("❌ Cannot add item: Cart contains items from different restaurant!")
            return safePrev
          }
        }
      }

      const existing = safePrev.find((i) => i.id === item.id)
      if (existing) {
        if (sourcePosition) {
          setLastAddEvent({
            product: { id: item.id, name: item.name, imageUrl: item.image || item.imageUrl },
            sourcePosition,
          })
          setTimeout(() => setLastAddEvent(null), 1500)
        }
        return safePrev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }

      if (!item.restaurantId && !item.restaurant) {
        debugError("❌ Cannot add item: Missing restaurant information!", item)
        return safePrev
      }

      const newItem = { ...item, quantity: 1 }

      if (sourcePosition) {
        setLastAddEvent({
          product: { id: item.id, name: item.name, imageUrl: item.image || item.imageUrl },
          sourcePosition,
        })
        setTimeout(() => setLastAddEvent(null), 1500)
      }

      return [...safePrev, newItem]
    })

    return { ok: true }
  }

  // ── removeFromCart ─────────────────────────────────────────────────────────
  const removeFromCart = (itemId, sourcePosition = null, productInfo = null) => {
    setCart((prev) => {
      const safePrev = normalizeCartData(prev)
      const resolvedItemId = resolveCartEntryId(safePrev, itemId)
      const itemToRemove = safePrev.find((i) => i.id === resolvedItemId)
      if (itemToRemove && sourcePosition && productInfo) {
        setLastRemoveEvent({
          product: {
            id: productInfo.id || itemToRemove.id,
            name: productInfo.name || itemToRemove.name,
            imageUrl: productInfo.imageUrl || productInfo.image || itemToRemove.image || itemToRemove.imageUrl,
          },
          sourcePosition,
        })
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return safePrev.filter((i) => i.id !== resolvedItemId)
    })
  }

  // ── updateQuantity ─────────────────────────────────────────────────────────
  const updateQuantity = (itemId, quantity, sourcePosition = null, productInfo = null) => {
    const safeCart = normalizeCartData(cart)
    const resolvedItemId = resolveCartEntryId(safeCart, itemId)
    if (quantity <= 0) {
      setCart((prev) => {
        const safePrev = normalizeCartData(prev)
        const itemToRemove = safePrev.find((i) => i.id === resolvedItemId)
        if (itemToRemove && sourcePosition && productInfo) {
          setLastRemoveEvent({
            product: {
              id: productInfo.id || itemToRemove.id,
              name: productInfo.name || itemToRemove.name,
              imageUrl: productInfo.imageUrl || productInfo.image || itemToRemove.image || itemToRemove.imageUrl,
            },
            sourcePosition,
          })
          setTimeout(() => setLastRemoveEvent(null), 1500)
        }
        return safePrev.filter((i) => i.id !== resolvedItemId)
      })
      return
    }

    setCart((prev) => {
      const safePrev = normalizeCartData(prev)
      const existingItem = safePrev.find((i) => i.id === resolvedItemId)
      if (existingItem && quantity < existingItem.quantity && sourcePosition && productInfo) {
        setLastRemoveEvent({
          product: {
            id: productInfo.id || existingItem.id,
            name: productInfo.name || existingItem.name,
            imageUrl: productInfo.imageUrl || productInfo.image || existingItem.image || existingItem.imageUrl,
          },
          sourcePosition,
        })
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return safePrev.map((i) => (i.id === resolvedItemId ? { ...i, quantity } : i))
    })
  }

  // ── Read helpers ───────────────────────────────────────────────────────────
  const getCartCount = () =>
    normalizeCartData(cart).reduce((total, item) => total + (item.quantity || 0), 0)

  const isInCart = (itemId, variantId = "") => {
    const safeCart = normalizeCartData(cart)
    const resolvedItemId = resolveCartEntryId(safeCart, itemId, variantId)
    return safeCart.some((i) => i.id === resolvedItemId)
  }

  const getCartItem = (itemId, variantId = "") => {
    const safeCart = normalizeCartData(cart)
    const resolvedItemId = resolveCartEntryId(safeCart, itemId, variantId)
    return safeCart.find((i) => i.id === resolvedItemId) || null
  }

  // ── Mutation helpers ───────────────────────────────────────────────────────

  // Clears only the active cart (delivery or takeaway)
  const clearCart = () => setCart([])

  const replaceCart = (items) => {
    const normalizedItems = normalizeCartData(items).filter((item) => {
      const quantity = Number(item?.quantity)
      return item?.id && (item?.restaurantId || item?.restaurant) && Number.isFinite(quantity) && quantity > 0
    })
    setCart(normalizedItems)
    return { ok: true, count: normalizedItems.length }
  }

  // Clean cart to remove items from different restaurants (keeps only specified restaurant)
  const cleanCartForRestaurant = (restaurantId, restaurantName) => {
    setCart((prev) => {
      const safePrev = normalizeCartData(prev)
      if (safePrev.length === 0) return safePrev

      const normalizeName = (name) => (name ? name.trim().toLowerCase() : "")
      const targetRestaurantNameNormalized = normalizeName(restaurantName)

      return safePrev.filter((item) => {
        const itemRestaurantId = item?.restaurantId
        const itemRestaurantName = item?.restaurant
        const itemRestaurantNameNormalized = normalizeName(itemRestaurantName)

        if (targetRestaurantNameNormalized && itemRestaurantNameNormalized) {
          return itemRestaurantNameNormalized === targetRestaurantNameNormalized
        }
        if (restaurantId && itemRestaurantId) {
          return (
            itemRestaurantId === restaurantId ||
            itemRestaurantId === restaurantId.toString() ||
            itemRestaurantId.toString() === restaurantId
          )
        }
        return false
      })
    })
  }

  // ── Animation-compatible cart structure ────────────────────────────────────
  const cartForAnimation = useMemo(() => {
    const safeCart = normalizeCartData(cart)
    const items = safeCart.map((item) => ({
      product: {
        id: item.id,
        name: item.name,
        imageUrl: item.image || item.imageUrl,
      },
      quantity: item.quantity || 1,
    }))

    const itemCount = safeCart.reduce((total, item) => total + (item.quantity || 0), 0)
    const total = safeCart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0)

    return { items, itemCount, total }
  }, [cart])

  // ── Context value ──────────────────────────────────────────────────────────
  const value = useMemo(
    () => ({
      _isProvider: true,
      // Active cart (delivery or takeaway depending on orderType)
      cart,
      // Animation-compatible structure
      items: cartForAnimation.items,
      itemCount: cartForAnimation.itemCount,
      total: cartForAnimation.total,
      lastAddEvent,
      lastRemoveEvent,
      // Mutations — all route to active cart
      addToCart,
      removeFromCart,
      updateQuantity,
      getCartCount,
      isInCart,
      getCartItem,
      clearCart,
      cleanCartForRestaurant,
      replaceCart,
      // Expose both raw carts for advanced consumers
      deliveryCart,
      takeawayCart,
    }),
    [cart, cartForAnimation, lastAddEvent, lastRemoveEvent, deliveryCart, takeawayCart]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context || context._isProvider !== true) {
    if (process.env.NODE_ENV === "development") {
      debugWarn("⚠️ useCart called outside CartProvider. Using default values.")
      debugWarn("💡 Make sure the component is rendered inside UserLayout which provides CartProvider.")
    }
    return defaultCartContext
  }
  return context
}
