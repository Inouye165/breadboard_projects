import {
  clampNormalized,
  getPartRegion,
  updatePartPoints,
  type BreadboardRegionKind,
  type BreadboardRegionTemplate,
  type BreadboardTemplate,
  type CalibrationState,
  type PartAxisGroup,
  type PartDefinition,
  type PartPoint,
  type PartPointKind,
  type PartRegion,
  type PartRegionAnchor,
  type RegionCalibration,
} from './parts'

type BreadboardDefinitionOptions = {
  id: string
  name: string
  imageSrc?: string
  image?: string
  imageWidth: number
  imageHeight: number
  template?: BreadboardTemplate
  calibration?: CalibrationState
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

function cloneAnchors(anchors: PartRegionAnchor[]) {
  return anchors.map((anchor) => ({ ...anchor }))
}

function rotatePosition(x: number, y: number, centerX: number, centerY: number, radians: number) {
  const translatedX = x - centerX
  const translatedY = y - centerY
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  return {
    x: clampNormalized(centerX + translatedX * cos - translatedY * sin),
    y: clampNormalized(centerY + translatedX * sin + translatedY * cos),
  }
}

function getAnchorCenter(anchors: PartRegionAnchor[]) {
  const total = anchors.reduce(
    (accumulator, anchor) => ({
      x: accumulator.x + anchor.x,
      y: accumulator.y + anchor.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: total.x / anchors.length,
    y: total.y / anchors.length,
  }
}

function createRegionTemplate(
  id: string,
  name: string,
  kind: BreadboardRegionKind,
  pointKind: PartPointKind,
  columnCount: number,
  rows: Array<{ id: string; label: string }>,
  defaultAnchors: PartRegionAnchor[],
) {
  return {
    id,
    name,
    kind,
    pointKind,
    columnCount,
    rows,
    defaultAnchors,
  } satisfies BreadboardRegionTemplate
}

export function createStandardBreadboardTemplate(columnCount = 60): BreadboardTemplate {
  return {
    id: `standard-solderless-${columnCount}`,
    name: `Standard solderless breadboard (${columnCount} columns)`,
    columnCount,
    regions: [
      {
        ...createRegionTemplate(
          'top-power-rails',
          'Top power rails',
          'power-rail',
          'rail',
          columnCount,
          [
            { id: 'top-positive', label: 'Top +' },
            { id: 'top-negative', label: 'Top -' },
          ],
          [
            createAnchor('topLeft', 'Top left', 0.074, 0.104),
            createAnchor('topRight', 'Top right', 0.925, 0.104),
            createAnchor('bottomLeft', 'Bottom left', 0.074, 0.17),
            createAnchor('bottomRight', 'Bottom right', 0.925, 0.17),
          ],
        ),
        railSegments: [
          {
            id: 'main',
            label: 'Main rail',
            startColumn: 1,
            endColumn: columnCount,
          },
        ],
      },
      createRegionTemplate(
        'upper-terminal-strip',
        'Upper terminal strip',
        'terminal-strip',
        'breadboard-hole',
        columnCount,
        [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
          { id: 'D', label: 'D' },
          { id: 'E', label: 'E' },
        ],
        [
          createAnchor('topLeft', 'Top left', 0.074, 0.268),
          createAnchor('topRight', 'Top right', 0.925, 0.268),
          createAnchor('bottomLeft', 'Bottom left', 0.074, 0.484),
          createAnchor('bottomRight', 'Bottom right', 0.925, 0.484),
        ],
      ),
      createRegionTemplate(
        'lower-terminal-strip',
        'Lower terminal strip',
        'terminal-strip',
        'breadboard-hole',
        columnCount,
        [
          { id: 'F', label: 'F' },
          { id: 'G', label: 'G' },
          { id: 'H', label: 'H' },
          { id: 'I', label: 'I' },
          { id: 'J', label: 'J' },
        ],
        [
          createAnchor('topLeft', 'Top left', 0.074, 0.586),
          createAnchor('topRight', 'Top right', 0.925, 0.586),
          createAnchor('bottomLeft', 'Bottom left', 0.074, 0.802),
          createAnchor('bottomRight', 'Bottom right', 0.925, 0.802),
        ],
      ),
      {
        ...createRegionTemplate(
          'bottom-power-rails',
          'Bottom power rails',
          'power-rail',
          'rail',
          columnCount,
          [
            { id: 'bottom-positive', label: 'Bottom +' },
            { id: 'bottom-negative', label: 'Bottom -' },
          ],
          [
            createAnchor('topLeft', 'Top left', 0.074, 0.885),
            createAnchor('topRight', 'Top right', 0.925, 0.885),
            createAnchor('bottomLeft', 'Bottom left', 0.074, 0.95),
            createAnchor('bottomRight', 'Bottom right', 0.925, 0.95),
          ],
        ),
        railSegments: [
          {
            id: 'main',
            label: 'Main rail',
            startColumn: 1,
            endColumn: columnCount,
          },
        ],
      },
    ],
  }
}

export function createCalibrationState(template: BreadboardTemplate): CalibrationState {
  return {
    templateId: template.id,
    columnCount: template.columnCount,
    regions: Object.fromEntries(
      template.regions.map((region) => [
        region.id,
        {
          regionId: region.id,
          anchors: cloneAnchors(region.defaultAnchors),
          rowOffsets: {},
          columnOffsets: {},
          pointOffsets: {},
        } satisfies RegionCalibration,
      ]),
    ),
  }
}

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

function getContinuityGroup(
  template: BreadboardRegionTemplate,
  rowId: string,
  columnNumber: number,
) {
  if (template.kind === 'terminal-strip') {
    return `${template.id}:column:${columnNumber}`
  }

  const segment = template.railSegments?.find((entry) => {
    const rowMatches = !entry.rowIds || entry.rowIds.includes(rowId)

    return rowMatches && columnNumber >= entry.startColumn && columnNumber <= entry.endColumn
  })

  return `${template.id}:${rowId}:${segment?.id ?? 'main'}`
}

function getTemplate(definition: PartDefinition) {
  return definition.metadata.template ?? createStandardBreadboardTemplate()
}

function getCalibration(definition: PartDefinition, template: BreadboardTemplate) {
  return definition.metadata.calibration ?? createCalibrationState(template)
}

function getRegionCalibration(template: BreadboardRegionTemplate, calibration: CalibrationState) {
  return calibration.regions[template.id] ?? {
    regionId: template.id,
    anchors: cloneAnchors(template.defaultAnchors),
    rowOffsets: {},
    columnOffsets: {},
    pointOffsets: {},
  }
}

function buildBreadboardRegion(
  template: BreadboardRegionTemplate,
  regionCalibration: RegionCalibration,
) {
  const pointIdsByRow = new Map<string, string[]>()
  const pointIdsByColumn = new Map<string, string[]>()
  const points: PartPoint[] = []

  template.rows.forEach((row) => {
    pointIdsByRow.set(row.id, [])
  })

  Array.from({ length: template.columnCount }, (_, columnIndex) => {
    pointIdsByColumn.set(String(columnIndex + 1), [])
  })

  template.rows.forEach((row, rowIndex) => {
    const rowRatio = template.rows.length === 1 ? 0 : rowIndex / (template.rows.length - 1)

    for (let columnIndex = 0; columnIndex < template.columnCount; columnIndex += 1) {
      const columnRatio = template.columnCount === 1 ? 0 : columnIndex / (template.columnCount - 1)
      const basePosition = fitAnchorPoint(regionCalibration.anchors, columnRatio, rowRatio)
      const suffix = columnIndex + 1
      const pointId =
        template.pointKind === 'breadboard-hole' ? `${row.id}${suffix}` : `${template.id}:${row.id}:${suffix}`
      const pointLabel = template.pointKind === 'breadboard-hole' ? `${row.label}${suffix}` : `${row.label} ${suffix}`
      const columnId = String(suffix)
      const rowOffset = regionCalibration.rowOffsets[row.id] ?? { x: 0, y: 0 }
      const columnOffset = regionCalibration.columnOffsets[columnId] ?? { x: 0, y: 0 }
      const pointOffset = regionCalibration.pointOffsets[pointId] ?? { x: 0, y: 0 }
      const position = {
        x: clampNormalized(basePosition.x + rowOffset.x + columnOffset.x + pointOffset.x),
        y: clampNormalized(basePosition.y + rowOffset.y + columnOffset.y + pointOffset.y),
      }

      points.push({
        id: pointId,
        label: pointLabel,
        x: position.x,
        y: position.y,
        kind: template.pointKind,
        group: getContinuityGroup(template, row.id, suffix),
        regionId: template.id,
        rowId: row.id,
        columnId,
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

  const columns: PartAxisGroup[] = Array.from({ length: template.columnCount }, (_, index) => ({
    id: String(index + 1),
    label: String(index + 1),
    pointIds: pointIdsByColumn.get(String(index + 1)) ?? [],
  }))

  const region: PartRegion = {
    id: template.id,
    name: template.name,
    kind: template.kind,
    pointIds: points.map((point) => point.id),
    rows,
    columns,
    anchors: cloneAnchors(regionCalibration.anchors),
    defaultAnchors: cloneAnchors(template.defaultAnchors),
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
  template,
  calibration,
}: BreadboardDefinitionOptions): PartDefinition {
  const nextTemplate = template ?? createStandardBreadboardTemplate()
  const nextCalibration = calibration ?? createCalibrationState(nextTemplate)
  const nextRegions = nextTemplate.regions.map((regionTemplate) =>
    buildBreadboardRegion(regionTemplate, getRegionCalibration(regionTemplate, nextCalibration)),
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
      template: nextTemplate,
      calibration: nextCalibration,
    },
  }
}

export function createEmptyBreadboardPartDefinition({
  id,
  name,
  imageSrc,
  image,
  imageWidth,
  imageHeight,
}: BreadboardDefinitionOptions): PartDefinition {
  return {
    id,
    name,
    imageSrc: imageSrc ?? image ?? '',
    imageWidth,
    imageHeight,
    points: [],
    metadata: {
      kind: 'breadboard',
      regions: [],
    },
  }
}

function rebuildBreadboardDefinition(definition: PartDefinition, calibration: CalibrationState) {
  const template = getTemplate(definition)

  return createBreadboardPartDefinition({
    id: definition.id,
    name: definition.name,
    imageSrc: definition.imageSrc,
    imageWidth: definition.imageWidth,
    imageHeight: definition.imageHeight,
    template,
    calibration,
  })
}

function moveFallbackRegion(
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

export function applyBreadboardRegionAnchors(
  definition: PartDefinition,
  regionId: string,
  anchors: PartRegionAnchor[],
) {
  const template = getTemplate(definition)
  const calibration = getCalibration(definition, template)
  const regionTemplate = template.regions.find((entry) => entry.id === regionId)

  if (!regionTemplate) {
    return definition
  }

  return rebuildBreadboardDefinition(definition, {
    ...calibration,
    regions: {
      ...calibration.regions,
      [regionId]: {
        ...getRegionCalibration(regionTemplate, calibration),
        anchors: cloneAnchors(anchors),
      },
    },
  })
}

export function resetBreadboardRegion(definition: PartDefinition, regionId: string) {
  const template = getTemplate(definition)
  const calibration = getCalibration(definition, template)
  const regionTemplate = template.regions.find((entry) => entry.id === regionId)

  if (!regionTemplate) {
    return definition
  }

  return rebuildBreadboardDefinition(definition, {
    ...calibration,
    regions: {
      ...calibration.regions,
      [regionId]: {
        regionId,
        anchors: cloneAnchors(regionTemplate.defaultAnchors),
        rowOffsets: {},
        columnOffsets: {},
        pointOffsets: {},
      },
    },
  })
}

export function moveBreadboardRegion(
  definition: PartDefinition,
  regionId: string,
  dx: number,
  dy: number,
) {
  if (!definition.metadata.template || !definition.metadata.calibration) {
    return moveFallbackRegion(definition, regionId, dx, dy)
  }

  const template = getTemplate(definition)
  const calibration = getCalibration(definition, template)
  const regionTemplate = template.regions.find((entry) => entry.id === regionId)

  if (!regionTemplate) {
    return definition
  }

  const currentCalibration = getRegionCalibration(regionTemplate, calibration)

  return rebuildBreadboardDefinition(definition, {
    ...calibration,
    regions: {
      ...calibration.regions,
      [regionId]: {
        ...currentCalibration,
        anchors: currentCalibration.anchors.map((anchor) => ({
          ...anchor,
          x: clampNormalized(anchor.x + dx),
          y: clampNormalized(anchor.y + dy),
        })),
      },
    },
  })
}

export function rotateBreadboardRegion(
  definition: PartDefinition,
  regionId: string,
  degrees: number,
) {
  const radians = (degrees * Math.PI) / 180

  if (!definition.metadata.template || !definition.metadata.calibration) {
    const region = getPartRegion(definition, regionId)

    if (!region) {
      return definition
    }

    const center = getAnchorCenter(region.anchors)
    const rotatedDefinition = updatePartPoints(definition, region.pointIds, (point) => {
      const nextPosition = rotatePosition(point.x, point.y, center.x, center.y, radians)

      return {
        ...point,
        x: nextPosition.x,
        y: nextPosition.y,
      }
    })

    return {
      ...rotatedDefinition,
      metadata: {
        ...rotatedDefinition.metadata,
        regions: rotatedDefinition.metadata.regions?.map((entry) => {
          if (entry.id !== regionId) {
            return entry
          }

          return {
            ...entry,
            anchors: entry.anchors.map((anchor) => {
              const nextPosition = rotatePosition(anchor.x, anchor.y, center.x, center.y, radians)

              return {
                ...anchor,
                x: nextPosition.x,
                y: nextPosition.y,
              }
            }),
          }
        }),
      },
    }
  }

  const template = getTemplate(definition)
  const calibration = getCalibration(definition, template)
  const regionTemplate = template.regions.find((entry) => entry.id === regionId)

  if (!regionTemplate) {
    return definition
  }

  const currentCalibration = getRegionCalibration(regionTemplate, calibration)
  const center = getAnchorCenter(currentCalibration.anchors)

  return rebuildBreadboardDefinition(definition, {
    ...calibration,
    regions: {
      ...calibration.regions,
      [regionId]: {
        ...currentCalibration,
        anchors: currentCalibration.anchors.map((anchor) => {
          const nextPosition = rotatePosition(anchor.x, anchor.y, center.x, center.y, radians)

          return {
            ...anchor,
            x: nextPosition.x,
            y: nextPosition.y,
          }
        }),
      },
    },
  })
}

export function moveBreadboardRow(
  definition: PartDefinition,
  regionId: string,
  rowId: string,
  dx: number,
  dy: number,
) {
  const region = getPartRegion(definition, regionId)
  const row = region?.rows.find((entry) => entry.id === rowId)

  if (!row) {
    return definition
  }

  if (!definition.metadata.template || !definition.metadata.calibration) {
    return updatePartPoints(definition, row.pointIds, (point) => ({
      ...point,
      x: point.x + dx,
      y: point.y + dy,
    }))
  }

  const template = getTemplate(definition)
  const calibration = getCalibration(definition, template)
  const regionTemplate = template.regions.find((entry) => entry.id === regionId)

  if (!regionTemplate) {
    return definition
  }

  const currentCalibration = getRegionCalibration(regionTemplate, calibration)
  const currentOffset = currentCalibration.rowOffsets[rowId] ?? { x: 0, y: 0 }

  return rebuildBreadboardDefinition(definition, {
    ...calibration,
    regions: {
      ...calibration.regions,
      [regionId]: {
        ...currentCalibration,
        rowOffsets: {
          ...currentCalibration.rowOffsets,
          [rowId]: {
            x: currentOffset.x + dx,
            y: currentOffset.y + dy,
          },
        },
      },
    },
  })
}

export function moveBreadboardColumn(
  definition: PartDefinition,
  regionId: string,
  columnId: string,
  dx: number,
  dy = 0,
) {
  const region = getPartRegion(definition, regionId)
  const column = region?.columns.find((entry) => entry.id === columnId)

  if (!column) {
    return definition
  }

  if (!definition.metadata.template || !definition.metadata.calibration) {
    return updatePartPoints(definition, column.pointIds, (point) => ({
      ...point,
      x: point.x + dx,
      y: point.y + dy,
    }))
  }

  const template = getTemplate(definition)
  const calibration = getCalibration(definition, template)
  const regionTemplate = template.regions.find((entry) => entry.id === regionId)

  if (!regionTemplate) {
    return definition
  }

  const currentCalibration = getRegionCalibration(regionTemplate, calibration)
  const currentOffset = currentCalibration.columnOffsets[columnId] ?? { x: 0, y: 0 }

  return rebuildBreadboardDefinition(definition, {
    ...calibration,
    regions: {
      ...calibration.regions,
      [regionId]: {
        ...currentCalibration,
        columnOffsets: {
          ...currentCalibration.columnOffsets,
          [columnId]: {
            x: currentOffset.x + dx,
            y: currentOffset.y + dy,
          },
        },
      },
    },
  })
}

export function moveBreadboardPoint(
  definition: PartDefinition,
  regionId: string,
  pointId: string,
  dx: number,
  dy: number,
) {
  if (!definition.metadata.template || !definition.metadata.calibration) {
    return updatePartPoints(definition, [pointId], (point) => ({
      ...point,
      x: point.x + dx,
      y: point.y + dy,
    }))
  }

  const template = getTemplate(definition)
  const calibration = getCalibration(definition, template)
  const regionTemplate = template.regions.find((entry) => entry.id === regionId)

  if (!regionTemplate) {
    return definition
  }

  const currentCalibration = getRegionCalibration(regionTemplate, calibration)
  const currentOffset = currentCalibration.pointOffsets[pointId] ?? { x: 0, y: 0 }

  return rebuildBreadboardDefinition(definition, {
    ...calibration,
    regions: {
      ...calibration.regions,
      [regionId]: {
        ...currentCalibration,
        pointOffsets: {
          ...currentCalibration.pointOffsets,
          [pointId]: {
            x: currentOffset.x + dx,
            y: currentOffset.y + dy,
          },
        },
      },
    },
  })
}
