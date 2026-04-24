export type Position = {
  x: number
  y: number
}

export type PartKind = 'breadboard' | 'microcontroller' | 'module' | 'sensor' | 'custom'

export type PartPointKind = 'breadboard-hole' | 'pin' | 'rail'

export type BreadboardRegionKind = 'terminal-strip' | 'power-rail' | 'custom-grid'

export type PartRegionAnchorKey = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export type PartRegionAnchor = {
  key: PartRegionAnchorKey
  label: string
  x: number
  y: number
}

export type PartAxisGroup = {
  id: string
  label: string
  pointIds: string[]
}

export type ConnectionPoint = {
  id: string
  label: string
  x: number
  y: number
  kind: PartPointKind
  group?: string
  regionId?: string
  rowId?: string
  columnId?: string
}

export type BreadboardRailSegment = {
  id: string
  label: string
  startColumn: number
  endColumn: number
  rowIds?: string[]
}

export type BreadboardPointDescriptor = {
  id: string
  label: string
}

export type BreadboardRegionTemplate = {
  id: string
  name: string
  kind: BreadboardRegionKind
  pointKind: PartPointKind
  rows: BreadboardPointDescriptor[]
  columnCount: number
  defaultAnchors: PartRegionAnchor[]
  railSegments?: BreadboardRailSegment[]
}

export type BreadboardTemplate = {
  id: string
  name: string
  columnCount: number
  regions: BreadboardRegionTemplate[]
}

export type RegionCalibration = {
  regionId: string
  anchors: PartRegionAnchor[]
  rowOffsets: Record<string, Position>
  columnOffsets: Record<string, Position>
  pointOffsets: Record<string, Position>
}

export type CalibrationState = {
  templateId: string
  columnCount: number
  regions: Record<string, RegionCalibration>
}

export type BreadboardRegion = {
  id: string
  name: string
  kind: BreadboardRegionKind
  pointIds: string[]
  rows: PartAxisGroup[]
  columns: PartAxisGroup[]
  anchors: PartRegionAnchor[]
  defaultAnchors: PartRegionAnchor[]
}

export type PartPoint = ConnectionPoint

export type PartRegion = BreadboardRegion

export type PartDefinition = {
  id: string
  name: string
  imageSrc: string
  imageWidth: number
  imageHeight: number
  points: ConnectionPoint[]
  metadata: {
    kind: PartKind
    regions?: BreadboardRegion[]
    template?: BreadboardTemplate
    calibration?: CalibrationState
  }
}

export type PlacedPart = {
  id: string
  definition: PartDefinition
  rotationDegrees?: number
}

export type WireEndpoint = {
  partInstanceId: string
  pointId: string
}

export type Wire = {
  id: string
  start: WireEndpoint
  end: WireEndpoint
  color?: string
}

export function clampNormalized(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function getPartPointById(definition: PartDefinition, pointId: string) {
  return definition.points.find((point) => point.id === pointId)
}

export function getPartRegion(definition: PartDefinition, regionId: string) {
  return definition.metadata.regions?.find((region) => region.id === regionId)
}

export function updatePartPoints(
  definition: PartDefinition,
  pointIds: string[],
  updater: (point: PartPoint) => PartPoint,
) {
  const pointIdSet = new Set(pointIds)

  return {
    ...definition,
    points: definition.points.map((point) => {
      if (!pointIdSet.has(point.id)) {
        return point
      }

      const nextPoint = updater(point)

      return {
        ...nextPoint,
        x: clampNormalized(nextPoint.x),
        y: clampNormalized(nextPoint.y),
      }
    }),
  }
}
