import { describe, expect, it, vi } from 'vitest'

import {
  createLibraryPartRecord,
  deleteLibraryPartRecord,
  listLibraryParts,
  loadLibraryPart,
  updateLibraryPartRecord,
  uploadLibraryPartImage,
} from './partLibraryApi'
import type { LibraryPartDefinition } from './partLibraryModel'

const samplePart: LibraryPartDefinition = {
  id: 'library-part-1',
  name: 'BME280',
  category: 'sensor',
  aliases: [],
  dimensions: { widthMm: 11, heightMm: 16 },
  imageViews: [],
  logicalPins: [],
  physicalPoints: [],
  resources: [],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('partLibraryApi', () => {
  it('lists library parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ parts: [samplePart] }))

    await expect(listLibraryParts(fetchMock)).resolves.toEqual([samplePart])
    expect(fetchMock).toHaveBeenCalledWith('/api/library-parts')
  })

  it('loads a library part by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ part: samplePart }))

    await expect(loadLibraryPart('library-part-1', fetchMock)).resolves.toEqual(samplePart)
    expect(fetchMock).toHaveBeenCalledWith('/api/library-parts/library-part-1')
  })

  it('creates a library part', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ part: samplePart }))

    await expect(createLibraryPartRecord(samplePart, fetchMock)).resolves.toEqual(samplePart)
    expect(fetchMock).toHaveBeenCalledWith('/api/library-parts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePart),
    })
  })

  it('updates a library part', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ part: samplePart }))

    await expect(updateLibraryPartRecord(samplePart, fetchMock)).resolves.toEqual(samplePart)
    expect(fetchMock).toHaveBeenCalledWith('/api/library-parts/library-part-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePart),
    })
  })

  it('deletes a library part', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }))

    await expect(deleteLibraryPartRecord('library-part-1', fetchMock)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/library-parts/library-part-1', {
      method: 'DELETE',
    })
  })

  it('uploads a part image and returns image metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        image: {
          imageName: 'top.png',
          imagePath: '/__breadboard_local__/parts/library-part-1/123-top.png',
          imageWidth: 800,
          imageHeight: 600,
        },
      }),
    )
    const file = new File(['fake-image-bytes'], 'top.png', { type: 'image/png' })

    const result = await uploadLibraryPartImage(
      'library-part-1',
      file,
      { side: 'top', label: 'Top', imageWidth: 800, imageHeight: 600 },
      fetchMock,
    )

    expect(result.imagePath).toContain('/__breadboard_local__/parts/library-part-1/')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/library-parts/library-part-1/images')
    expect(init?.method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      name: 'top.png',
      side: 'top',
      label: 'Top',
      imageWidth: 800,
      imageHeight: 600,
    })
    expect(typeof body.contentsBase64).toBe('string')
    expect(body.contentsBase64.length).toBeGreaterThan(0)
  })
})
