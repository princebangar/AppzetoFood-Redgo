import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

/**
 * ActionSlider - Professional "Swipe to Confirm" UI Component.
 * Race-condition safe: isAcceptingRef prevents double-fire from rapid slides.
 */
export const ActionSlider = ({ 
  label = "Slide to Confirm", 
  onConfirm, 
  disabled = false,
  color = "bg-green-600",
  successLabel = "Confirmed ✓"
}) => {
  const [progress, setProgress] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const containerRef = useRef(null);
  const controls = useAnimation();
  // Atomic lock: prevents double-fire when user slides rapidly or two people slide at the same time
  const isAcceptingRef = useRef(false);

  // Reset when disabled state changes (e.g. order was claimed by another - parent sets disabled=true)
  useEffect(() => {
    if (disabled) {
      setProgress(0);
      setIsSuccess(false);
      isAcceptingRef.current = false;
    }
  }, [disabled]);

  const handleDrag = (event, info) => {
    if (disabled || isSuccess || isAcceptingRef.current) return;
    
    const containerWidth = containerRef.current?.offsetWidth || 300;
    const handleWidth = 56; // w-14
    const totalPath = containerWidth - handleWidth - 12; // p-1.5 = 6px each side
    
    const currentProgress = Math.min(1, Math.max(0, (info.point.x - containerRef.current.getBoundingClientRect().left) / totalPath));
    setProgress(currentProgress);
  };

  const handleDragEnd = async (event, info) => {
    // Guard: if already processing or already succeeded, do nothing
    if (disabled || isSuccess || isAcceptingRef.current) return;

    if (progress > 0.8 || info.offset.x > 150) {
      // Atomically lock BEFORE any async work to prevent race conditions
      isAcceptingRef.current = true;
      setIsSuccess(true);
      setProgress(1);
      if (onConfirm) {
        try {
          await onConfirm();
        } catch (error) {
          // On failure, reset so the delivery boy can retry
          isAcceptingRef.current = false;
          setIsSuccess(false);
          setProgress(0);
          controls.start({ x: 0 });
        }
      }
    } else {
      setProgress(0);
      controls.start({ x: 0 });
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-[68px] rounded-full p-1.5 overflow-hidden transition-all duration-300 ${
        'bg-gray-950 shadow-lg shadow-black/10'
      }`}
    >
      {/* Background Track */}
      <div className={`absolute inset-y-0 left-[76px] right-5 flex items-center justify-center text-center font-bold text-[11px] uppercase tracking-[0.14em] leading-none whitespace-nowrap transition-opacity duration-300 ${
        isSuccess ? 'opacity-0' : disabled ? 'text-white/70' : 'text-white/88'
      }`}>
        {disabled ? 'Action Locked' : label}
      </div>

      {/* Dynamic Progress Fill */}
      <motion.div 
        className={`absolute inset-0 ${color} rounded-full`}
        initial={{ width: 0 }}
        animate={{ 
          width: isSuccess ? '100%' : `${progress * 100}%`,
          opacity: disabled ? 0 : 1
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />

      {/* Success View */}
      <AnimatePresence>
        {isSuccess && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-y-0 left-[76px] right-5 flex items-center justify-center text-center text-white font-bold text-sm uppercase tracking-[0.14em] leading-none z-30"
          >
            {successLabel}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Handle */}
      <motion.div
        drag={disabled || isSuccess || isAcceptingRef.current ? false : "x"}
        dragConstraints={{ left: 0, right: containerRef.current?.offsetWidth ? containerRef.current.offsetWidth - 68 : 250 }}
        dragElastic={0.1}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        animate={controls}
        className={`relative w-14 h-14 rounded-full flex items-center justify-center z-20 cursor-grab active:cursor-grabbing shadow-xl transition-colors ${
          disabled ? 'bg-gray-200 text-gray-400' : 
          isSuccess ? 'bg-white text-green-600' : 'bg-white text-gray-950'
        }`}
      >
        <ChevronRight className={`w-8 h-8 transition-transform duration-300 ${isSuccess ? 'scale-110' : ''}`} />
      </motion.div>
    </div>
  );
};

export default ActionSlider;
