/**
 * Compute which breadboard connection points are currently aligned with a
 * snap-eligible physical point of any placed module instance. A breadboard
 * pin is considered aligned when at least one module physical point falls
 * within `ALIGNMENT_THRESHOLD_MM` of it (after applying the module instance's
 * rotation about its center).
 */

import type { ConnectionPoint } from './breadboardDefinitionModel'
import type { ProjectModuleInstance } from './breadboardProjectModel'
import type { LibraryPartDefinition, PhysicalPoint } from './partLibraryModel'

/** Maximum distance, in millimeters, that still counts as "aligned". */
export const ALIGNMENT_THRESHOLD_MM = 1.3

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

    const widthPx = part.dimensions.widthMm * pixelsPerMm
    const heightPx = part.dimensions.heightMm * pixelsPerMm
    const angleRad = (instance.rotationDeg * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)

    for (const physPt of part.physicalPoints) {
      if (!isSnappablePoint(physPt)) {
        continue
      }

      const dx = physPt.xMm * pixelsPerMm - widthPx / 2
      const dy = physPt.yMm * pixelsPerMm - heightPx / 2
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
