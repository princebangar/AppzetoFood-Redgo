import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'

/**
 * OptimizedImage Component
 * 
 * Features:
 * - High-speed native lazy loading (loading="lazy")
 * - Responsive srcset for different screen sizes
 * - WebP/AVIF format support with fallback
 * - Blur placeholder (LQIP) for smooth loading
 * - Preloading for critical images (priority=true)
 * - Proper decoding and fetchpriority
 * - Instant cached image rendering (zero delay/flash for cached assets)
 * - Error handling with fallback
 */
const OptimizedImage = React.memo(({
  src,
  alt,
  className = '',
  priority = false, // For above-the-fold images
  sizes = '100vw',
  objectFit = 'cover',
  placeholder = 'blur',
  blurDataURL,
  onLoad,
  onError,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(priority)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef(null)

  // Check if image URL supports optimization (external URLs)
  const supportsOptimization = (imageSrc) => {
    if (!imageSrc || typeof imageSrc !== 'string' || imageSrc === '') return false
    if (imageSrc.startsWith('data:') || imageSrc.startsWith('/')) return false
    // Check if it's an external URL (http/https)
    return /^https?:\/\//.test(imageSrc)
  }

  const appendImageParams = (imageSrc, params) => {
    try {
      const url = new URL(imageSrc)
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value))
      })
      return url.toString()
    } catch {
      return imageSrc
    }
  }

  // Generate responsive srcset
  const srcSet = useMemo(() => {
    if (!supportsOptimization(src)) return undefined
    const sizesArr = [400, 600, 800, 1200, 1600]
    return sizesArr
      .map(size => `${appendImageParams(src, { w: size, q: 80 })} ${size}w`)
      .join(', ')
  }, [src])

  // Generate WebP srcset
  const webPSrcSet = useMemo(() => {
    if (!supportsOptimization(src)) return undefined
    const sizesArr = [400, 600, 800, 1200, 1600]
    return sizesArr
      .map(size => `${appendImageParams(src, { w: size, q: 80, format: 'webp' })} ${size}w`)
      .join(', ')
  }, [src])

  // Instant Cache Detection: Check if image is already cached/complete in browser cache on mount and source change
  useEffect(() => {
    if (imgRef.current) {
      const img = imgRef.current.querySelector('img')
      if (img && img.complete) {
        setIsLoaded(true)
      }
    }
  }, [src])

  const handleLoad = (e) => {
    setIsLoaded(true)
    if (onLoad) onLoad(e)
  }

  const handleError = (e) => {
    setHasError(true)
    if (onError) onError(e)
  }

  // Default blur placeholder (tiny gray square)
  const defaultBlurDataURL = blurDataURL || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U1ZTdlYiIvPjwvc3ZnPg=='

  // Don't render if src is empty or null
  if (!src || src === '') {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-600">Image unavailable</span>
        </div>
      </div>
    )
  }

  const imageSrc = hasError ? 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23e5e7eb" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle"%3EImage not found%3C/text%3E%3C/svg%3E' : src

  return (
    <div className={`relative overflow-hidden ${className}`} ref={imgRef}>
      {/* Blur Placeholder */}
      {placeholder === 'blur' && !isLoaded && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 1 }}
          animate={{ opacity: isLoaded ? 0 : 1 }}
          transition={{ duration: 0.3 }}
          style={{
            backgroundImage: `url(${defaultBlurDataURL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      {/* Loading Skeleton */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 animate-pulse" />
      )}

      {/* Actual Image - Rendered immediately so browser HTML pre-parser starts pre-fetching, and lazy loads natively */}
      <picture className="absolute inset-0 w-full h-full">
        {/* WebP source for modern browsers */}
        {webPSrcSet && (
          <source
            srcSet={webPSrcSet}
            sizes={sizes}
            type="image/webp"
          />
        )}

        {/* Fallback to original format */}
        <motion.img
          src={imageSrc}
          srcSet={srcSet}
          sizes={supportsOptimization(imageSrc) ? sizes : undefined}
          alt={alt}
          className={`w-full h-full ${objectFit === 'cover' ? 'object-cover' : objectFit === 'contain' ? 'object-contain' : ''} ${priority || isLoaded ? 'opacity-100' : 'opacity-0'} ${!priority && 'transition-opacity duration-300'}`}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      </picture>

      {/* Error State */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-600">Image unavailable</span>
        </div>
      )}
    </div>
  )
})

export default OptimizedImage
