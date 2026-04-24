import { describe, expect, it } from 'vitest'

import {
  applyBreadboardRegionAnchors,
  createBreadboardPartDefinition,
  moveBreadboardColumn,
  moveBreadboardPoint,
  moveBreadboardRegion,
  moveBreadboardRow,
  resetBreadboardRegion,
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

describe('createBreadboardPartDefinition', () => {
  it('creates all standard breadboard regions and point ids', () => {
    const definition = createTestDefinition()
    const pointIds = definition.points.map((point) => point.id)

    expect(definition.metadata.kind).toBe('breadboard')
    expect(definition.metadata.regions).toHaveLength(4)
    expect(definition.points).toHaveLength(840)
    expect(pointIds).toContain('A1')
    expect(pointIds).toContain('E60')
    expect(pointIds).toContain('F1')
    expect(pointIds).toContain('J60')
    expect(pointIds).toContain('top-positive-1')
    expect(pointIds).toContain('bottom-negative-60')
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

  it('fits the upper terminal block from explicit anchors', () => {
    const definition = createBreadboardPartDefinition({
      id: 'breadboard',
      name: 'Breadboard',
      imageSrc: '/breadboard.png',
      imageWidth: 1200,
      imageHeight: 420,
      regionAnchors: {
        'upper-terminal-block': [
          { key: 'topLeft', label: 'Top left', x: 0.1, y: 0.2 },
          { key: 'topRight', label: 'Top right', x: 0.9, y: 0.2 },
          { key: 'bottomLeft', label: 'Bottom left', x: 0.1, y: 0.4 },
          { key: 'bottomRight', label: 'Bottom right', x: 0.9, y: 0.4 },
        ],
      },
    })

    expect(definition.points.find((point) => point.id === 'A1')).toMatchObject({
      x: 0.1,
      y: 0.2,
    })
    expect(definition.points.find((point) => point.id === 'A60')).toMatchObject({
      x: 0.9,
      y: 0.2,
    })
    expect(definition.points.find((point) => point.id === 'E1')).toMatchObject({
      x: 0.1,
      y: 0.4,
    })
    expect(definition.points.find((point) => point.id === 'E60')).toMatchObject({
      x: 0.9,
      y: 0.4,
    })
  })

  it('moves region, row, column, and point coordinates as expected', () => {
    const definition = createTestDefinition()
    const originalA1 = definition.points.find((point) => point.id === 'A1')
    const originalA2 = definition.points.find((point) => point.id === 'A2')
    const originalB1 = definition.points.find((point) => point.id === 'B1')

    expect(originalA1).toBeDefined()
    expect(originalA2).toBeDefined()
    expect(originalB1).toBeDefined()

    const movedRegion = moveBreadboardRegion(definition, 'upper-terminal-block', 0.01, 0.02)
    expect(movedRegion.points.find((point) => point.id === 'A1')).toMatchObject({
      x: originalA1!.x + 0.01,
      y: originalA1!.y + 0.02,
    })

    const movedRow = moveBreadboardRow(definition, 'upper-terminal-block', 'A', 0.01)
    expect(movedRow.points.find((point) => point.id === 'A1')?.y).toBeCloseTo(originalA1!.y + 0.01)
    expect(movedRow.points.find((point) => point.id === 'B1')?.y).toBeCloseTo(originalB1!.y)

    const movedColumn = moveBreadboardColumn(definition, 'upper-terminal-block', '2', 0.01)
    expect(movedColumn.points.find((point) => point.id === 'A2')?.x).toBeCloseTo(originalA2!.x + 0.01)
    expect(movedColumn.points.find((point) => point.id === 'A1')?.x).toBeCloseTo(originalA1!.x)

    const movedPoint = moveBreadboardPoint(definition, 'A1', 0.01, 0.01)
    expect(movedPoint.points.find((point) => point.id === 'A1')).toMatchObject({
      x: originalA1!.x + 0.01,
      y: originalA1!.y + 0.01,
    })
  })

  it('resets a region back to its template anchors', () => {
    const definition = createTestDefinition()
    const adjusted = applyBreadboardRegionAnchors(definition, 'upper-terminal-block', [
      { key: 'topLeft', label: 'Top left', x: 0.2, y: 0.2 },
      { key: 'topRight', label: 'Top right', x: 0.8, y: 0.2 },
      { key: 'bottomLeft', label: 'Bottom left', x: 0.2, y: 0.45 },
      { key: 'bottomRight', label: 'Bottom right', x: 0.8, y: 0.45 },
    ])
    const reset = resetBreadboardRegion(adjusted, 'upper-terminal-block')

    expect(reset.points.find((point) => point.id === 'A1')).toMatchObject({
      x: 0.074,
      y: 0.268,
    })
  })
})
