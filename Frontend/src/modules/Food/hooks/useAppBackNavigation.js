import { useCallback } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useProfile } from "@food/context/ProfileContext"

const toFoodPath = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("/food/")) return trimmed
  if (trimmed === "/food") return trimmed
  if (trimmed.startsWith("/user/")) return `/food${trimmed}`
  if (trimmed === "/user") return "/food/user"
  return null
}

const getNormalizedUserPath = (pathname) => {
  if (pathname.startsWith("/food")) {
    return pathname.slice(5) || "/"
  }
  return pathname || "/"
}

const resolveBackPath = ({ pathname, search, state, orderType }) => {
  const normalizedPath = getNormalizedUserPath(pathname)
  const explicitBackPath = toFoodPath(state?.backTo) || toFoodPath(state?.from) || toFoodPath(state?.returnTo)
  const searchParams = new URLSearchParams(search || "")
  const defaultHomePath = orderType === "takeaway" ? "/food/user/takeaway" : "/food/user"

  if (
    normalizedPath === "/user/profile/payments/new" ||
    /^\/user\/profile\/payments\/[^/]+\/edit$/.test(normalizedPath)
  ) {
    return explicitBackPath || "/food/user/profile/payments"
  }

  if (
    /^\/user\/profile\/(edit|favorites|support|coupons|about|report-safety-emergency|accessibility|logout|refer-earn|payments)$/.test(
      normalizedPath,
    )
  ) {
    return explicitBackPath || "/food/user/profile"
  }

  if (
    /^\/user\/profile\/(terms|privacy|refund|shipping|cancellation|support-info)$/.test(
      normalizedPath,
    )
  ) {
    return explicitBackPath || "/food/user/profile"
  }

  if (normalizedPath === "/user/wallet") {
    return explicitBackPath || "/food/user/profile"
  }

  if (normalizedPath === "/user/notifications") {
    return explicitBackPath || defaultHomePath
  }

  if (/^\/user\/restaurants\/[^/]+$/.test(normalizedPath)) {
    if (searchParams.get("under250") === "true") {
      return "/food/user/under-250"
    }
    return explicitBackPath || defaultHomePath
  }

  if (/^\/user\/dining\/book(\/|$)/.test(normalizedPath)) {
    return explicitBackPath || "/food/user/dining"
  }

  if (/^\/user\/dining\/[^/]+\/[^/]+$/.test(normalizedPath)) {
    return explicitBackPath || "/food/user/dining"
  }

  if (
    normalizedPath === "/user/dining/explore/upto50" ||
    normalizedPath === "/user/dining/explore/near-rated" ||
    normalizedPath === "/user/dining/coffee"
  ) {
    return "/food/user/dining"
  }

  if (/^\/user\/dining\/[^/]+$/.test(normalizedPath)) {
    return "/food/user/dining"
  }

  if (/^\/user\/orders\/[^/]+(\/invoice|\/details)?$/.test(normalizedPath)) {
    return "/food/user/orders"
  }

  if (
    normalizedPath === "/user/cart/checkout" ||
    normalizedPath === "/user/cart/select-address"
  ) {
    return "/food/user/cart"
  }

  if (normalizedPath === "/user/address-selector") {
    return explicitBackPath || defaultHomePath
  }

  if (/^\/user\/collections\/[^/]+$/.test(normalizedPath)) {
    return "/food/user/collections"
  }

  if (normalizedPath === "/user/categories") {
    return defaultHomePath
  }

  if (/^\/user\/category\/[^/]+$/.test(normalizedPath)) {
    return "/food/user/categories"
  }

  if (
    normalizedPath === "/user/offers" ||
    normalizedPath === "/user/gourmet" ||
    normalizedPath === "/user/coffee"
  ) {
    return defaultHomePath
  }

  if (/^\/user\/product\/[^/]+$/.test(normalizedPath)) {
    return explicitBackPath || defaultHomePath
  }

  if (/^\/user\/complaints(\/|$)/.test(normalizedPath)) {
    return explicitBackPath || "/food/user/orders"
  }

  if (explicitBackPath && explicitBackPath !== pathname) {
    return explicitBackPath
  }

  return defaultHomePath
}

export default function useAppBackNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const profile = useProfile()
  const orderType = profile ? profile.orderType : null

  return useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1)
    } else {
      navigate(resolveBackPath({ ...location, orderType }), { replace: true })
    }
  }, [location, navigate, orderType])
}
