import { describe, expect, it } from 'vitest'
import { reviewChecklist } from '../../data/reviewChecklist.ts'
import { sampleDischargeLetter } from '../../data/sampleDischargeLetter.ts'
import { sampleMedicationPlan } from '../../data/sampleMedicationPlan.ts'
import { compareDocuments } from './comparison/compare-documents.ts'
import { createReviewSession, setFindingStatus, setReviewStatus } from './review-session.ts'

const documents = [sampleDischargeLetter, sampleMedicationPlan] as const

describe('review session', () => {
  it('stores comparison findings without starting the review', () => {
    const review = createReviewSession(documents, reviewChecklist)
    const compared = compareDocuments(sampleDischargeLetter, sampleMedicationPlan, reviewChecklist)

    expect(review.status).toBe('not-started')
    expect(review.documentIds).toEqual(['DOC-2026-001', 'DOC-2026-002'])
    expect(review.findings.map((finding) => finding.id)).toEqual(compared.map((finding) => finding.id))
    expect(review.findings.every((finding) => finding.status === 'open')).toBe(true)
  })

  it('keeps finding status unchanged when the review is completed', () => {
    const review = createReviewSession(documents, reviewChecklist)
    const withFollowUp = setFindingStatus(review, review.findings[0]?.id ?? '', 'follow-up-required')
    const completed = setReviewStatus(withFollowUp, 'completed')

    expect(completed.status).toBe('completed')
    expect(completed.findings).toBe(withFollowUp.findings)
    expect(completed.findings.map((finding) => finding.status)).toEqual(
      withFollowUp.findings.map((finding) => finding.status),
    )
    expect(completed.findings.some((finding) => finding.status === 'open')).toBe(true)
    expect(completed.findings.some((finding) => finding.status === 'follow-up-required')).toBe(true)
    expect(completed.findings.some((finding) => finding.status === 'resolved')).toBe(false)
  })

  it('changes one finding without changing the review status', () => {
    const review = createReviewSession(documents, reviewChecklist)
    const targetId = review.findings[1]?.id ?? ''
    const updated = setFindingStatus(review, targetId, 'reviewed')

    expect(updated.status).toBe('not-started')
    expect(updated.findings.find((finding) => finding.id === targetId)?.status).toBe('reviewed')
    expect(
      updated.findings
        .filter((finding) => finding.id !== targetId)
        .map((finding) => finding.status),
    ).toEqual(review.findings.filter((finding) => finding.id !== targetId).map(() => 'open'))
  })

  it('leaves the session unchanged when the finding id is unknown', () => {
    const review = createReviewSession(documents, reviewChecklist)

    expect(setFindingStatus(review, 'missing', 'resolved')).toBe(review)
    expect(setReviewStatus(review, 'not-started')).toBe(review)
  })
})
