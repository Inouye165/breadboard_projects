import { describe, expect, it } from 'vitest'

import { dedupAgainstExisting, generatePinGrid } from './pinGrid'

describe('generatePinGrid', () => {
  it('places a 5x63 grid evenly between two corners', () => {
    const result = generatePinGrid({
      corner1: { x: 0, y: 0 },
      corner2: { x: 620, y: 40 },
      rows: 5,
      cols: 63,
    })

    expect(result.points).toHaveLength(5 * 63)
    expect(result.colPitch).toBeCloseTo(10)
    expect(result.rowPitch).toBeCloseTo(10)

    const first = result.rows[0][0]
    const last = result.rows[4][62]
    expect(first.x).toBeCloseTo(0)
    expect(first.y).toBeCloseTo(0)
    expect(last.x).toBeCloseTo(620)
    expect(last.y).toBeCloseTo(40)
  })

  it('normalizes corner order (works regardless of which corner comes first)', () => {
    const a = generatePinGrid({
      corner1: { x: 0, y: 0 },
      corner2: { x: 100, y: 100 },
      rows: 3,
      cols: 3,
    })
    const b = generatePinGrid({
      corner1: { x: 100, y: 100 },
      corner2: { x: 0, y: 0 },
      rows: 3,
      cols: 3,
    })
    expect(b.rows[0][0].x).toBeCloseTo(a.rows[0][0].x)
    expect(b.rows[2][2].y).toBeCloseTo(a.rows[2][2].y)
  })

  it('handles a single row (1xN strip) by centering on y midpoint', () => {
    const result = generatePinGrid({
      corner1: { x: 0, y: 10 },
      corner2: { x: 30, y: 30 },
      rows: 1,
      cols: 4,
    })
    expect(result.points).toHaveLength(4)
    expect(result.rowPitch).toBe(0)
    expect(result.colPitch).toBeCloseTo(10)
    for (const p of result.points) {
      expect(p.y).toBeCloseTo(20)
    }
  })

  it('clamps non-positive counts to 1', () => {
    const result = generatePinGrid({
      corner1: { x: 0, y: 0 },
      corner2: { x: 10, y: 10 },
      rows: 0,
      cols: -3,
    })
    expect(result.points).toHaveLength(1)
  })

  it('records row/col indices that match the matrix layout', () => {
    const result = generatePinGrid({
      corner1: { x: 0, y: 0 },
      corner2: { x: 20, y: 10 },
      rows: 2,
      cols: 3,
    })
    expect(result.rows[1][2].rowIndex).toBe(1)
    expect(result.rows[1][2].colIndex).toBe(2)
  })
})

describe('dedupAgainstExisting', () => {
  type Item = { id: string; x: number; y: number }
  const getXY = (i: Item) => ({ x: i.x, y: i.y })
  const getId = (i: Item) => i.id

  it('removes existing items within tolerance and reports their ids', () => {
    const existing: Item[] = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 500, y: 500 },
    ]
    const result = dedupAgainstExisting(
      existing,
      [{ x: 102, y: 99 }],
      5,
      getXY,
      getId,
    )
    expect(result.kept.map((i) => i.id)).toEqual(['b'])
    expect(result.removedIds).toEqual(['a'])
  })

  it('keeps everything when no new points are within tolerance', () => {
    const existing: Item[] = [{ id: 'a', x: 0, y: 0 }]
    const result = dedupAgainstExisting(
      existing,
      [{ x: 50, y: 50 }],
      5,
      getXY,
      getId,
    )
    expect(result.kept).toEqual(existing)
    expect(result.removedIds).toEqual([])
  })

  it('returns existing untouched when tolerance is 0 or newPoints empty', () => {
    const existing: Item[] = [{ id: 'a', x: 0, y: 0 }]
    expect(dedupAgainstExisting(existing, [{ x: 0, y: 0 }], 0, getXY, getId).removedIds).toEqual([])
    expect(dedupAgainstExisting(existing, [], 5, getXY, getId).kept).toEqual(existing)
  })
})
