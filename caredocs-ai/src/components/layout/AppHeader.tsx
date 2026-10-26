import { FileText } from 'lucide-react'

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__mark" aria-hidden="true">
          <FileText size={18} strokeWidth={1.75} />
        </span>
        <div className="app-header__titles">
          <p className="app-header__name">CareDocs AI</p>
          <p className="app-header__subtitle">AI Document Review Assistant</p>
        </div>
      </div>
      <p className="app-header__context">Document review workspace</p>
    </header>
  )
}
