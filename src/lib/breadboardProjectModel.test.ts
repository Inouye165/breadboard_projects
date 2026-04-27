import { describe, expect, it } from 'vitest'

import {
  cloneBreadboardProject,
  cloneProjectComponent,
  cloneWire,
  createEmptyBreadboardProject,
  createProjectComponentId,
  createWireId,
  type BreadboardProject,
} from './breadboardProjectModel'

describe('breadboardProjectModel', () => {
  it('creates an empty project with timestamps and defaults', () => {
    const project = createEmptyBreadboardProject({ name: 'My project' })

    expect(project.name).toBe('My project')
    expect(project.id).toMatch(/.+/)
    expect(project.wires).toEqual([])
    expect(project.components).toBeUndefined()
    expect(project.createdAt).toEqual(project.updatedAt)
  })

  it('preserves provided wires and components when constructing an empty project', () => {
    const project = createEmptyBreadboardProject({
      name: 'Has parts',
      wires: [{ id: 'w-1', fromPointId: 'p-1', toPointId: 'p-2' }],
      components: [{ id: 'c-1', kind: 'led', label: 'D1' }],
    })

    expect(project.wires).toHaveLength(1)
    expect(project.components).toEqual([{ id: 'c-1', kind: 'led', label: 'D1' }])
  })

  it('cloneWire deep-copies waypoints so callers can mutate independently', () => {
    const wire = {
      id: 'w-1',
      fromPointId: 'p-1',
      toPointId: 'p-2',
      waypoints: [{ x: 1, y: 2 }],
    }
    const cloned = cloneWire(wire)

    cloned.waypoints![0].x = 99

    expect(wire.waypoints[0].x).toBe(1)
    expect(cloned.waypoints![0].x).toBe(99)
  })

  it('cloneWire returns undefined waypoints when the source has none', () => {
    const wire = { id: 'w-1', fromPointId: 'p-1', toPointId: 'p-2' }

    expect(cloneWire(wire).waypoints).toBeUndefined()
  })

  it('cloneProjectComponent returns a structurally equal copy', () => {
    const component = { id: 'c-1', kind: 'resistor' as const, label: 'R1', description: '220Ω' }
    const cloned = cloneProjectComponent(component)

    expect(cloned).toEqual(component)
    expect(cloned).not.toBe(component)
  })

  it('cloneBreadboardProject deep-copies wires, waypoints, and components', () => {
    const project: BreadboardProject = {
      id: 'p-1',
      name: 'Original',
      breadboardDefinitionId: 'def-1',
      wires: [
        {
          id: 'w-1',
          fromPointId: 'p-1',
          toPointId: 'p-2',
          waypoints: [{ x: 10, y: 20 }],
        },
      ],
      components: [{ id: 'c-1', kind: 'led', label: 'D1' }],
      createdAt: '2026-04-24T00:00:00.000Z',
      updatedAt: '2026-04-24T00:00:00.000Z',
    }

    const cloned = cloneBreadboardProject(project)
    cloned.wires[0].waypoints![0].x = 999
    cloned.components![0].label = 'X'

    expect(project.wires[0].waypoints![0].x).toBe(10)
    expect(project.components![0].label).toBe('D1')
  })

  it('cloneBreadboardProject leaves components undefined when source has none', () => {
    const cloned = cloneBreadboardProject({
      id: 'p-1',
      name: 'No parts',
      breadboardDefinitionId: 'def-1',
      wires: [],
      createdAt: 'a',
      updatedAt: 'a',
    })

    expect(cloned.components).toBeUndefined()
  })

  it('createWireId and createProjectComponentId produce non-empty unique strings', () => {
    const ids = new Set<string>()

    for (let index = 0; index < 5; index += 1) {
      ids.add(createWireId())
      ids.add(createProjectComponentId())
    }

    for (const id of ids) {
      expect(id).toMatch(/.+/)
    }

    expect(ids.size).toBe(10)
  })
})
