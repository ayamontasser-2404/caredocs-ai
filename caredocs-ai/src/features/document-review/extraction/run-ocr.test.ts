import { describe, expect, it, vi } from 'vitest'
import { PdfTextExtractionError } from './extract-pdf-text.ts'
import { createOcrSession, ocrLanguage } from './run-ocr.ts'

describe('createOcrSession', () => {
  it('recognizes a page with the German language and one worker', async () => {
    const recognize = vi.fn(async () => ({ data: { text: 'Entlassbrief', confidence: 88 } }))
    const terminate = vi.fn(async () => undefined)
    const createWorker = vi.fn(async (language: string) => {
      expect(language).toBe(ocrLanguage)
      return { recognize, terminate }
    })

    const session = await createOcrSession({ createWorker })
    const first = await session.recognize(document.createElement('canvas'))
    const second = await session.recognize(document.createElement('canvas'))
    await session.dispose()

    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(first).toEqual({ text: 'Entlassbrief', confidence: 88 })
    expect(second.text).toBe('Entlassbrief')
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('reports a controlled error when the worker cannot start', async () => {
    const createWorker = vi.fn(async () => {
      throw new Error('worker failed')
    })

    await expect(createOcrSession({ createWorker })).rejects.toThrow(PdfTextExtractionError)
    await expect(createOcrSession({ createWorker })).rejects.toThrow('Unable to process this document.')
  })

  it('reports a controlled error when recognition fails and still terminates the worker', async () => {
    const terminate = vi.fn(async () => undefined)
    const createWorker = vi.fn(async () => ({
      recognize: async () => {
        throw new Error('recognize failed')
      },
      terminate,
    }))

    const session = await createOcrSession({ createWorker })

    await expect(session.recognize(document.createElement('canvas'))).rejects.toThrow(
      'Unable to process this document.',
    )
    await session.dispose()
    expect(terminate).toHaveBeenCalledTimes(1)
  })
})
