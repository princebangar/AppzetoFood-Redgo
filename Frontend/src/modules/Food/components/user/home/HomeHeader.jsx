import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronDown, Search, Mic, CheckCircle2, Tag, Gift, AlertCircle, Clock, X, IndianRupee, User, Wallet, Utensils, Soup } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@food/components/ui/avatar";
import { useProfile } from "@food/context/ProfileContext";
import useNotificationInbox from "@food/hooks/useNotificationInbox";
import VoiceSearchOverlay from "@food/components/user/VoiceSearchOverlay";
import { useNavigate } from 'react-router-dom';
import { isModuleAuthenticated } from "@food/utils/auth";

// Images for banner - exactly as in FestBanner.jsx
const bannerImages = {
  nonVeg: [
    "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=500&h=500&fit=crop",
  ],
  veg: [
    "https://images.unsplash.com/photo-1585238341267-1cfec2046a55?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop",
  ]
};

const ICON_MAP = {
  CheckCircle2,
  Tag,
  Gift,
  AlertCircle
};

export default function HomeHeader({
  activeTab,
  setActiveTab,
  location,
  savedAddressText,
  handleSearchFocus,
  placeholderIndex,
  placeholders,
  vegMode = false,
  handleVegModeChange,
  vegModeToggleRef,
  handleVoiceSearchClick,
  // Banner Props integrated
  videoUrl = "",
  hideFoodImages = false,
  showBanner = false
}) {
  const navigate = useNavigate();
  const { userProfile } = useProfile();
  const [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);

  // FestBanner Logic
  const [imgIndex, setImgIndex] = useState(0);
  const currentPool = vegMode ? bannerImages.veg : bannerImages.nonVeg;
  const hasVideo = typeof videoUrl === "string" && videoUrl.trim().length > 0;

  useEffect(() => {
    if (!showBanner) return;
    const timer = setInterval(() => {
      setImgIndex(prev => (prev + 1) % currentPool.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [currentPool.length, showBanner]);

  useEffect(() => {
    setImgIndex(0);
  }, [vegMode]);

  const displayImages = [
    currentPool[(imgIndex) % currentPool.length],
    currentPool[(imgIndex + 1) % currentPool.length],
    currentPool[(imgIndex + 2) % currentPool.length]
  ];
  const initials = useMemo(() => {
    if (!userProfile) return "";
    const name = userProfile.firstName || userProfile.name || "";
    return name[0]?.toUpperCase() || "U";
  }, [userProfile]);

  return (
    <div className="relative pt-2 pb-4 px-4 transition-all duration-700 overflow-hidden bg-transparent shadow-none">
      {/* Main Header Content */}
      <div className="relative z-10 space-y-2.5">
        <div className="flex items-start gap-3">
          {/* Left: Location Selector */}
          <Link
            to="/food/user/address-selector"
            state={{ from: window.location.pathname }}
            className="flex items-center gap-2 cursor-pointer group min-w-0 flex-1 relative z-50 text-left no-underline"
          >
            <div className="bg-white/10 p-1.5 rounded-xl group-active:scale-95 transition-all">
              <MapPin className="h-4 w-4 text-white/90 fill-white/20" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[15px] font-black text-white truncate drop-shadow-sm">
                  {(() => {
                    const area = location?.area || location?.subLocality || location?.mainTitle || location?.neighborhood;
                    const city = (location?.city || "").toLowerCase();
                    const state = (location?.state || "").toLowerCase();

                    if (area && !/^-?\d+(\.\d+)?$/.test(area.trim())) {
                      const areaLower = area.toLowerCase();
                      if (areaLower !== city && areaLower !== state) {
                        return area;
                      }
                    }

                    if (location?.address && location.address !== "Select location") {
                      const parts = location.address.split(',').map(p => p.trim());
                      for (const part of parts) {
                        const partLower = part.toLowerCase();
                        if (partLower &&
                          partLower !== city &&
                          partLower !== state &&
                          !/^-?\d/.test(part) &&
                          part.length > 2) {
                          return part;
                        }
                      }
                    }

                    return location?.area || location?.city || "Select Location";
                  })()}
                </span>
                <ChevronDown className="h-3 w-3 text-white/70" />
              </div>

              <span className="text-[10px] font-medium text-white/80 truncate leading-tight mt-0.5">
                {(() => {
                  const state = location?.state || "";
                  const pincode = location?.pincode || "";

                  if (state && pincode) return `${state}, ${pincode}`;
                  if (state) return state;
                  if (pincode) return pincode;

                  const addr = location?.address || "";
                  if (addr && addr.length > 10) {
                    return addr.split(',').slice(1, 3).join(',').trim() || "Pinpoint location";
                  }

                  return "Pinpoint location";
                })()}
              </span>
            </div>
          </Link>

          {/* Right: Actions Column (Wallet, Profile, Veg Toggle) */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            {/* Row 1: Wallet and Profile */}
            <div className="flex items-center gap-3">
              <Link
                to="/food/user/wallet"
                state={{ from: '/food/user' }}
                onClick={(e) => {
                  if (!isModuleAuthenticated('user')) {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('show-login-required'));
                  }
                }}
                className="flex items-center justify-center p-1.5 active:scale-90 transition-all transform-gpu translate-z-0"
              >
                <Wallet className="h-[26px] w-[26px] text-white antialiased" strokeWidth={2.2} />
              </Link>

              {/* Profile Photo - Increased size for better clarity */}
              <Link
                to="/food/user/profile"
                onClick={(e) => {
                  if (!isModuleAuthenticated('user')) {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent('show-login-required'));
                  }
                }}
                className="h-9 w-9 relative flex items-center justify-center rounded-full border-[1.5px] border-white shadow-none cursor-pointer active:scale-95 transition-all overflow-hidden transform-gpu translate-z-0"
              >
                <Avatar className="h-full w-full bg-[#FFF5E6]">
                  {userProfile?.profileImage && (
                    <AvatarImage 
                      src={userProfile.profileImage} 
                      alt="Profile" 
                      className="object-cover"
                    />
                  )}
                  <AvatarFallback className="bg-[#FFF5E6] text-[20px] font-black text-[#DC2626] leading-none tracking-tighter antialiased">
                    {initials || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </div>
          </div>
        </div>

        {/* Row 2: Search Bar and Veg Toggle */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 relative bg-white rounded-2xl flex items-center px-4 py-3 shadow-xl border border-black/5 cursor-pointer active:scale-[0.98] transition-all duration-300"
            onClick={handleSearchFocus}
          >
            <Search className="h-5 w-5 text-[#DC2626] mr-2 shrink-0" strokeWidth={3} />

            <div className="flex-1 overflow-hidden relative h-5">
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholderIndex}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 text-[15px] font-bold text-gray-400 truncate flex items-center"
                >
                  {placeholders?.[placeholderIndex] || 'Search'}
                </motion.span>
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-3 pl-3 border-l border-gray-100 ml-1">
              <Mic
                className="h-5 w-5 text-gray-400"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsVoiceOverlayOpen(true);
                  handleVoiceSearchClick?.();
                }}
              />
            </div>
          </div>

          <VoiceSearchOverlay 
            isOpen={isVoiceOverlayOpen}
            onClose={() => setIsVoiceOverlayOpen(false)}
            onSearchResult={(transcript) => {
              // Navigate to search with the transcript
              navigate(`/food/user/search?q=${encodeURIComponent(transcript)}`);
            }}
          />

          {/* Veg Mode Toggle - Styled like SS2 (Label above toggle) */}
          <div
            ref={vegModeToggleRef}
            className="flex flex-col items-center gap-1 shrink-0 antialiased"
          >
            <span className="text-[9px] font-black text-white uppercase tracking-[0.1em] drop-shadow-md leading-none">Veg Mode</span>
            <div
              className={`w-11 h-5 rounded-full relative transition-all duration-500 cursor-pointer border border-white/20 shadow-lg ${vegMode ? 'bg-[#48c479]' : 'bg-gray-500/60'}`}
              onClick={(e) => {
                e.stopPropagation();
                handleVegModeChange?.(!vegMode);
              }}
            >
              <motion.div
                animate={{ x: vegMode ? 24 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md"
              />
            </div>
          </div>
        </div>

        {/* Integrated FestBanner Content */}
        {showBanner && (
          <div className="relative flex flex-col items-center text-center space-y-3.5 pt-2">
            <motion.div
              key={vegMode ? 'veg-title' : 'nonveg-title'}
              className="mt-3.5"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 10, stiffness: 100 }}
            >
              <h2
                className="text-4xl sm:text-5xl font-black text-[#fff200] italic uppercase leading-none drop-shadow-md"
                style={{ WebkitTextStroke: '1px #5a0000' }}
              >
                {vegMode ? 'VEGGIE DELIGHT' : 'FLAVOUR FEST'}
              </h2>
            </motion.div>

            <div
              className="relative flex items-center gap-3 px-6 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-xl group"
            >
              <div className="relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-0.5">
                  <div className="w-0.5 h-2 bg-[#fff200] rotate-[-20deg] rounded-full" />
                  <div className="w-0.5 h-2.5 bg-[#fff200] rounded-full" />
                  <div className="w-0.5 h-2 bg-[#fff200] rotate-[20deg] rounded-full" />
                </div>
                <Utensils className="h-6 w-6 text-[#fff200]" />
              </div>

              <div className="relative px-2">
                <svg className="absolute -top-1.5 left-0 w-full h-1.5" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 25 0, 50 5 T 100 5" fill="none" stroke="#fff200" strokeWidth="2" opacity="0.6" />
                </svg>
                <span className="text-base sm:text-lg font-bold italic text-white leading-none whitespace-nowrap drop-shadow-md">
                  {vegMode ? 'Pure Veg Magic!' : 'Good Food, Great Mood!'}
                </span>
                <svg className="absolute -bottom-1.5 left-0 w-full h-1.5" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 25 10, 50 5 T 100 5" fill="none" stroke="#fff200" strokeWidth="2" opacity="0.6" />
                </svg>
              </div>

              <div className="relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-0.5">
                  <div className="w-0.5 h-2 bg-[#fff200] rotate-[-20deg] rounded-full" />
                  <div className="w-0.5 h-2.5 bg-[#fff200] rounded-full" />
                  <div className="w-0.5 h-2 bg-white rotate-[20deg] rounded-full" />
                </div>
                <Soup className="h-7 w-7 text-[#fff200]" />
              </div>
            </div>

            {hideFoodImages ? (
              <div className="h-28 sm:h-36" />
            ) : (
              <div className="flex items-end justify-center gap-5 sm:gap-8 pt-4 relative w-full mb-1">
                <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 w-56 h-12 blur-[45px] rounded-full transition-colors duration-700 ${vegMode ? 'bg-emerald-500/40' : 'bg-yellow-400/40'}`} />

                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={`img-left-${vegMode}-${imgIndex}`}
                    className="w-16 h-16 sm:w-20 sm:h-20 z-10"
                    initial={{ x: -100, opacity: 0, rotate: -45, scale: 0.5 }}
                    animate={{
                      x: 0,
                      opacity: 1,
                      rotate: -15,
                      scale: 1,
                      y: [0, -12, 0]
                    }}
                    exit={{ x: -100, opacity: 0, rotate: -45, scale: 0.5 }}
                    transition={{
                      y: { duration: 3.5, repeat: Infinity, ease: "easeInOut" },
                      default: { duration: 0.8, type: "spring", damping: 15 }
                    }}
                  >
                    <img src={displayImages[0]} alt="food" className="w-full h-full object-cover rounded-2xl border-[3px] border-white shadow-2xl rotate-12" />
                  </motion.div>

                  <motion.div
                    key={`img-center-${vegMode}-${imgIndex}`}
                    className="w-24 h-24 sm:w-32 sm:h-32 z-30 -mb-2"
                    initial={{ y: 100, opacity: 0, scale: 0.5 }}
                    animate={{
                      y: 0,
                      opacity: 1,
                      scale: 1,
                      rotate: [0, 5, -5, 0]
                    }}
                    exit={{ y: 50, opacity: 0, scale: 0.5 }}
                    transition={{
                      rotate: { duration: 6, repeat: Infinity, ease: "easeInOut" },
                      default: { duration: 0.8, type: "spring", damping: 12, stiffness: 100 }
                    }}
                  >
                    <div className="relative h-full w-full">
                      <div className={`absolute -inset-2.5 blur-3xl rounded-full animate-pulse transition-colors duration-700 ${vegMode ? 'bg-white/40' : 'bg-yellow-400/40'}`} />
                      <img src={displayImages[1]} alt="food" className="relative w-full h-full object-cover rounded-[2.5rem] border-[4px] border-white shadow-[0_22px_55px_rgba(0,0,0,0.4)]" />
                    </div>
                  </motion.div>

                  <motion.div
                    key={`img-right-${vegMode}-${imgIndex}`}
                    className="w-16 h-16 sm:w-20 sm:h-20 z-10"
                    initial={{ x: 100, opacity: 0, rotate: 45, scale: 0.5 }}
                    animate={{
                      x: 0,
                      opacity: 1,
                      rotate: 15,
                      scale: 1,
                      y: [0, -12, 0]
                    }}
                    exit={{ x: 100, opacity: 0, rotate: 45, scale: 0.5 }}
                    transition={{
                      y: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.4 },
                      default: { duration: 0.8, type: "spring", damping: 15 }
                    }}
                  >
                    <img src={displayImages[2]} alt="food" className="w-full h-full object-cover rounded-2xl border-[3px] border-white shadow-2xl -rotate-12 bg-white" />
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
