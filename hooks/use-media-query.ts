'use client'
import { useCallback, useSyncExternalStore } from 'react'
export function useMediaQuery(query: string): boolean {
 const subscribe = useCallback((callback: () => void) => {
   const media = window.matchMedia(query)
   media.addEventListener('change', callback)
   return () => media.removeEventListener('change', callback)
 }, [query])
 return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
export function useIsMobile() { return useMediaQuery('(max-width: 768px)') }
