import { describe, expect, it } from 'vitest'

import {
  createBreadboardPartDefinition,
  createStandardBreadboardTemplate,
  fitAnchorPoint,
  moveBreadboardColumn,
  moveBreadboardPoint,
  moveBreadboardRegion,
  moveBreadboardRow,
} from './breadboardPartDefinitions'

function createTestDefinition() {
  return createBreadboardPartDefinition({
    id: 'breadboard',
    name: 'Breadboard',
    imageSrc: '/breadboard.png',
    imageWidth: 1200,
    imageHeight: 420,
  })
}

describe('breadboardPartDefinitions', () => {
  it('creates the standard solderless breadboard regions by default', () => {
    const definition = createTestDefinition()

    expect(definition.metadata.kind).toBe('breadboard')
    expect(definition.metadata.regions).toHaveLength(4)
    expect(definition.metadata.template?.columnCount).toBe(60)
    expect(definition.points).toHaveLength(840)
  })

  it('assigns continuity groups per terminal column and per rail segment', () => {
    const definition = createTestDefinition()

    expect(definition.points.find((point) => point.id === 'A1')?.group).toBe('upper-terminal-strip:column:1')
    expect(definition.points.find((point) => point.id === 'E1')?.group).toBe('upper-terminal-strip:column:1')
    expect(definition.points.find((point) => point.id === 'F1')?.group).toBe('lower-terminal-strip:column:1')
    expect(definition.points.find((point) => point.id === 'top-power-rails:top-positive:1')?.group).toBe(
      'top-power-rails:top-positive:main',
    )
  })

  it('maps anchor positions with bilinear interpolation', () => {
    const position = fitAnchorPoint(
      [
        { key: 'topLeft', label: 'Top left', x: 0.1, y: 0.2 },
        { key: 'topRight', label: 'Top right', x: 0.9, y: 0.2 },
        { key: 'bottomLeft', label: 'Bottom left', x: 0.1, y: 0.8 },
        { key: 'bottomRight', label: 'Bottom right', x: 0.9, y: 0.8 },
      ],
      0.5,
      0.5,
    )

    expect(position.x).toBeCloseTo(0.5)
    expect(position.y).toBeCloseTo(0.5)
  })

  it('supports alternate board sizes through a configurable template column count', () => {
    const template = createStandardBreadboardTemplate(30)
    const definition = createBreadboardPartDefinition({
      id: 'small-board',
      name: 'Small Board',
      imageSrc: '/small-board.png',
      imageWidth: 800,
      imageHeight: 320,
      template,
    })

    expect(definition.metadata.template?.columnCount).toBe(30)
    expect(definition.metadata.regions?.[1]?.columns).toHaveLength(30)
  })

  it('moves regions by updating all anchor-mapped point coordinates', () => {
    const definition = createTestDefinition()
    const original = definition.points.find((point) => point.id === 'A1')
    const movedRegion = moveBreadboardRegion(definition, 'upper-terminal-strip', 0.01, 0.02)

    expect(movedRegion.points.find((point) => point.id === 'A1')?.x).toBeCloseTo((original?.x ?? 0) + 0.01)
    expect(movedRegion.points.find((point) => point.id === 'A1')?.y).toBeCloseTo((original?.y ?? 0) + 0.02)
  })

  it('updates row, column, and point offsets independently', () => {
    const definition = createTestDefinition()
    const original = definition.points.find((point) => point.id === 'A1')
    const rowMoved = moveBreadboardRow(definition, 'upper-terminal-strip', 'A', 0, 0.01)
    const columnMoved = moveBreadboardColumn(rowMoved, 'upper-terminal-strip', '1', 0.02)
    const pointMoved = moveBreadboardPoint(columnMoved, 'upper-terminal-strip', 'A1', 0.01, -0.01)

    expect(pointMoved.points.find((point) => point.id === 'A1')?.x).toBeCloseTo((original?.x ?? 0) + 0.03)
    expect(pointMoved.points.find((point) => point.id === 'A1')?.y).toBeCloseTo(original?.y ?? 0)
  })

  it('keeps generated point coordinates normalized', () => {
    const definition = createTestDefinition()

    definition.points.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
    })
  })
})
