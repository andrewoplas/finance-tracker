'use client'

import { ThemeProvider } from 'next-themes'
import { ErrorBoundary } from './error-boundary'

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="finance-appearance"><ErrorBoundary>{children}</ErrorBoundary></ThemeProvider>
}
