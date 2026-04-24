import { describe, expect, it } from 'vitest'

import {
  addBreadboardGridGroup,
  createBreadboardGridGroup,
  createEmptyBreadboardPartDefinition,
  moveBreadboardRegion,
  parseGridSize,
} from './breadboardPartDefinitions'

function createTestDefinition() {
  return createEmptyBreadboardPartDefinition({
    id: 'breadboard',
    name: 'Breadboard',
    imageSrc: '/breadboard.png',
    imageWidth: 1200,
    imageHeight: 420,
  })
}

describe('createBreadboardPartDefinition', () => {
  it('starts as a clean slate with no points', () => {
    const definition = createTestDefinition()

    expect(definition.metadata.kind).toBe('breadboard')
    expect(definition.metadata.regions).toHaveLength(0)
    expect(definition.points).toHaveLength(0)
  })

  it('parses grid sizes like 2x10 and 7 by 60', () => {
    expect(parseGridSize('2x10')).toEqual({ rows: 2, columns: 10 })
    expect(parseGridSize('7 by 60')).toEqual({ rows: 7, columns: 60 })
    expect(parseGridSize('bad')).toBeUndefined()
  })

  it('creates evenly spaced points from top-left to bottom-right', () => {
    const group = createBreadboardGridGroup({
      groupId: 'group-1',
      label: 'Group 1',
      rows: 2,
      columns: 3,
      topLeft: { x: 0.2, y: 0.3 },
      bottomRight: { x: 0.8, y: 0.7 },
    })

    expect(group.points).toHaveLength(6)
    expect(group.points.find((point) => point.id === 'group-1:1-1')).toMatchObject({ x: 0.2, y: 0.3 })
    expect(group.points.find((point) => point.id === 'group-1:1-2')).toMatchObject({ x: 0.5, y: 0.3 })
    expect(group.points.find((point) => point.id === 'group-1:2-3')).toMatchObject({ x: 0.8, y: 0.7 })
  })

  it('adds a generated grid as a movable group', () => {
    const definition = addBreadboardGridGroup(createTestDefinition(), {
      groupId: 'group-1',
      label: 'Group 1',
      rows: 2,
      columns: 2,
      topLeft: { x: 0.2, y: 0.2 },
      bottomRight: { x: 0.4, y: 0.4 },
    })

    expect(definition.metadata.regions).toHaveLength(1)
    expect(definition.metadata.regions?.[0]?.name).toBe('Group 1')
    expect(definition.points).toHaveLength(4)
  })

  it('moves a generated group by updating all point coordinates', () => {
    const definition = addBreadboardGridGroup(createTestDefinition(), {
      groupId: 'group-1',
      label: 'Group 1',
      rows: 2,
      columns: 2,
      topLeft: { x: 0.2, y: 0.2 },
      bottomRight: { x: 0.4, y: 0.4 },
    })
    const movedRegion = moveBreadboardRegion(definition, 'group-1', 0.01, 0.02)

    expect(movedRegion.points.find((point) => point.id === 'group-1:1-1')?.x).toBeCloseTo(0.21)
    expect(movedRegion.points.find((point) => point.id === 'group-1:1-1')?.y).toBeCloseTo(0.22)
    expect(movedRegion.points.find((point) => point.id === 'group-1:2-2')?.x).toBeCloseTo(0.41)
    expect(movedRegion.points.find((point) => point.id === 'group-1:2-2')?.y).toBeCloseTo(0.42)
  })

  it('keeps generated point coordinates normalized', () => {
    const definition = addBreadboardGridGroup(createTestDefinition(), {
      groupId: 'group-1',
      label: 'Group 1',
      rows: 7,
      columns: 60,
      topLeft: { x: 0.1, y: 0.2 },
      bottomRight: { x: 0.9, y: 0.8 },
    })

    definition.points.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
    })
  })
})
