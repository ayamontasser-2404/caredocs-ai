import { AppHeader } from './AppHeader.tsx'
import { DocumentSurface } from './DocumentSurface.tsx'
import { ReviewPanel } from './ReviewPanel.tsx'
import { SideNav } from './SideNav.tsx'
import './layout.css'

export function AppShell() {
  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-shell__workspace">
        <SideNav />
        <DocumentSurface />
        <ReviewPanel />
      </div>
    </div>
  )
}
