import {Suspense} from 'react'
import {BottomNavigation} from '@/components/layout/bottom-navigation'
export default function DemoLayout({children}:{children:React.ReactNode}){return <>{children}<Suspense><BottomNavigation demo/></Suspense></>}
