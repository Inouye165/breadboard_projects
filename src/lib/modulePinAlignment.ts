/**
 * Compute which breadboard connection points are currently aligned with a
 * snap-eligible physical point of any placed module instance. A breadboard
 * pin is considered aligned when at least one module physical point falls
 * within `ALIGNMENT_THRESHOLD_MM` of it (after applying the module instance's
 * rotation about its center).
 */

import type {
  BreadboardDefinition,
  ConnectionPoint,
  DefinitionAxisGroup,
} from './breadboardDefinitionModel'
import type { ProjectModuleInstance, Wire } from './breadboardProjectModel'
import type { LibraryPartDefinition, PartImageView, PhysicalPoint } from './partLibraryModel'
import { mmToImagePoint } from './partLibraryModel'

/**
 * Axis-aligned bounding box (in image pixel space) of the calibration
 * quadrilateral. The displayed module rectangle is sized to fit the part's
 * physical dimensions, and the source image is positioned/scaled so this
 * bounding box exactly fills it.
 */
export function getCalibrationPixelBounds(view: PartImageView | undefined) {
  if (!view?.calibration) {
    return null
  }
  const { topLeft, topRight, bottomRight, bottomLeft } = view.calibration.corners
  const xs = [topLeft.x, topRight.x, bottomRight.x, bottomLeft.x]
  const ys = [topLeft.y, topRight.y, bottomRight.y, bottomLeft.y]
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  if (right <= left || bottom <= top) {
    return null
  }
  return { left, right, top, bottom, width: right - left, height: bottom - top }
}

/**
 * Find the part image view that owns this physical point (falls back to the
 * first view if no exact match exists, for backwards compatibility with
 * legacy parts authored before per-view IDs were enforced).
 */
export function getViewForPoint(
  part: LibraryPartDefinition,
  physPt: PhysicalPoint,
): PartImageView | undefined {
  return part.imageViews.find((view) => view.id === physPt.viewId) ?? part.imageViews[0]
}

/**
 * Pre-rotation pixel offset of a physical point from the module's center,
 * matching exactly how the displayed module image is laid out in the project
 * canvas. The module image is always rendered to fill the part's
 * `widthPx x heightPx` footprint (the outline rectangle), so we map the
 * point's mm position through the calibration to image-pixel coords, then
 * uniformly scale image-pixel coords into that footprint.
 */
export function getPhysicalPointModuleOffsetPx(
  physPt: PhysicalPoint,
  part: LibraryPartDefinition,
  pixelsPerMm: number,
): { dx: number; dy: number } {
  const widthPx = part.dimensions.widthMm * pixelsPerMm
  const heightPx = part.dimensions.heightMm * pixelsPerMm
  const view = getViewForPoint(part, physPt)
  if (view?.calibration && view.imageWidth > 0 && view.imageHeight > 0) {
    const imgPx = mmToImagePoint(view.calibration, { xMm: physPt.xMm, yMm: physPt.yMm })
    const sx = widthPx / view.imageWidth
    const sy = heightPx / view.imageHeight
    return {
      dx: imgPx.x * sx - widthPx / 2,
      dy: imgPx.y * sy - heightPx / 2,
    }
  }
  return {
    dx: physPt.xMm * pixelsPerMm - widthPx / 2,
    dy: physPt.yMm * pixelsPerMm - heightPx / 2,
  }
}

/**
 * Maximum distance, in millimeters, that still counts as "aligned" - i.e.
 * close enough that a real header pin would slide into that breadboard hole.
 * Standard pitch is 2.54mm; this threshold is a bit under a full pitch so a
 * pin matches whichever hole is clearly the closest, without needing to be
 * dead-center on it (real boards bend, real headers are imperfect).
 */
export const ALIGNMENT_THRESHOLD_MM = 2.0

function isSnappablePoint(point: PhysicalPoint) {
  return point.throughHole === true || point.kind === 'header-pin'
}

export function computeAlignedBreadboardPinIds(
  modules: ProjectModuleInstance[],
  libraryPartIndex: Map<string, LibraryPartDefinition>,
  breadboardPoints: ConnectionPoint[],
  pixelsPerMm: number,
  thresholdMm: number = ALIGNMENT_THRESHOLD_MM,
): Set<string> {
  const aligned = new Set<string>()

  if (modules.length === 0 || breadboardPoints.length === 0 || pixelsPerMm <= 0) {
    return aligned
  }

  const thresholdPx = thresholdMm * pixelsPerMm
  const thresholdSq = thresholdPx * thresholdPx

  for (const instance of modules) {
    const part = libraryPartIndex.get(instance.libraryPartId)

    if (!part) {
      continue
    }

    const angleRad = (instance.rotationDeg * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)

    for (const physPt of part.physicalPoints) {
      if (!isSnappablePoint(physPt)) {
        continue
      }

      const { dx, dy } = getPhysicalPointModuleOffsetPx(physPt, part, pixelsPerMm)
      const rotDx = dx * cosA - dy * sinA
      const rotDy = dx * sinA + dy * cosA
      const absX = instance.centerX + rotDx
      const absY = instance.centerY + rotDy

      for (const boardPt of breadboardPoints) {
        const distSq = (boardPt.x - absX) ** 2 + (boardPt.y - absY) ** 2

        if (distSq <= thresholdSq) {
          aligned.add(boardPt.id)
        }
      }
    }
  }

  return aligned
}

/**
 * Compute the set of breadboard pin IDs that lie underneath the footprint
 * (axis-aligned bounding rectangle, rotated about the module center) of any
 * placed module instance. Used to hide pin markers that would otherwise
 * render on top of the module image.
 */
export function computeCoveredBreadboardPinIds(
  modules: ProjectModuleInstance[],
  libraryPartIndex: Map<string, LibraryPartDefinition>,
  breadboardPoints: ConnectionPoint[],
  pixelsPerMm: number,
): Set<string> {
  const covered = new Set<string>()

  if (modules.length === 0 || breadboardPoints.length === 0 || pixelsPerMm <= 0) {
    return covered
  }

  for (const instance of modules) {
    const part = libraryPartIndex.get(instance.libraryPartId)

    if (!part) {
      continue
    }

    const halfWidth = (part.dimensions.widthMm * pixelsPerMm) / 2
    const halfHeight = (part.dimensions.heightMm * pixelsPerMm) / 2

    if (halfWidth <= 0 || halfHeight <= 0) {
      continue
    }

    const angleRad = (instance.rotationDeg * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)

    for (const boardPt of breadboardPoints) {
      // Translate breadboard pin into module-local (un-rotated) space.
      const dx = boardPt.x - instance.centerX
      const dy = boardPt.y - instance.centerY
      // Inverse rotation: rotate by -angle.
      const localX = dx * cosA + dy * sinA
      const localY = -dx * sinA + dy * cosA

      if (
        localX >= -halfWidth &&
        localX <= halfWidth &&
        localY >= -halfHeight &&
        localY <= halfHeight
      ) {
        covered.add(boardPt.id)
      }
    }
  }

  return covered
}

/**
 * Expand a set of seed pin IDs to include every pin that is electrically
 * connected to any seed pin. Connectivity is the transitive closure over:
 *   - Breadboard region row groups (points within a row group are linked).
 *   - Breadboard region column groups (points within a column group are linked).
 *   - Project wires (a wire links its two endpoint pins).
 */
export function computeElectricallyConnectedPinIds(
  seedPinIds: Iterable<string>,
  breadboard: BreadboardDefinition,
  wires: Wire[] = [],
): Set<string> {
  const seeds = new Set(seedPinIds)

  if (seeds.size === 0) {
    return seeds
  }

  // Build adjacency: for each pin, the set of directly connected pins.
  const adjacency = new Map<string, Set<string>>()

  function link(a: string, b: string) {
    if (a === b) {
      return
    }
    let neighborsA = adjacency.get(a)
    if (!neighborsA) {
      neighborsA = new Set()
      adjacency.set(a, neighborsA)
    }
    neighborsA.add(b)
    let neighborsB = adjacency.get(b)
    if (!neighborsB) {
      neighborsB = new Set()
      adjacency.set(b, neighborsB)
    }
    neighborsB.add(a)
  }

  function linkGroup(group: DefinitionAxisGroup) {
    const ids = group.pointIds
    if (ids.length < 2) {
      return
    }
    const anchor = ids[0]
    for (let index = 1; index < ids.length; index += 1) {
      link(anchor, ids[index])
    }
  }

  for (const region of breadboard.regions ?? []) {
    for (const row of region.rows) {
      linkGroup(row)
    }
    for (const column of region.columns) {
      linkGroup(column)
    }
  }

  // Also link by point-level rowId / columnId. This catches boards whose
  // grid was authored without explicit `region.rows` / `region.columns`
  // axis groups (e.g. older definitions where only the per-point
  // `rowId` / `columnId` markers were saved).
  const rowBuckets = new Map<string, string[]>()
  const columnBuckets = new Map<string, string[]>()

  for (const point of breadboard.points) {
    if (point.rowId) {
      const bucket = rowBuckets.get(point.rowId) ?? []
      bucket.push(point.id)
      rowBuckets.set(point.rowId, bucket)
    }
    if (point.columnId) {
      const bucket = columnBuckets.get(point.columnId) ?? []
      bucket.push(point.id)
      columnBuckets.set(point.columnId, bucket)
    }
  }

  function linkBucket(ids: string[]) {
    if (ids.length < 2) {
      return
    }
    const anchor = ids[0]
    for (let index = 1; index < ids.length; index += 1) {
      link(anchor, ids[index])
    }
  }

  for (const ids of rowBuckets.values()) {
    linkBucket(ids)
  }
  for (const ids of columnBuckets.values()) {
    linkBucket(ids)
  }

  for (const wire of wires) {
    link(wire.fromPointId, wire.toPointId)
  }

  // BFS from every seed to collect the closure.
  const connected = new Set<string>(seeds)
  const queue: string[] = [...seeds]

  while (queue.length > 0) {
    const current = queue.shift() as string
    const neighbors = adjacency.get(current)
    if (!neighbors) {
      continue
    }
    for (const neighbor of neighbors) {
      if (!connected.has(neighbor)) {
        connected.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return connected
}

/**
 * Partition every breadboard point into electrical groups using the same
 * connectivity rules as `computeElectricallyConnectedPinIds`. Returns one
 * `Set<string>` of point IDs per connected component (groups of size 1 are
 * also returned so callers can choose how to render isolated pins).
 */
export function computeElectricalGroups(
  breadboard: BreadboardDefinition,
  wires: Wire[] = [],
): Set<string>[] {
  const adjacency = new Map<string, Set<string>>()

  function ensure(id: string) {
    let bucket = adjacency.get(id)
    if (!bucket) {
      bucket = new Set()
      adjacency.set(id, bucket)
    }
    return bucket
  }

  function link(a: string, b: string) {
    if (a === b) {
      return
    }
    ensure(a).add(b)
    ensure(b).add(a)
  }

  function linkAll(ids: string[]) {
    if (ids.length < 2) {
      ids.forEach(ensure)
      return
    }
    const anchor = ids[0]
    ensure(anchor)
    for (let index = 1; index < ids.length; index += 1) {
      link(anchor, ids[index])
    }
  }

  for (const region of breadboard.regions ?? []) {
    for (const row of region.rows) {
      linkAll(row.pointIds)
    }
    for (const column of region.columns) {
      linkAll(column.pointIds)
    }
  }

  const rowBuckets = new Map<string, string[]>()
  const columnBuckets = new Map<string, string[]>()
  for (const point of breadboard.points) {
    ensure(point.id)
    if (point.rowId) {
      const bucket = rowBuckets.get(point.rowId) ?? []
      bucket.push(point.id)
      rowBuckets.set(point.rowId, bucket)
    }
    if (point.columnId) {
      const bucket = columnBuckets.get(point.columnId) ?? []
      bucket.push(point.id)
      columnBuckets.set(point.columnId, bucket)
    }
  }
  for (const ids of rowBuckets.values()) {
    linkAll(ids)
  }
  for (const ids of columnBuckets.values()) {
    linkAll(ids)
  }

  for (const wire of wires) {
    link(wire.fromPointId, wire.toPointId)
  }

  const visited = new Set<string>()
  const groups: Set<string>[] = []

  for (const point of breadboard.points) {
    if (visited.has(point.id)) {
      continue
    }
    const group = new Set<string>()
    const queue: string[] = [point.id]
    while (queue.length > 0) {
      const current = queue.shift() as string
      if (visited.has(current)) {
        continue
      }
      visited.add(current)
      group.add(current)
      const neighbors = adjacency.get(current)
      if (!neighbors) {
        continue
      }
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor)
        }
      }
    }
    groups.push(group)
  }

  return groups
}
