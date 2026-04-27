export type ConnectionPoint = {
  id: string
  label: string
  x: number
  y: number
  kind: 'breadboard-hole' | 'pin' | 'rail'
  confidence?: number
  snapSource?: 'detected-hole' | 'manual'
}

export type BreadboardDefinition = {
  id: string
  name: string
  imageName: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  points: ConnectionPoint[]
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
    createdAt: definition.createdAt ?? timestamp,
    updatedAt: definition.updatedAt ?? timestamp,
  }
}