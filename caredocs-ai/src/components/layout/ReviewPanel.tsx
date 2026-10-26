export function ReviewPanel() {
  return (
    <aside className="review-panel" aria-labelledby="review-panel-title">
      <header className="review-panel__header">
        <h2 className="review-panel__title" id="review-panel-title">
          Review
        </h2>
        <p className="review-panel__lead">
          Notes, findings, and review status appear in this panel.
        </p>
      </header>
      <dl className="review-panel__facts">
        <div>
          <dt>Assignment</dt>
          <dd>Not assigned</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className="review-panel__badge">Not started</span>
          </dd>
        </div>
        <div>
          <dt>Findings</dt>
          <dd>None recorded</dd>
        </div>
      </dl>
    </aside>
  )
}
