import { Sidebar } from '@/components/layout/sidebar'
import { BottomNavigation } from '@/components/layout/bottom-navigation'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop: Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0 md:p-5 lg:p-8 mt-16 md:mt-0">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile: Bottom Navigation */}
      <BottomNavigation />
    </div>
  )
}
