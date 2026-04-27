import { vi } from 'vitest'

import type { BreadboardProject } from './breadboardProjectModel'
import {
  createBreadboardProjectRecord,
  deleteBreadboardProjectRecord,
  listBreadboardProjects,
  loadBreadboardProject,
  updateBreadboardProjectRecord,
} from './breadboardProjectApi'

const savedProject: BreadboardProject = {
  id: 'project-1',
  name: 'Project A',
  breadboardDefinitionId: 'definition-1',
  wires: [
    { id: 'wire-1', fromPointId: 'p1', toPointId: 'p2', color: '#cc3333' },
  ],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
}

describe('breadboardProjectApi', () => {
  it('loads saved projects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ projects: [savedProject] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(listBreadboardProjects(fetchMock)).resolves.toEqual([savedProject])
    expect(fetchMock).toHaveBeenCalledWith('/api/projects')
  })

  it('loads a saved project by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ project: savedProject }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(loadBreadboardProject(savedProject.id, fetchMock)).resolves.toEqual(savedProject)
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1')
  })

  it('creates a saved project through the local api', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ project: savedProject }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(createBreadboardProjectRecord(savedProject, fetchMock)).resolves.toEqual(savedProject)
    expect(fetchMock).toHaveBeenCalledWith('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedProject),
    })
  })

  it('updates an existing project through the local api', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ project: savedProject }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(updateBreadboardProjectRecord(savedProject, fetchMock)).resolves.toEqual(savedProject)
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedProject),
    })
  })

  it('deletes a saved project through the local api', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(deleteBreadboardProjectRecord(savedProject.id, fetchMock)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1', {
      method: 'DELETE',
    })
  })
})
