import { describe, expect, it } from 'vitest'

const sources = import.meta.glob(['../../**/*.ts', '../../**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const forbidden = [
  /console\.(log|debug|info|warn|error)\s*\(/u,
  /localStorage/u,
  /sessionStorage/u,
  /indexedDB/u,
  /dangerouslySetInnerHTML/u,
  /document\.cookie/u,
  /import\.meta\.env/u,
]

describe('sensitive data handling', () => {
  it('does not log, persist, or render extracted text as HTML in application source', () => {
    const failures: string[] = []

    for (const [file, source] of Object.entries(sources)) {
      if (file.includes('.test.') || typeof source !== 'string') {
        continue
      }

      for (const pattern of forbidden) {
        if (pattern.test(source)) {
          failures.push(`${file} matches ${pattern}`)
        }
      }
    }

    expect(failures).toEqual([])
    expect(Object.keys(sources).length).toBeGreaterThan(0)
  })
})
