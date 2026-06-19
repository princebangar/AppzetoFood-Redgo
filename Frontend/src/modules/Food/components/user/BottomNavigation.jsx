import { Link, useLocation } from "react-router-dom"
import { ShoppingBag, Tag, Truck, UtensilsCrossed } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import api from "@food/api"
import { useProfile } from "@food/context/ProfileContext"

export default function BottomNavigation() {
  const location = useLocation()
  const pathname = location.pathname
  const [under250PriceLimit, setUnder250PriceLimit] = useState(250)

  const [isVisible, setIsVisible] = useState(true)
  const lastScrollYRef = useRef(typeof window !== 'undefined' ? window.scrollY : 0)
  const accumulatedScrollUpRef = useRef(0)
  const accumulatedScrollDownRef = useRef(0)
  const isVisibleRef = useRef(true)

  // Fetch landing settings to get dynamic price limit
  useEffect(() => {
    let cancelled = false
    api.get('/food/landing/settings/public')
      .then((res) => {
        if (cancelled) return
        const settings = res?.data?.data
        if (settings && typeof settings.under250PriceLimit === 'number') {
          setUnder250PriceLimit(settings.under250PriceLimit)
        }
      })
      .catch(() => {
        if (!cancelled) setUnder250PriceLimit(250)
      })
    return () => { cancelled = true }
  }, [])

  // Scroll logic to hide/show footer - uses refs to avoid listener re-registration
  useEffect(() => {
    const SHOW_THRESHOLD = 150 // Pixels to scroll up to show
    const HIDE_THRESHOLD = 80  // Pixels to scroll down to hide

    const controlNavbar = () => {
      const currentScrollY = window.scrollY
      const lastScrollY = lastScrollYRef.current

      // If we are at the top of the page, always show the footer
      if (currentScrollY < 50) {
        accumulatedScrollDownRef.current = 0
        accumulatedScrollUpRef.current = 0
        lastScrollYRef.current = currentScrollY
        if (!isVisibleRef.current) {
          isVisibleRef.current = true
          setIsVisible(true)
        }
        return
      }

      if (currentScrollY > lastScrollY) {
        // Scrolling Down
        const delta = currentScrollY - lastScrollY
        accumulatedScrollDownRef.current += delta
        accumulatedScrollUpRef.current = 0

        if (accumulatedScrollDownRef.current > HIDE_THRESHOLD && currentScrollY > 100) {
          if (isVisibleRef.current) {
            isVisibleRef.current = false
            setIsVisible(false)
          }
        }
      } else {
        // Scrolling Up
        const delta = lastScrollY - currentScrollY
        accumulatedScrollUpRef.current += delta
        accumulatedScrollDownRef.current = 0

        if (accumulatedScrollUpRef.current > SHOW_THRESHOLD) {
          if (!isVisibleRef.current) {
            isVisibleRef.current = true
            setIsVisible(true)
          }
        }
      }

      lastScrollYRef.current = currentScrollY
    }

    window.addEventListener('scroll', controlNavbar, { passive: true })
    return () => window.removeEventListener('scroll', controlNavbar)
  }, []) // Empty deps — listener registers only ONCE, no re-add on every scroll

  // Normalize pathname by removing trailing slash for consistent comparison
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  
  // Check active routes
  const { orderType, setOrderType } = useProfile();
  
  const isDining = normalizedPath === "/food/dining" || normalizedPath.startsWith("/food/user/dining");
  const isUnder250 = normalizedPath === "/food/under-250" || normalizedPath.startsWith("/food/user/under-250");
  const isProfile = normalizedPath.startsWith("/food/profile") || normalizedPath.startsWith("/food/user/profile");
  
  const isHomePaths = normalizedPath === "/food" || 
    normalizedPath === "/food/user" || 
    normalizedPath === "/user" ||
    normalizedPath === "/" ||
    normalizedPath.startsWith("/food/user") && !isProfile && !isDining && !isUnder250 && !normalizedPath.startsWith("/food/user/takeaway") ||
    normalizedPath.startsWith("/food/restaurants") ||
    normalizedPath.startsWith("/food/user/restaurants");

  const isTakeaway = normalizedPath === "/food/user/takeaway" || 
    normalizedPath.startsWith("/food/user/takeaway") ||
    (isHomePaths && orderType === "takeaway");
  
  // Delivery is the default active state for the food module if nothing else is active
  const isDelivery = !isDining && !isUnder250 && !isProfile && !isTakeaway && isHomePaths;

  const navItems = [
    {
      id: 'delivery',
      label: 'Delivery',
      icon: Truck,
      to: '/food/user',
      active: isDelivery,
      onClick: () => {
        if (setOrderType) setOrderType('delivery');
      }
    },
    {
      id: 'takeaway',
      label: 'Takeaway',
      icon: ShoppingBag,
      to: '/food/user/takeaway',
      active: isTakeaway,
      onClick: () => {
        if (setOrderType) setOrderType('takeaway');
      }
    },
    {
      id: 'under250',
      label: `Under ₹${under250PriceLimit}`,
      icon: Tag,
      to: '/food/user/under-250',
      active: isUnder250
    },
    {
      id: 'dining',
      label: 'Dining',
      icon: UtensilsCrossed,
      to: '/food/user/dining',
      active: isDining
    }
  ]

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 120 }}
          animate={{ y: 0 }}
          exit={{ y: 120 }}
          transition={{ 
            type: "tween",
            ease: [0.22, 1, 0.36, 1],
            duration: 0.5
          }}
          className="md:hidden fixed bottom-6 left-0 right-0 z-50 px-6 pointer-events-none"
        >
          <div 
            className="max-w-md mx-auto h-18 bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-white/10 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.3)] flex items-center justify-around px-2 rounded-[2rem] overflow-hidden pointer-events-auto"
          >
            {navItems.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                onClick={item.onClick}
                className={`flex flex-col items-center justify-center gap-1 h-14 w-full relative transition-all duration-300 ${
                  item.active ? "text-[#DC2626]" : "text-gray-600 dark:text-gray-400"
                }`}
              >
                {item.active && (
                  <motion.div
                    layoutId="active-nav-bg"
                    className="absolute inset-x-1 inset-y-1 bg-[#FFF5F5] dark:bg-[#DC2626]/10 rounded-[1.5rem] z-0"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                
                <div className="relative z-10 flex flex-col items-center gap-0.5">
                  <item.icon 
                    className={`h-5 w-5 transition-transform duration-300 ${item.active ? "scale-110" : ""}`} 
                    strokeWidth={item.active ? 2.5 : 2} 
                  />
                  <span className={`text-[10px] font-black tracking-tight uppercase leading-none ${item.active ? "opacity-100" : "text-gray-900/70 dark:text-gray-300/60"}`}>
                    {item.id === 'under250' ? 'Under 250' : item.label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
