import { Sidebar } from '@/components/layout/sidebar'
import { FloatingActionButton } from '@/components/layout/floating-action-button'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5 lg:p-8 mt-16 lg:mt-0">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
      <FloatingActionButton />
    </div>
  )
}
