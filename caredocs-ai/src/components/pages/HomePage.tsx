import { FileText, Pill, SearchCheck } from 'lucide-react'

interface HomePageProps {
  onStartReview: () => void
}

const documentTypes = [
  {
    title: 'Discharge Letters',
    icon: FileText,
    points: [
      'Review patient identity information.',
      'Inspect diagnoses and treatment documentation.',
      'Review medication and follow-up information when available.',
    ],
  },
  {
    title: 'Medication Plans',
    icon: Pill,
    points: [
      'Compare medication names.',
      'Identify differences in medication strength.',
      'Compare dosage and administration instructions.',
    ],
  },
  {
    title: 'Document Consistency',
    icon: SearchCheck,
    points: [
      'Identify discrepancies between documents.',
      'Highlight missing or incomplete information covered by enabled review rules.',
      'Provide evidence so a reviewer can verify the source information.',
    ],
  },
] as const

const steps = [
  { title: 'Upload Documents', text: 'Select the documents you want to compare.' },
  { title: 'Review Findings', text: 'Inspect potential discrepancies and supporting evidence.' },
  { title: 'Verify and Complete', text: 'Review the findings and update the review status.' },
] as const

export function HomePage({ onStartReview }: HomePageProps) {
  return (
    <div className="home-page">
      <header className="home-welcome">
        <h1>Welcome to CareDocs AI</h1>
        <p className="home-welcome__subtitle">Your AI-assisted healthcare document review workspace.</p>
        <p className="home-welcome__intro">
          Compare healthcare documents, identify potential discrepancies, and review missing
          information in one place. CareDocs AI helps healthcare professionals organize document
          reviews and identify items that may require further attention.
        </p>
      </header>

      <section className="start-card" aria-labelledby="start-review-title">
        <div className="start-card__copy">
          <h2 id="start-review-title">Start a New Review</h2>
          <p>Upload two healthcare documents to compare their information and identify potential discrepancies.</p>
        </div>
        <button type="button" className="button-primary" onClick={onStartReview}>
          Start New Review
        </button>
      </section>

      <section className="home-section" aria-labelledby="document-types-title">
        <h2 id="document-types-title">What Can You Review?</h2>
        <p className="home-section__lead">
          This workspace compares a structured discharge letter with a structured medication plan.
        </p>
        <div className="card-grid">
          {documentTypes.map((item) => {
            const Icon = item.icon

            return (
              <article className="info-card" key={item.title}>
                <span className="info-card__icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3>{item.title}</h3>
                <ul>
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
      </section>

      <section className="home-section" aria-labelledby="how-it-works-title">
        <h2 id="how-it-works-title">How It Works</h2>
        <ol className="step-grid">
          {steps.map((step, index) => (
            <li className="info-card" key={step.title}>
              <span className="step-grid__index" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="home-disclaimer">
          CareDocs AI provides document review assistance. Findings require human verification and
          are not medical diagnoses or treatment recommendations.
        </p>
      </section>
    </div>
  )
}
