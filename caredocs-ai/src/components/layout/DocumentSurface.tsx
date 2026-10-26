import { FileText } from 'lucide-react'

export function DocumentSurface() {
  return (
    <main className="document-surface" id="document-surface">
      <header className="document-surface__header">
        <h1 className="document-surface__title">Document</h1>
        <p className="document-surface__lead">
          The source document for review is shown here.
        </p>
      </header>
      <article className="document-sheet" aria-label="Document canvas">
        <span className="document-sheet__icon" aria-hidden="true">
          <FileText size={22} strokeWidth={1.75} />
        </span>
        <h2 className="document-sheet__title">Document canvas</h2>
        <p className="document-sheet__text">
          No file is open. This surface stays clear until a document is ready
          for review.
        </p>
      </article>
    </main>
  )
}
