import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Plus, MapPin, MoreHorizontal, Navigation, Home, Building2, Briefcase, Phone, X, Crosshair, Search } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Textarea } from "@food/components/ui/textarea"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useProfile } from "@food/context/ProfileContext"
import { toast } from "sonner"
import { locationAPI, userAPI } from "@food/api"
import { Loader } from '@googlemaps/js-api-loader'
import AnimatedPage from "@food/components/user/AnimatedPage"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

// Enable Maps if API Key is available, otherwise fallback to coordinates-only mode
const MAPS_ENABLED = !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const deltaLat = (lat2 - lat1) * Math.PI / 180
  const deltaLon = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

export default function AddressSelectorPage() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { location, loading, requestLocation } = useGeoLocation()
  const { addresses = [], addAddress, updateAddress, setDefaultAddress, userProfile, isAuthenticated, loading: profileLoading } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [mapPosition, setMapPosition] = useState([22.7196, 75.8577]) // Default Indore coordinates [lat, lng]
  const [addressFormData, setAddressFormData] = useState({
    street: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    label: "Home",
    phone: "",
  })
  const [isFetchingLocationState, setIsFetchingLocationState] = useState(false)
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const mapContainerRef = useRef(null)
  const googleMapRef = useRef(null) // Google Maps instance
  const greenMarkerRef = useRef(null) // Green marker for address selection
  const userLocationMarkerRef = useRef(null) // Blue dot marker for user location
  const blueDotCircleRef = useRef(null) // Accuracy circle for Google Maps
  const [currentAddress, setCurrentAddress] = useState("")
  const [addressAutocompleteValue, setAddressAutocompleteValue] = useState("")
  const [keywordAddressSuggestions, setKeywordAddressSuggestions] = useState([])
  const [isKeywordSearching, setIsKeywordSearching] = useState(false)
  const [lockMapToAutocomplete, setLockMapToAutocomplete] = useState(true)
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)
  const [formScrollTop, setFormScrollTop] = useState(0)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [baseMapHeight, setBaseMapHeight] = useState(320)
  const formBodyRef = useRef(null)
  const manualFieldRefs = useRef({})
  
  const ENABLE_LOCATION_REVERSE_GEOCODE = import.meta.env.VITE_ENABLE_LOCATION_REVERSE_GEOCODE !== "false"
  const ENABLE_NOMINATIM_SEARCH = import.meta.env.VITE_ENABLE_NOMINATIM_SEARCH !== "false"
  const getAddressId = (address) => address?.id || address?._id || null

  const handleBack = () => {
    goBack()
  }

  const addressAutocompleteSuggestions = useMemo(() => {
    const q = String(addressAutocompleteValue || "").trim().toLowerCase()
    if (!q) return []
    const list = Array.isArray(addresses) ? addresses : []
    return list
      .map((addr) => {
        const text = [
          addr?.label,
          addr?.additionalDetails,
          addr?.street,
          addr?.city,
          addr?.state,
          addr?.zipCode,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return { addr, text }
      })
      .filter((x) => x.text.includes(q))
      .slice(0, 6)
      .map((x) => x.addr)
  }, [addresses, addressAutocompleteValue])

  // Load Google Maps API key
  useEffect(() => {
    if (!MAPS_ENABLED) return
    import('@food/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])

  // Nominatim search
  useEffect(() => {
    const q = String(addressAutocompleteValue || "").trim()
    if (!ENABLE_NOMINATIM_SEARCH || q.length < 3) {
      setKeywordAddressSuggestions([])
      setIsKeywordSearching(false)
      return
    }

    const t = setTimeout(async () => {
      try {
        setIsKeywordSearching(true)
        const refLat = location?.latitude ?? 22.7196
        const refLng = location?.longitude ?? 75.8577
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(q)}`
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        const json = await res.json()
        const mapped = (Array.isArray(json) ? json : []).map(r => ({
          id: r.place_id || r.osm_id,
          display: r.display_name || "",
          lat: Number(r.lat),
          lng: Number(r.lon),
          address: r.address || {},
        }))
        const withDistance = mapped
          .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng))
          .map(x => ({ ...x, distanceMeters: calculateDistance(refLat, refLng, x.lat, x.lng) }))
          .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
          .slice(0, 4)
        setKeywordAddressSuggestions(withDistance)
      } catch (e) {
        setKeywordAddressSuggestions([])
      } finally {
        setIsKeywordSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [addressAutocompleteValue, location, ENABLE_NOMINATIM_SEARCH])

  // Map Initialization logic
  useEffect(() => {
    if (!MAPS_ENABLED || !showAddressForm || !GOOGLE_MAPS_API_KEY) return

    let isMounted = true
    setMapLoading(true)

    const initializeGoogleMap = async () => {
      try {
        // Retry a few times if the container ref isn't immediately populated in the DOM
        let retries = 0
        while (!mapContainerRef.current && retries < 10) {
          await new Promise(resolve => setTimeout(resolve, 50))
          retries++
        }

        if (!isMounted || !mapContainerRef.current) {
          setMapLoading(false)
          return
        }

        const loader = new Loader({ apiKey: GOOGLE_MAPS_API_KEY, version: "weekly" })
        const google = await loader.load()
        if (!isMounted || !mapContainerRef.current) return

        const initialPos = { lat: mapPosition[0], lng: mapPosition[1] }
        
        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialPos,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] }
          ]
        })
        googleMapRef.current = map

        // Update coordinates on map idle (center of the map is the chosen location)
        map.addListener("idle", () => {
          const center = map.getCenter()
          const lat = center.lat()
          const lng = center.lng()
          setMapPosition([lat, lng])
          handleMapMoveEnd(lat, lng)
        })

        setMapLoading(false)
      } catch (err) {
        debugError("Map init error:", err)
        setMapLoading(false)
      }
    }
    initializeGoogleMap()
    return () => { isMounted = false }
  }, [showAddressForm, GOOGLE_MAPS_API_KEY])

  const handleUseCurrentLocation = async () => {
    try {
      setIsFetchingLocationState(true)
      
      // Fetch fresh location via requestLocation (which now dispatches userLocationUpdated on success)
      const loc = await requestLocation()
      
      if (loc) {
        sessionStorage.setItem("manual_location_update", "true")
        localStorage.setItem("deliveryAddressMode", "current")
        window.dispatchEvent(new CustomEvent("userLocationUpdated"))
        // Go back instantly after successful location lock!
        handleBack()
      } else {
        setIsFetchingLocationState(false)
      }
    } catch (e) {
      setIsFetchingLocationState(false)
      toast.error("Failed to get current location", { id: "geo" })
    }
  }

  const handleSelectSavedAddress = async (address) => {
    const id = getAddressId(address)
    if (id) {
      sessionStorage.setItem("manual_location_update", "true")
      
      // Perform optimistic default address set instantly
      setDefaultAddress(id)
      
      try { 
        localStorage.setItem("deliveryAddressMode", "saved")
        window.dispatchEvent(new CustomEvent("userLocationUpdated"))
        // Go back immediately!
        handleBack()
      } catch (e) {
        console.error("Failed to select saved address:", e)
      }
    }
  }

  const handleSelectOuterSuggestion = (s) => {
    setIsFetchingLocationState(true)
    try {
      const lat = s.lat
      const lng = s.lng
      const display = s.display
      const a = s.address || {}
      
      const displayParts = display ? display.split(",").map(p => p.trim()).filter(Boolean) : []
      
      // Robust city extraction
      let city = a.city || a.town || a.village || a.hamlet || a.county || a.state_district || a.district || a.municipality || ""
      if (!city && displayParts.length > 0) {
        city = displayParts[0]
      }
      if (!city) {
        city = "Indore"
      }

      // Robust area extraction
      let area = a.suburb || a.neighbourhood || a.sublocality || a.quarter || ""
      if (!area && displayParts.length > 1 && city !== displayParts[0]) {
        area = displayParts[0]
      }

      // Robust state extraction
      let state = a.state || ""
      if (!state && displayParts.length > 1) {
        const potentialStates = displayParts.slice(0, -1).filter(p => !/^\d+$/.test(p))
        if (potentialStates.length > 0) {
          state = potentialStates[potentialStates.length - 1]
        }
      }
      if (!state) {
        state = "Madhya Pradesh"
      }

      if (lat && lng) {
        const finalLoc = {
          latitude: lat,
          longitude: lng,
          city: city,
          state: state,
          country: "India",
          area: area,
          address: display || "Selected Location",
          formattedAddress: display || "Selected Location"
        }

        // Save to local storage
        localStorage.setItem("userLocation", JSON.stringify(finalLoc))
        sessionStorage.setItem("manual_location_update", "true")
        localStorage.setItem("deliveryAddressMode", "current")
        
        // Dispatch update event
        window.dispatchEvent(new CustomEvent("userLocationUpdated"))
        
        handleBack()
      } else {
        toast.error("Could not resolve location coordinates")
      }
    } catch (err) {
      console.error("Error selecting search suggestion:", err)
      toast.error("Failed to select location")
    } finally {
      setIsFetchingLocationState(false)
    }
  }

  const handleAddAddressClick = () => {
    if (!isAuthenticated) {
      toast.info("Please login to add an address")
      navigate("/user/auth/login")
      return
    }
    setAddressAutocompleteValue("")
    setKeywordAddressSuggestions([])
    setShowAddressForm(true)
  }

  const handleCancelAddressForm = () => {
    setAddressAutocompleteValue("")
    setKeywordAddressSuggestions([])
    setShowAddressForm(false)
  }

  const scrollFieldIntoView = useCallback((fieldName) => {
    const el = manualFieldRefs.current?.[fieldName]
    if (!el) return
    setTimeout(() => {
      try {
        const scrollHost = formBodyRef.current
        if (!scrollHost) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
        const hostRect = scrollHost.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const viewportHeight =
          typeof window !== "undefined" && window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight
        const safeBottom = viewportHeight - keyboardInset - 90
        const overBy = elRect.bottom - safeBottom
        if (overBy > 0) {
          scrollHost.scrollTo({
            top: scrollHost.scrollTop + overBy + 24,
            behavior: "smooth",
          })
          return
        }
        if (elRect.top < hostRect.top + 70) {
          const upBy = hostRect.top + 70 - elRect.top
          scrollHost.scrollTo({
            top: Math.max(0, scrollHost.scrollTop - upBy - 12),
            behavior: "smooth",
          })
          return
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      } catch {
        // Ignore scrolling errors.
      }
    }, 120)
  }, [keyboardInset])

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  const handleMapMoveEnd = async (lat, lng) => {
    if (!ENABLE_LOCATION_REVERSE_GEOCODE) return
    try {
      // Use Nominatim for free reverse geocoding on the client side
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
      const response = await fetch(url, { 
        headers: { 
          "Accept-Language": "en",
          "User-Agent": "AppZeto-Food-App" 
        } 
      })
      const json = await response.json()
      
      if (json && json.address) {
        const addr = json.address
        const formatted = json.display_name
        
        // Extract meaningful street/area info
        const street = [
          addr.road,
          addr.suburb,
          addr.neighbourhood,
          addr.house_number
        ].filter(Boolean).slice(0, 2).join(", ") || addr.amenity || addr.industrial || ""

        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || ""
        const state = addr.state || ""
        const postcode = addr.postcode || ""

        setCurrentAddress(formatted)
        setAddressFormData(prev => ({
          ...prev,
          street: street || formatted.split(",")[0] || prev.street,
          city: city || prev.city,
          state: state || prev.state,
          zipCode: postcode || prev.zipCode,
        }))
      }
    } catch (e) {
      debugError("Reverse geocode error:", e)
    }
  }

  const handleAddressFormSubmit = async (e) => {
    e.preventDefault()
    if (!isAuthenticated) {
       toast.info("Please login to save an address")
       navigate("/user/auth/login")
       return
    }
    if (!addressFormData.street || !addressFormData.city) {
      toast.error("Please fill required fields")
      return
    }
    setLoadingAddress(true)
    try {
      const payload = {
        ...addressFormData,
        label: addressFormData.label === "Work" ? "Office" : addressFormData.label,
        location: { type: "Point", coordinates: [mapPosition[1], mapPosition[0]] },
        latitude: mapPosition[0],
        longitude: mapPosition[1]
      }
      const created = await addAddress(payload)
      if (created) {
        const id = getAddressId(created)
        if (id) await setDefaultAddress(id)
        try { 
          sessionStorage.setItem("manual_location_update", "true");
          localStorage.setItem("deliveryAddressMode", "saved")
          window.dispatchEvent(new CustomEvent("userLocationUpdated"))
        } catch {}
        // toast.success("Address saved")
        handleBack()
      }
    } catch (error) {
      toast.error("Failed to save address")
    } finally {
      setLoadingAddress(false)
    }
  }

  useEffect(() => {
    if (!showAddressForm) return
    const updateBaseMapHeight = () => {
      const vh = typeof window !== "undefined" ? window.innerHeight : 800
      const target = Math.round(vh * 0.45)
      setBaseMapHeight(Math.max(260, Math.min(420, target)))
    }
    updateBaseMapHeight()
    window.addEventListener("resize", updateBaseMapHeight)
    return () => window.removeEventListener("resize", updateBaseMapHeight)
  }, [showAddressForm])

  useEffect(() => {
    if (!showAddressForm) return
    setFormScrollTop(0)
  }, [showAddressForm])

  useEffect(() => {
    if (!showAddressForm || typeof window === "undefined" || !window.visualViewport) return
    const viewport = window.visualViewport
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }
    updateKeyboardInset()
    viewport.addEventListener("resize", updateKeyboardInset)
    viewport.addEventListener("scroll", updateKeyboardInset)
    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset)
      viewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [showAddressForm])

  if (showAddressForm) {
    const mapHeight = baseMapHeight 
    return (
      <AnimatedPage
        className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex flex-col h-screen overflow-hidden"
      >
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancelAddressForm} className="rounded-full">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-bold">Add delivery location</h1>
        </div>

        <div
          ref={formBodyRef}
          onScroll={(e) => {
            setFormScrollTop(e.currentTarget.scrollTop)
          }}
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: `${96 + keyboardInset}px` }}
        >
          {/* Map Section - Parallax enabled */}
          <div
            className="flex-shrink-0 relative z-0"
            style={{ 
              height: `${mapHeight}px`,
              transform: `translateY(${formScrollTop * 0.4}px)`,
              opacity: clamp(1 - (formScrollTop / 500), 0.4, 1)
            }}
          >
            <div className="absolute top-4 left-4 right-4 z-20">
              <div className="relative group shadow-2xl">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-[#DC2626]" />
                </div>
                <Input
                  value={addressAutocompleteValue}
                  onChange={(e) => setAddressAutocompleteValue(e.target.value)}
                  placeholder="Search area, street, landmark..."
                  className="pl-12 pr-10 h-14 bg-white dark:bg-[#1a1a1a] border-2 border-zinc-300 dark:border-zinc-700 rounded-2xl focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-zinc-500 dark:focus:border-zinc-500 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 font-medium text-sm transition-all shadow-sm w-full"
                />
                {addressAutocompleteValue && (
                  <button 
                    onClick={() => setAddressAutocompleteValue("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {isKeywordSearching && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2">
                     <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#DC2626] border-t-transparent" />
                  </div>
                )}

                {keywordAddressSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 dark:bg-gray-800/50">Suggestions</p>
                    {keywordAddressSuggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          const { lat, lng, display, address: a } = s
                          setMapPosition([lat, lng])
                          if (googleMapRef.current) {
                            googleMapRef.current.panTo({ lat, lng })
                            googleMapRef.current.setZoom(17)
                          }
                          setAddressAutocompleteValue(display)
                          const city = a.city || a.town || a.village || a.county || ""
                          const state = a.state || ""
                          const zipCode = a.postcode || ""
                          setAddressFormData((prev) => ({
                            ...prev,
                            street: display || prev.street,
                            city: city || prev.city,
                            state: state || prev.state,
                            zipCode: zipCode || prev.zipCode,
                          }))
                          setKeywordAddressSuggestions([])
                        }}
                        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-[#DC2626]/5 dark:hover:bg-[#DC2626]/10 transition-colors text-left border-b border-gray-50 dark:border-gray-800 last:border-none"
                      >
                        <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div className="min-w-0">
                           <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.display}</p>
                           <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.address?.city || s.address?.state}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div ref={mapContainerRef} className="w-full h-full bg-gray-100 dark:bg-gray-800" />
            
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
               <div className="relative mb-8 flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center p-2 mb-[-6px] shadow-sm animate-bounce-short">
                     <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center border-2 border-white">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                     </div>
                  </div>
                  <div className="w-1.5 h-6 bg-green-600 border-x border-white shadow-xl rounded-b-full shadow-green-900/40" />
                  <div className="w-3 h-1.5 bg-black/20 rounded-full blur-[1px] transform scale-x-150 absolute bottom-[-4px]" />
               </div>
            </div>

            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#DC2626]" />
              </div>
            )}
            
            <div className="absolute bottom-10 right-4 z-10">
              <Button 
                  onClick={handleUseCurrentLocation} 
                  className="bg-white text-black hover:bg-gray-100 shadow-xl border border-gray-200 rounded-full h-12 px-6"
              >
                <Navigation className="h-4 w-4 mr-2 text-[#DC2626]" /> Use My Location
              </Button>
            </div>
          </div>

          <div className="relative bg-white dark:bg-[#0a0a0a] rounded-t-[32px] -mt-8 z-10 p-4 space-y-6 shadow-[0_-12px_24px_-10px_rgba(0,0,0,0.1)]">
            <div className="bg-[#DC2626]/5 dark:bg-[#DC2626]/10 border border-[#DC2626]/10 dark:border-[#DC2626]/20 rounded-xl p-4 flex gap-3">
               <MapPin className="h-5 w-5 text-[#DC2626] mt-0.5" />
               <div className="min-w-0">
                  <p className="text-xs font-bold text-[#DC2626] dark:text-[#DC2626]/80 uppercase mb-1">Pinnned Location</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{currentAddress || "Select a location on map"}</p>
               </div>
            </div>

            <div>
              <Label className="text-sm font-bold mb-2 block">Primary Address (Street / Area / Landmark)</Label>
              <Input 
                placeholder="Search or drag to update street/area" 
                value={addressFormData.street} 
                onChange={e => setAddressFormData({...addressFormData, street: e.target.value})}
                onFocus={() => scrollFieldIntoView("street")}
                ref={(el) => { manualFieldRefs.current.street = el }}
                className="mb-4 h-12 rounded-xl bg-gray-50 dark:bg-gray-800/50"
                required
              />

              <Label className="text-sm font-bold mb-2 block text-gray-700 dark:text-gray-300">Secondary Address (House No. / Flat / Floor)</Label>
              <Input 
                placeholder="E.g. Flat 402, 4th Floor, AppZeto Building" 
                value={addressFormData.additionalDetails} 
                onChange={e => setAddressFormData({...addressFormData, additionalDetails: e.target.value})}
                onFocus={() => scrollFieldIntoView("additionalDetails")}
                ref={(el) => { manualFieldRefs.current.additionalDetails = el }}
                className="h-12 rounded-xl border-gray-200 dark:border-gray-800 focus:ring-[#DC2626]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1 block">City</Label>
                <Input 
                  value={addressFormData.city} 
                  onChange={e => setAddressFormData({...addressFormData, city: e.target.value})} 
                  onFocus={() => scrollFieldIntoView("city")}
                  ref={(el) => { manualFieldRefs.current.city = el }}
                  className="h-12 rounded-xl"
                  required 
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">State</Label>
                <Input 
                  value={addressFormData.state} 
                  onChange={e => setAddressFormData({...addressFormData, state: e.target.value})} 
                  onFocus={() => scrollFieldIntoView("state")}
                  ref={(el) => { manualFieldRefs.current.state = el }}
                  className="h-12 rounded-xl"
                  required 
                />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Pincode / ZIP</Label>
              <Input 
                placeholder="Pincode" 
                value={addressFormData.zipCode || ""} 
                onChange={e => setAddressFormData({...addressFormData, zipCode: e.target.value})} 
                onFocus={() => scrollFieldIntoView("zipCode")}
                ref={(el) => { manualFieldRefs.current.zipCode = el }}
                className="h-12 rounded-xl"
              />
            </div>

            <div>
               <Label className="text-sm font-bold mb-2 block">Save address as</Label>
               <div className="flex gap-2">
                 {["Home", "Work", "Other"].map(l => (
                   <Button 
                     key={l}
                     variant={addressFormData.label === l ? "default" : "outline"}
                     onClick={() => setAddressFormData({...addressFormData, label: l})}
                     className="flex-1"
                     style={addressFormData.label === l ? {backgroundColor: '#DC2626', color: 'white'} : {}}
                   >
                     {l}
                   </Button>
                 ))}
               </div>
            </div>
          </div>
        </div>

        <div
          className="fixed left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800 transition-[bottom] duration-150"
          style={{ bottom: `${keyboardInset}px` }}
        >
          <Button 
            className="w-full h-12 text-white font-bold text-lg" 
            style={{backgroundColor: '#DC2626'}}
            onClick={handleAddressFormSubmit}
            disabled={loadingAddress}
          >
            {loadingAddress ? "Saving..." : "Save Address \u0026 Proceed"}
          </Button>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col">
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold">Select Location</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
        {/* Search Bar */}
        <div className="p-4 bg-white dark:bg-[#0a0a0a] border-b dark:border-gray-800/10">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-[#DC2626]" />
            </div>
            <Input
              value={addressAutocompleteValue}
              onChange={(e) => setAddressAutocompleteValue(e.target.value)}
              placeholder="Search for area, street name..."
              className="pl-12 pr-10 h-14 bg-white dark:bg-[#1a1a1a] border-2 border-zinc-300 dark:border-zinc-700 rounded-2xl focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-zinc-500 dark:focus:border-zinc-500 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 font-medium text-sm transition-all shadow-sm w-full"
            />
            {addressAutocompleteValue && (
              <button 
                onClick={() => setAddressAutocompleteValue("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search Suggestions List */}
        {keywordAddressSuggestions.length > 0 && (
          <div className="mx-4 mt-2 mb-4 bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-850 z-50 animate-in fade-in duration-200">
            {keywordAddressSuggestions.map((s) => {
              const title = s.display.split(",")[0] || s.display
              const subtitle = s.display.split(",").slice(1).join(",").trim() || s.display
              return (
                <button
                  key={s.id}
                  onClick={() => handleSelectOuterSuggestion(s)}
                  className="w-full px-4 py-3.5 flex items-start gap-3.5 hover:bg-[#DC2626]/5 dark:hover:bg-[#DC2626]/10 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-full bg-red-50 dark:bg-red-950/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="h-4.5 w-4.5 text-[#DC2626]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate">{title}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">{subtitle}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 mt-2.5 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}

        {isKeywordSearching && (
          <div className="mx-4 mt-2 mb-4 p-4 flex items-center justify-center gap-2 text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#DC2626] border-t-transparent" />
            Searching location...
          </div>
        )}

        {/* Action Rows: Use Current Location & Add Address */}
        <div className="bg-white dark:bg-[#0a0a0a] border-b border-zinc-100 dark:border-zinc-800/60 divide-y divide-zinc-100 dark:divide-zinc-800/40">
          <button 
            onClick={handleUseCurrentLocation}
            className="w-full flex items-center gap-4 py-4 px-6 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-all text-left"
          >
            <div className="h-10 w-10 rounded-full bg-red-50 dark:bg-red-950/10 flex items-center justify-center flex-shrink-0">
              <Crosshair className="h-5 w-5 text-[#DC2626]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#DC2626] text-[15px]">Use current location</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{currentAddress || "Enable GPS for accuracy"}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
          </button>

          <button 
            onClick={handleAddAddressClick}
            className="w-full flex items-center gap-4 py-4 px-6 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-all text-left"
          >
            <div className="h-10 w-10 rounded-full bg-red-50 dark:bg-red-950/10 flex items-center justify-center flex-shrink-0">
              <Plus className="h-5 w-5 text-[#DC2626]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#DC2626] text-[15px]">Add Address</p>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Saved Addresses</h2>
          </div>

          <div className="space-y-4">
            {profileLoading && addresses.length === 0 ? (
              // Skeleton loading state
              [1, 2].map((i) => (
                <div key={i} className="w-full flex items-start gap-4 p-4 bg-slate-50 dark:bg-[#1a1a1a] rounded-xl animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-800 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
                  </div>
                </div>
              ))
            ) : addresses.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                 <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                 <p>No addresses saved yet</p>
              </div>
            ) : (
              addresses.map((addr, idx) => {
                const Icon = getAddressIcon(addr)
                return (
                  <button
                    key={getAddressId(addr) || idx}
                    onClick={() => handleSelectSavedAddress(addr)}
                    className="w-full flex items-start gap-4 p-4 bg-slate-50 dark:bg-[#1a1a1a] rounded-xl hover:bg-[#DC262610] dark:hover:bg-[#DC262620] transition-colors text-left group"
                  >
                    <div className="h-10 w-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm">
                      <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white capitalize">{addr.label || "Address"}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                        {[addr.additionalDetails, addr.street, addr.city, addr.state].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <div className="h-6 w-6 rounded-full border border-gray-200 dark:border-gray-700 mt-2 flex items-center justify-center group-hover:border-[#DC2626]">
                       <ChevronRight className="h-3 w-3 text-gray-400 group-hover:text-[#DC2626]" />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bounce-short {
          animation: bounce-short 1s infinite ease-in-out;
        }
      `}</style>
      
      {isFetchingLocationState && (
        <div className="fixed inset-0 z-[10000] bg-white/60 dark:bg-[#0a0a0a]/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300 pointer-events-auto">
          <div className="relative">
            <div className="w-10 h-10 border-[3px] border-gray-100/30 rounded-full"></div>
            <div className="absolute top-0 left-0 w-10 h-10 border-[3px] border-[#DC2626] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-[13px] font-bold text-gray-800 dark:text-gray-200 tracking-tight animate-pulse">Fetching Location...</p>
        </div>
      )}
    </AnimatedPage>
  )
}
