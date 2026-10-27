import { FilePlus, Home, type LucideIcon } from 'lucide-react'
import type { AppPage } from './workspace.ts'

interface SideNavProps {
  page: AppPage
  onNavigate: (page: AppPage) => void
}

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'new-review', label: 'New Review', icon: FilePlus },
] as const satisfies readonly { id: AppPage; label: string; icon: LucideIcon }[]

export function SideNav({ page, onNavigate }: SideNavProps) {
  return (
    <nav className="side-nav" aria-label="Primary">
      <p className="side-nav__label">Workspace</p>
      <ul className="side-nav__list">
        {navItems.map((item) => {
          const Icon = item.icon

          return (
            <li key={item.id}>
              <button
                type="button"
                className="side-nav__link"
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
