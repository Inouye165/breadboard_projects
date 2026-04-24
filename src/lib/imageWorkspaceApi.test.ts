import { vi } from 'vitest'

import type { SavedWorkspace } from './imageAlignment'
import { loadSavedWorkspace, saveWorkspace, uploadWorkspaceImage } from './imageWorkspaceApi'

const savedWorkspace: SavedWorkspace = {
  imageName: 'board.png',
  imagePath: '/__breadboard_local__/images/board.png',
  alignment: {
    rotationDegrees: 15,
    referencePoints: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.25 },
    ],
  },
}

describe('imageWorkspaceApi', () => {
  it('reloads saved metadata and image path from the local API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspace: savedWorkspace }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(loadSavedWorkspace(fetchMock)).resolves.toEqual(savedWorkspace)
    expect(fetchMock).toHaveBeenCalledWith('/api/workspace')
  })

  it('uploads an image and returns the persisted workspace reference', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspace: savedWorkspace }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const file = new File(['image-bytes'], 'board.png', { type: 'image/png' })

    await expect(uploadWorkspaceImage(file, fetchMock)).resolves.toEqual(savedWorkspace)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/workspace/image')
  })

  it('saves the alignment metadata back through the local API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspace: savedWorkspace }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(saveWorkspace(savedWorkspace, fetchMock)).resolves.toEqual(savedWorkspace)
    expect(fetchMock).toHaveBeenCalledWith('/api/workspace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(savedWorkspace),
    })
  })
})