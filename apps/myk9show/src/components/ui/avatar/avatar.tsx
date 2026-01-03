import * as React from "react"

import { cn } from "@/lib/utils"

// Context to manage image loading state
interface AvatarContextValue {
  imageLoaded: boolean
  setImageLoaded: (loaded: boolean) => void
  imageError: boolean
  setImageError: (error: boolean) => void
}

const AvatarContext = React.createContext<AvatarContextValue | undefined>(undefined)

const useAvatarContext = () => {
  const context = React.useContext(AvatarContext)
  if (!context) {
    throw new Error("Avatar components must be used within an Avatar")
  }
  return context
}

const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const [imageLoaded, setImageLoaded] = React.useState(false)
  const [imageError, setImageError] = React.useState(false)

  return (
    <AvatarContext.Provider value={{ imageLoaded, setImageLoaded, imageError, setImageError }}>
      <div
        ref={ref}
        className={cn(
          "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </AvatarContext.Provider>
  )
})
Avatar.displayName = "Avatar"

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, onLoad, onError, ...props }, ref) => {
  const { setImageLoaded, setImageError, imageError } = useAvatarContext()

  const handleLoad = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageLoaded(true)
    setImageError(false)
    onLoad?.(e)
  }, [setImageLoaded, setImageError, onLoad])

  const handleError = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageError(true)
    onError?.(e)
  }, [setImageError, onError])

  if (imageError) return null

  return (
    <img
      ref={ref}
      className={cn("aspect-square h-full w-full object-cover", className)}
      onLoad={handleLoad}
      onError={handleError}
      {...props}
    />
  )
})
AvatarImage.displayName = "AvatarImage"

interface AvatarFallbackProps extends React.HTMLAttributes<HTMLDivElement> {
  delayMs?: number
}

const AvatarFallback = React.forwardRef<HTMLDivElement, AvatarFallbackProps>(
  ({ className, delayMs = 0, ...props }, ref) => {
    const { imageLoaded, imageError } = useAvatarContext()
    const [showFallback, setShowFallback] = React.useState(delayMs === 0)

    React.useEffect(() => {
      if (delayMs > 0) {
        const timer = setTimeout(() => setShowFallback(true), delayMs)
        return () => clearTimeout(timer)
      }
    }, [delayMs])

    // Show fallback if image errored or hasn't loaded and delay has passed
    if (imageLoaded && !imageError) return null
    if (!showFallback && !imageError) return null

    return (
      <div
        ref={ref}
        className={cn(
          "flex h-full w-full items-center justify-center rounded-full bg-muted",
          className
        )}
        {...props}
      />
    )
  }
)
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
