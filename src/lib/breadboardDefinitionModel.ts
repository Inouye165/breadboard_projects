export type ConnectionPoint = {
  id: string
  label: string
  x: number
  y: number
  kind: 'breadboard-hole' | 'pin' | 'rail'
  confidence?: number
  snapSource?: 'detected-hole' | 'manual'
}

/**
 * Two-point scale calibration stored on the breadboard definition.
 * x1/y1 and x2/y2 are in image-pixel space (same coordinate system as
 * ConnectionPoint x/y).  realDistanceMm is the known real-world distance
 * between those two points in millimetres.
 */
export type ScaleCalibration = {
  x1: number
  y1: number
  x2: number
  y2: number
  realDistanceMm: number
}

export type BreadboardDefinition = {
  id: string
  name: string
  imageName: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  points: ConnectionPoint[]
  scaleCalibration?: ScaleCalibration
  createdAt: string
  updatedAt: string
}

type BreadboardDefinitionDraft = Partial<Omit<BreadboardDefinition, 'points'>> & {
  points?: ConnectionPoint[]
}

function createDefinitionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `breadboard-definition-${Date.now()}`
}

export function cloneConnectionPoint(point: ConnectionPoint): ConnectionPoint {
  return {
    ...point,
  }
}

export function cloneBreadboardDefinition(definition: BreadboardDefinition): BreadboardDefinition {
  return {
    ...definition,
    points: definition.points.map(cloneConnectionPoint),
    scaleCalibration: definition.scaleCalibration ? { ...definition.scaleCalibration } : undefined,
  }
}

export function createEmptyBreadboardDefinition(
  definition: BreadboardDefinitionDraft = {},
): BreadboardDefinition {
  const timestamp = definition.createdAt ?? definition.updatedAt ?? new Date().toISOString()

  return {
    id: definition.id ?? createDefinitionId(),
    name: definition.name ?? 'Untitled breadboard definition',
    imageName: definition.imageName ?? '',
    imagePath: definition.imagePath ?? '',
    imageWidth: definition.imageWidth ?? 0,
    imageHeight: definition.imageHeight ?? 0,
    points: definition.points?.map(cloneConnectionPoint) ?? [],
    scaleCalibration: definition.scaleCalibration ? { ...definition.scaleCalibration } : undefined,
    createdAt: definition.createdAt ?? timestamp,
    updatedAt: definition.updatedAt ?? timestamp,
  }
}