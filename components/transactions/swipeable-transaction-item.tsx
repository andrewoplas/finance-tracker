'use client'

import { useSwipeable } from 'react-swipeable'
import { useState, useRef, useEffect } from 'react'
import { motion, useAnimation } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-media-query'

interface SwipeableTransactionItemProps {
  children: React.ReactNode
  onEdit?: () => void
  onDelete?: () => void
}

export function SwipeableTransactionItem({
  children,
  onEdit,
  onDelete,
}: SwipeableTransactionItemProps) {
  const isMobile = useIsMobile()
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isRevealed, setIsRevealed] = useState(false)
  const controls = useAnimation()
  const containerRef = useRef<HTMLDivElement>(null)

  const actionWidth = 80 // Width of each action button
  const threshold = 40 // Minimum swipe to trigger

  // Reset on mount/unmount
  useEffect(() => {
    return () => {
      setSwipeOffset(0)
      setIsRevealed(false)
    }
  }, [])

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      if (!isMobile) return
      
      const delta = eventData.deltaX
      
      // Swipe left to reveal delete (negative offset)
      if (delta < 0) {
        const offset = Math.max(delta, -actionWidth)
        setSwipeOffset(offset)
      }
      // Swipe right to reveal edit (positive offset)
      else if (delta > 0 && isRevealed) {
        // Only allow swiping right to close if already revealed
        const offset = Math.min(delta - actionWidth, 0)
        setSwipeOffset(offset)
      }
    },
    onSwiped: (eventData) => {
      if (!isMobile) return

      // Determine final position based on swipe distance
      if (Math.abs(eventData.deltaX) > threshold) {
        if (eventData.deltaX < 0) {
          // Swiped left - reveal delete
          controls.start({ x: -actionWidth })
          setSwipeOffset(-actionWidth)
          setIsRevealed(true)
        } else if (isRevealed) {
          // Swiped right - close
          controls.start({ x: 0 })
          setSwipeOffset(0)
          setIsRevealed(false)
        }
      } else {
        // Didn't swipe far enough - snap back
        controls.start({ x: isRevealed ? -actionWidth : 0 })
        setSwipeOffset(isRevealed ? -actionWidth : 0)
      }
    },
    trackMouse: false,
    trackTouch: true,
  })

  const handleEdit = () => {
    setSwipeOffset(0)
    setIsRevealed(false)
    controls.start({ x: 0 })
    onEdit?.()
  }

  const handleDelete = () => {
    setSwipeOffset(0)
    setIsRevealed(false)
    controls.start({ x: 0 })
    onDelete?.()
  }

  // Desktop: just render children without swipe
  if (!isMobile) {
    return <>{children}</>
  }

  // Mobile: swipeable wrapper
  return (
    <div 
      ref={containerRef}
      className="relative overflow-hidden touch-pan-y"
      style={{ touchAction: 'pan-y' }}
    >
      {/* Background actions (revealed on swipe) */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        {/* Delete action (left swipe) */}
        <button
          onClick={handleDelete}
          className="w-20 bg-destructive/90 hover:bg-destructive text-white flex items-center justify-center active:bg-destructive transition-colors"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* Content (swipeable) */}
      <motion.div
        {...handlers}
        animate={controls}
        initial={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        drag="x"
        dragConstraints={{ left: -actionWidth, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(e, info) => {
          if (Math.abs(info.offset.x) > threshold) {
            if (info.offset.x < 0) {
              controls.start({ x: -actionWidth })
              setSwipeOffset(-actionWidth)
              setIsRevealed(true)
            } else {
              controls.start({ x: 0 })
              setSwipeOffset(0)
              setIsRevealed(false)
            }
          } else {
            controls.start({ x: isRevealed ? -actionWidth : 0 })
          }
        }}
        className="relative bg-card cursor-grab active:cursor-grabbing"
      >
        {children}
      </motion.div>
    </div>
  )
}
