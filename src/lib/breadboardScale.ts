/**
 * Helpers to derive a physical scale (pixels per millimeter) for a breadboard
 * image so that library modules can be rendered at a consistent scale.
 *
 * Standard breadboards use a 0.1 inch (2.54 mm) hole pitch. We estimate
 * pixels-per-millimeter by measuring the median nearest-neighbor distance
 * between connection points and dividing by the standard pitch. When too few
 * points are available we fall back to a sensible default so the UI still
 * renders something usable.
 */

import type { BreadboardDefinition, ConnectionPoint } from './breadboardDefinitionModel'

import { DEFAULT_PIN_PITCH_MM } from './partLibraryModel'

const FALLBACK_PIXELS_PER_MM = 10

function median(values: number[]) {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }

  return sorted[middle]
}

function nearestNeighborDistance(point: ConnectionPoint, others: ConnectionPoint[]) {
  let best = Number.POSITIVE_INFINITY

  for (const other of others) {
    if (other.id === point.id) {
      continue
    }

    const dx = other.x - point.x
    const dy = other.y - point.y
    const distance = Math.hypot(dx, dy)

    if (distance > 0 && distance < best) {
      best = distance
    }
  }

  return best === Number.POSITIVE_INFINITY ? 0 : best
}

/**
 * Estimate pixels-per-millimeter for a breadboard.
 *
 * If the breadboard has a manual `scaleCalibration` (two clicked points with a
 * known real-world distance) that value is used directly — it will be accurate
 * and reliable.
 *
 * Otherwise we fall back to the median nearest-neighbor heuristic: we assume
 * the median distance between adjacent connection points equals the standard
 * breadboard pin pitch (2.54 mm / 0.1 inch).
 */
export function estimatePixelsPerMm(breadboard: BreadboardDefinition): number {
  if (breadboard.scaleCalibration) {
    const { x1, y1, x2, y2, realDistanceMm } = breadboard.scaleCalibration
    const pixelDistance = Math.hypot(x2 - x1, y2 - y1)

    if (pixelDistance > 0 && realDistanceMm > 0) {
      return pixelDistance / realDistanceMm
    }
  }

  const points = breadboard.points

  if (points.length < 2) {
    return FALLBACK_PIXELS_PER_MM
  }

  const distances = points
    .map((point) => nearestNeighborDistance(point, points))
    .filter((distance) => distance > 0)

  if (distances.length === 0) {
    return FALLBACK_PIXELS_PER_MM
  }

  const medianPx = median(distances)

  if (medianPx <= 0) {
    return FALLBACK_PIXELS_PER_MM
  }

  return medianPx / DEFAULT_PIN_PITCH_MM
}
