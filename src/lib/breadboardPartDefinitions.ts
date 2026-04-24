import {
  clampNormalized,
  getPartRegion,
  updatePartPoints,
  type PartAxisGroup,
  type PartDefinition,
  type PartPoint,
  type PartPointKind,
  type PartRegion,
  type PartRegionAnchor,
} from './parts'

type BreadboardPointLabel = {
  id: string
  label: string
}

type BreadboardRegionTemplate = {
  id: string
  name: string
  pointKind: PartPointKind
  columns: number
  rows: BreadboardPointLabel[]
  defaultAnchors: PartRegionAnchor[]
}

type BreadboardDefinitionOptions = {
  id: string
  name: string
  imageSrc?: string
  image?: string
  imageWidth: number
  imageHeight: number
  regionAnchors?: Record<string, PartRegionAnchor[]>
}

export const DEFAULT_BREADBOARD_IMAGE_WIDTH = 1200
export const DEFAULT_BREADBOARD_IMAGE_HEIGHT = 420

function createAnchor(
  key: PartRegionAnchor['key'],
  label: string,
  x: number,
  y: number,
): PartRegionAnchor {
  return {
    key,
    label,
    x,
    y,
  }
}

export const STANDARD_BREADBOARD_REGION_TEMPLATES: BreadboardRegionTemplate[] = [
  {
    id: 'top-power-rails',
    name: 'Top power rails',
    pointKind: 'rail',
    columns: 60,
    rows: [
      { id: 'top-positive', label: 'Top +' },
      { id: 'top-negative', label: 'Top -' },
    ],
    defaultAnchors: [
      createAnchor('topLeft', 'Top left', 0.074, 0.104),
      createAnchor('topRight', 'Top right', 0.925, 0.104),
      createAnchor('bottomLeft', 'Bottom left', 0.074, 0.17),
      createAnchor('bottomRight', 'Bottom right', 0.925, 0.17),
    ],
  },
  {
    id: 'upper-terminal-block',
    name: 'Upper terminal block',
    pointKind: 'breadboard-hole',
    columns: 60,
    rows: [
      { id: 'A', label: 'A' },
      { id: 'B', label: 'B' },
      { id: 'C', label: 'C' },
      { id: 'D', label: 'D' },
      { id: 'E', label: 'E' },
    ],
    defaultAnchors: [
      createAnchor('topLeft', 'Top left', 0.074, 0.268),
      createAnchor('topRight', 'Top right', 0.925, 0.268),
      createAnchor('bottomLeft', 'Bottom left', 0.074, 0.484),
      createAnchor('bottomRight', 'Bottom right', 0.925, 0.484),
    ],
  },
  {
    id: 'lower-terminal-block',
    name: 'Lower terminal block',
    pointKind: 'breadboard-hole',
    columns: 60,
    rows: [
      { id: 'F', label: 'F' },
      { id: 'G', label: 'G' },
      { id: 'H', label: 'H' },
      { id: 'I', label: 'I' },
      { id: 'J', label: 'J' },
    ],
    defaultAnchors: [
      createAnchor('topLeft', 'Top left', 0.074, 0.586),
      createAnchor('topRight', 'Top right', 0.925, 0.586),
      createAnchor('bottomLeft', 'Bottom left', 0.074, 0.802),
      createAnchor('bottomRight', 'Bottom right', 0.925, 0.802),
    ],
  },
  {
    id: 'bottom-power-rails',
    name: 'Bottom power rails',
    pointKind: 'rail',
    columns: 60,
    rows: [
      { id: 'bottom-positive', label: 'Bottom +' },
      { id: 'bottom-negative', label: 'Bottom -' },
    ],
    defaultAnchors: [
      createAnchor('topLeft', 'Top left', 0.074, 0.885),
      createAnchor('topRight', 'Top right', 0.925, 0.885),
      createAnchor('bottomLeft', 'Bottom left', 0.074, 0.95),
      createAnchor('bottomRight', 'Bottom right', 0.925, 0.95),
    ],
  },
]

function getAnchorMap(anchors: PartRegionAnchor[]) {
  const anchorMap = new Map(anchors.map((anchor) => [anchor.key, anchor]))

  const topLeft = anchorMap.get('topLeft')
  const topRight = anchorMap.get('topRight')
  const bottomLeft = anchorMap.get('bottomLeft')
  const bottomRight = anchorMap.get('bottomRight')

  if (!topLeft || !topRight || !bottomLeft || !bottomRight) {
    throw new Error('Breadboard regions require four anchors.')
  }

  return {
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
  }
}

export function fitAnchorPoint(
  anchors: PartRegionAnchor[],
  columnRatio: number,
  rowRatio: number,
) {
  const { topLeft, topRight, bottomLeft, bottomRight } = getAnchorMap(anchors)
  const topX = topLeft.x + (topRight.x - topLeft.x) * columnRatio
  const bottomX = bottomLeft.x + (bottomRight.x - bottomLeft.x) * columnRatio
  const topY = topLeft.y + (topRight.y - topLeft.y) * columnRatio
  const bottomY = bottomLeft.y + (bottomRight.y - bottomLeft.y) * columnRatio

  return {
    x: clampNormalized(topX + (bottomX - topX) * rowRatio),
    y: clampNormalized(topY + (bottomY - topY) * rowRatio),
  }
}

function buildBreadboardRegion(
  template: BreadboardRegionTemplate,
  anchors: PartRegionAnchor[],
) {
  const pointIdsByRow = new Map<string, string[]>()
  const pointIdsByColumn = new Map<string, string[]>()
  const points: PartPoint[] = []

  template.rows.forEach((row) => {
    pointIdsByRow.set(row.id, [])
  })

  Array.from({ length: template.columns }, (_, columnIndex) => {
    pointIdsByColumn.set(String(columnIndex + 1), [])
  })

  template.rows.forEach((row, rowIndex) => {
    const rowRatio = template.rows.length === 1 ? 0 : rowIndex / (template.rows.length - 1)

    for (let columnIndex = 0; columnIndex < template.columns; columnIndex += 1) {
      const columnRatio = template.columns === 1 ? 0 : columnIndex / (template.columns - 1)
      const position = fitAnchorPoint(anchors, columnRatio, rowRatio)
      const suffix = columnIndex + 1
      const pointId = template.pointKind === 'breadboard-hole' ? `${row.id}${suffix}` : `${row.id}-${suffix}`
      const pointLabel = template.pointKind === 'breadboard-hole' ? `${row.label}${suffix}` : `${row.label} ${suffix}`
      const columnId = String(suffix)

      points.push({
        id: pointId,
        label: pointLabel,
        x: position.x,
        y: position.y,
        kind: template.pointKind,
        group: template.id,
      })

      pointIdsByRow.get(row.id)?.push(pointId)
      pointIdsByColumn.get(columnId)?.push(pointId)
    }
  })

  const rows: PartAxisGroup[] = template.rows.map((row) => ({
    id: row.id,
    label: row.label,
    pointIds: pointIdsByRow.get(row.id) ?? [],
  }))

  const columns: PartAxisGroup[] = Array.from({ length: template.columns }, (_, index) => ({
    id: String(index + 1),
    label: String(index + 1),
    pointIds: pointIdsByColumn.get(String(index + 1)) ?? [],
  }))

  const region: PartRegion = {
    id: template.id,
    name: template.name,
    pointIds: points.map((point) => point.id),
    rows,
    columns,
    anchors,
    defaultAnchors: template.defaultAnchors,
  }

  return {
    points,
    region,
  }
}

export function createBreadboardPartDefinition({
  id,
  name,
  imageSrc,
  image,
  imageWidth,
  imageHeight,
  regionAnchors,
}: BreadboardDefinitionOptions): PartDefinition {
  const nextRegions = STANDARD_BREADBOARD_REGION_TEMPLATES.map((template) =>
    buildBreadboardRegion(template, regionAnchors?.[template.id] ?? template.defaultAnchors),
  )

  return {
    id,
    name,
    imageSrc: imageSrc ?? image ?? '',
    imageWidth,
    imageHeight,
    points: nextRegions.flatMap((entry) => entry.points),
    metadata: {
      kind: 'breadboard',
      regions: nextRegions.map((entry) => entry.region),
    },
  }
}

function replaceRegionPoints(
  definition: PartDefinition,
  regionId: string,
  nextRegion: PartRegion,
  nextPoints: PartPoint[],
) {
  const currentRegion = getPartRegion(definition, regionId)

  if (!currentRegion) {
    return definition
  }

  const regionPointIds = new Set(currentRegion.pointIds)

  return {
    ...definition,
    points: [
      ...definition.points.filter((point) => !regionPointIds.has(point.id)),
      ...nextPoints,
    ],
    metadata: {
      ...definition.metadata,
      regions: definition.metadata.regions?.map((region) =>
        region.id === regionId ? nextRegion : region,
      ),
    },
  }
}

export function applyBreadboardRegionAnchors(
  definition: PartDefinition,
  regionId: string,
  anchors: PartRegionAnchor[],
) {
  const template = STANDARD_BREADBOARD_REGION_TEMPLATES.find((entry) => entry.id === regionId)

  if (!template) {
    return definition
  }

  const nextRegion = buildBreadboardRegion(template, anchors)

  return replaceRegionPoints(definition, regionId, nextRegion.region, nextRegion.points)
}

export function resetBreadboardRegion(definition: PartDefinition, regionId: string) {
  const template = STANDARD_BREADBOARD_REGION_TEMPLATES.find((entry) => entry.id === regionId)

  if (!template) {
    return definition
  }

  return applyBreadboardRegionAnchors(definition, regionId, template.defaultAnchors)
}

export function moveBreadboardRegion(
  definition: PartDefinition,
  regionId: string,
  dx: number,
  dy: number,
) {
  const region = getPartRegion(definition, regionId)

  if (!region) {
    return definition
  }

  const movedDefinition = updatePartPoints(definition, region.pointIds, (point) => ({
    ...point,
    x: point.x + dx,
    y: point.y + dy,
  }))

  return {
    ...movedDefinition,
    metadata: {
      ...movedDefinition.metadata,
      regions: movedDefinition.metadata.regions?.map((entry) => {
        if (entry.id !== regionId) {
          return entry
        }

        return {
          ...entry,
          anchors: entry.anchors.map((anchor) => ({
            ...anchor,
            x: clampNormalized(anchor.x + dx),
            y: clampNormalized(anchor.y + dy),
          })),
        }
      }),
    },
  }
}

export function moveBreadboardRow(
  definition: PartDefinition,
  regionId: string,
  rowId: string,
  dy: number,
) {
  const row = getPartRegion(definition, regionId)?.rows.find((entry) => entry.id === rowId)

  if (!row) {
    return definition
  }

  return updatePartPoints(definition, row.pointIds, (point) => ({
    ...point,
    y: point.y + dy,
  }))
}

export function moveBreadboardColumn(
  definition: PartDefinition,
  regionId: string,
  columnId: string,
  dx: number,
) {
  const column = getPartRegion(definition, regionId)?.columns.find(
    (entry) => entry.id === columnId,
  )

  if (!column) {
    return definition
  }

  return updatePartPoints(definition, column.pointIds, (point) => ({
    ...point,
    x: point.x + dx,
  }))
}

export function moveBreadboardPoint(
  definition: PartDefinition,
  pointId: string,
  dx: number,
  dy: number,
) {
  return updatePartPoints(definition, [pointId], (point) => ({
    ...point,
    x: point.x + dx,
    y: point.y + dy,
  }))
}
