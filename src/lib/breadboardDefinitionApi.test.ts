import { vi } from 'vitest'

import type { BreadboardDefinition } from './breadboardDefinitionModel'
import {
  createBreadboardDefinitionRecord,
  deleteBreadboardDefinitionRecord,
  listBreadboardDefinitions,
  loadBreadboardDefinition,
  updateBreadboardDefinitionRecord,
} from './breadboardDefinitionApi'

const savedDefinition: BreadboardDefinition = {
  id: 'definition-1',
  name: 'Board A',
  imageName: 'board-a.png',
  imagePath: '/__breadboard_local__/images/board-a.png',
  imageWidth: 1200,
  imageHeight: 420,
  points: [
    {
      id: 'point-1',
      label: 'A1',
      x: 0.123456,
      y: 0.654321,
      kind: 'breadboard-hole',
      snapSource: 'manual',
    },
  ],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
}

describe('breadboardDefinitionApi', () => {
  it('loads saved definitions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ definitions: [savedDefinition] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(listBreadboardDefinitions(fetchMock)).resolves.toEqual([savedDefinition])
    expect(fetchMock).toHaveBeenCalledWith('/api/part-definitions')
  })

  it('loads a saved definition by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ definition: savedDefinition }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(loadBreadboardDefinition(savedDefinition.id, fetchMock)).resolves.toEqual(savedDefinition)
    expect(fetchMock).toHaveBeenCalledWith('/api/part-definitions/definition-1')
  })

  it('creates a saved definition through the local api', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ definition: savedDefinition }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(createBreadboardDefinitionRecord(savedDefinition, fetchMock)).resolves.toEqual(savedDefinition)
    expect(fetchMock).toHaveBeenCalledWith('/api/part-definitions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(savedDefinition),
    })
  })

  it('updates an existing definition through the local api', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ definition: savedDefinition }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(updateBreadboardDefinitionRecord(savedDefinition, fetchMock)).resolves.toEqual(savedDefinition)
    expect(fetchMock).toHaveBeenCalledWith('/api/part-definitions/definition-1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(savedDefinition),
    })
  })

  it('deletes a saved definition through the local api', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(deleteBreadboardDefinitionRecord(savedDefinition.id, fetchMock)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/part-definitions/definition-1', {
      method: 'DELETE',
    })
  })
})