/**
 * Shared math helpers for the "Grid fill" pin-point tool.
 *
 * The same logic powers both the breadboard pin-point editor (image-pixel
 * coordinates) and the module workspace (module-local mm coordinates). The
 * helpers are coordinate-system agnostic: the caller decides what the
 * `x`/`y` numbers mean.
 */

export type GridCorner = { x: number; y: number }

export type GridFillInput = {
  /** First user-picked corner (any of the four; treated as opposite of `corner2`). */
  corner1: GridCorner
  /** Diagonally opposite corner from `corner1`. */
  corner2: GridCorner
  /** Number of rows in the generated grid. Floored, minimum 1. */
  rows: number
  /** Number of columns in the generated grid. Floored, minimum 1. */
  cols: number
}

export type GridPoint = {
  x: number
  y: number
  /** Zero-based row index, top to bottom in the corner1->corner2 direction. */
  rowIndex: number
  /** Zero-based column index, left to right in the corner1->corner2 direction. */
  colIndex: number
}

export type GridFillResult = {
  points: GridPoint[]
  /** 2D matrix view of the same points, indexed as `rows[rowIndex][colIndex]`. */
  rows: GridPoint[][]
  /** Distance between adjacent rows along the y axis. Zero when `rows` is 1. */
  rowPitch: number
  /** Distance between adjacent columns along the x axis. Zero when `cols` is 1. */
  colPitch: number
}

/**
 * Generate evenly spaced points across an axis-aligned rectangle defined by
 * two opposite corners. The corners may be given in any order; the output is
 * always indexed top-left to bottom-right in the (x, y) sense.
 */
export function generatePinGrid({ corner1, corner2, rows, cols }: GridFillInput): GridFillResult {
  const safeRows = Math.max(1, Math.floor(rows))
  const safeCols = Math.max(1, Math.floor(cols))

  const minX = Math.min(corner1.x, corner2.x)
  const maxX = Math.max(corner1.x, corner2.x)
  const minY = Math.min(corner1.y, corner2.y)
  const maxY = Math.max(corner1.y, corner2.y)

  const colPitch = safeCols > 1 ? (maxX - minX) / (safeCols - 1) : 0
  const rowPitch = safeRows > 1 ? (maxY - minY) / (safeRows - 1) : 0

  const matrix: GridPoint[][] = []
  const points: GridPoint[] = []

  for (let rowIndex = 0; rowIndex < safeRows; rowIndex += 1) {
    const row: GridPoint[] = []
    const y = safeRows === 1 ? (minY + maxY) / 2 : minY + rowIndex * rowPitch
    for (let colIndex = 0; colIndex < safeCols; colIndex += 1) {
      const x = safeCols === 1 ? (minX + maxX) / 2 : minX + colIndex * colPitch
      const point: GridPoint = { x, y, rowIndex, colIndex }
      row.push(point)
      points.push(point)
    }
    matrix.push(row)
  }

  return { points, rows: matrix, rowPitch, colPitch }
}

export type DedupResult<TExisting> = {
  /** Existing points that survive (no new point lands within tolerance). */
  kept: TExisting[]
  /** IDs of existing points removed because a new point overlaps them. */
  removedIds: string[]
}

/**
 * Remove existing points whose `(x, y)` lies within `tolerance` of any point
 * in `newPoints`. The caller supplies `getXY` so this works for both pixel-
 * space `ConnectionPoint`s and mm-space `PhysicalPoint`s, and `getId` so it
 * works regardless of where the id lives.
 */
export function dedupAgainstExisting<TExisting>(
  existing: TExisting[],
  newPoints: ReadonlyArray<{ x: number; y: number }>,
  tolerance: number,
  getXY: (item: TExisting) => { x: number; y: number },
  getId: (item: TExisting) => string,
): DedupResult<TExisting> {
  if (tolerance <= 0 || newPoints.length === 0) {
    return { kept: existing, removedIds: [] }
  }
  const toleranceSq = tolerance * tolerance
  const kept: TExisting[] = []
  const removedIds: string[] = []

  for (const item of existing) {
    const { x, y } = getXY(item)
    let collides = false
    for (const candidate of newPoints) {
      const dx = candidate.x - x
      const dy = candidate.y - y
      if (dx * dx + dy * dy <= toleranceSq) {
        collides = true
        break
      }
    }
    if (collides) {
      removedIds.push(getId(item))
    } else {
      kept.push(item)
    }
  }

  return { kept, removedIds }
}
