import {
  Archive,
  BookOpen,
  Files,
  ListChecks,
  SearchCheck,
  type LucideIcon,
} from 'lucide-react'

type NavItem = {
  label: string
  icon: LucideIcon
  current: boolean
}

const navItems: readonly NavItem[] = [
  { label: 'Documents', icon: Files, current: true },
  { label: 'Review queue', icon: ListChecks, current: false },
  { label: 'Findings', icon: SearchCheck, current: false },
  { label: 'Guidelines', icon: BookOpen, current: false },
  { label: 'Archive', icon: Archive, current: false },
]

export function SideNav() {
  return (
    <nav className="side-nav" aria-label="Primary">
      <p className="side-nav__label">Workspace</p>
      <ul className="side-nav__list">
        {navItems.map((item) => {
          const Icon = item.icon

          return (
            <li key={item.label}>
              <button
                type="button"
                className="side-nav__link"
                aria-current={item.current ? 'page' : undefined}
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
