import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  IMAGE_VIEW_SIDES,
  PART_CATEGORIES,
  PART_RESOURCE_KINDS,
  PHYSICAL_POINT_KINDS,
  type ImageViewSide,
  type LibraryPartDefinition,
  type LogicalPin,
  type PartCategory,
  type PartImageCalibration,
  type PartImageView,
  type PartResource,
  type PartResourceKind,
  type PhysicalPoint,
  type PhysicalPointKind,
} from '../src/lib/partLibraryModel'

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string')
}

function normalizeCalibration(value: unknown): PartImageCalibration | undefined {
  if (!isRecord(value) || !isRecord(value.corners)) {
    return undefined
  }

  function asCorner(raw: unknown) {
    if (!isRecord(raw) || typeof raw.x !== 'number' || typeof raw.y !== 'number') {
      return null
    }
    return { x: raw.x, y: raw.y }
  }

  const corners = value.corners as JsonObject
  const topLeft = asCorner(corners.topLeft)
  const topRight = asCorner(corners.topRight)
  const bottomRight = asCorner(corners.bottomRight)
  const bottomLeft = asCorner(corners.bottomLeft)

  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return undefined
  }

  return {
    corners: { topLeft, topRight, bottomRight, bottomLeft },
    widthMm: asNumber(value.widthMm),
    heightMm: asNumber(value.heightMm),
  }
}

function normalizeImageView(value: unknown): PartImageView {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new Error('Invalid image view payload.')
  }

  return {
    id: value.id,
    label: asString(value.label, 'View'),
    side: isOneOf<ImageViewSide>(value.side, IMAGE_VIEW_SIDES) ? value.side : 'other',
    imageName: asString(value.imageName),
    imagePath: asString(value.imagePath),
    imageWidth: asNumber(value.imageWidth),
    imageHeight: asNumber(value.imageHeight),
    calibration: normalizeCalibration(value.calibration),
  }
}

function normalizeLogicalPin(value: unknown): LogicalPin {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    throw new Error('Invalid logical pin payload.')
  }

  return {
    id: value.id,
    name: value.name,
    description: asOptionalString(value.description),
    function: asOptionalString(value.function),
  }
}

function normalizePhysicalPoint(value: unknown): PhysicalPoint {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.viewId !== 'string' ||
    typeof value.xMm !== 'number' ||
    typeof value.yMm !== 'number' ||
    !isOneOf<PhysicalPointKind>(value.kind, PHYSICAL_POINT_KINDS)
  ) {
    throw new Error('Invalid physical point payload.')
  }

  return {
    id: value.id,
    viewId: value.viewId,
    xMm: value.xMm,
    yMm: value.yMm,
    kind: value.kind,
    label: asOptionalString(value.label),
    logicalPinId: asOptionalString(value.logicalPinId),
    solderable: asOptionalBoolean(value.solderable),
    throughHole: asOptionalBoolean(value.throughHole),
    diameterMm: asOptionalNumber(value.diameterMm),
    notes: asOptionalString(value.notes),
    netId: asOptionalString(value.netId),
  }
}

function normalizeResource(value: unknown): PartResource {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isOneOf<PartResourceKind>(value.kind, PART_RESOURCE_KINDS)
  ) {
    throw new Error('Invalid resource payload.')
  }

  return {
    id: value.id,
    kind: value.kind,
    label: asString(value.label, value.kind),
    url: asOptionalString(value.url),
    notes: asOptionalString(value.notes),
  }
}

function normalizeLibraryPart(
  value: unknown,
  existingPart?: LibraryPartDefinition,
): LibraryPartDefinition {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isOneOf<PartCategory>(value.category, PART_CATEGORIES)
  ) {
    throw new Error('Invalid library part payload.')
  }

  const dimensions = isRecord(value.dimensions) ? value.dimensions : {}
  const createdAt =
    typeof value.createdAt === 'string'
      ? value.createdAt
      : (existingPart?.createdAt ?? new Date().toISOString())
  const updatedAt = new Date().toISOString()

  return {
    id: value.id,
    name: value.name,
    category: value.category,
    manufacturer: asOptionalString(value.manufacturer),
    modelNumber: asOptionalString(value.modelNumber),
    aliases: asStringArray(value.aliases),
    description: asOptionalString(value.description),
    dimensions: {
      widthMm: asNumber(dimensions.widthMm),
      heightMm: asNumber(dimensions.heightMm),
      thicknessMm: asOptionalNumber(dimensions.thicknessMm),
    },
    imageViews: Array.isArray(value.imageViews) ? value.imageViews.map(normalizeImageView) : [],
    logicalPins: Array.isArray(value.logicalPins) ? value.logicalPins.map(normalizeLogicalPin) : [],
    physicalPoints: Array.isArray(value.physicalPoints)
      ? value.physicalPoints.map(normalizePhysicalPoint)
      : [],
    resources: Array.isArray(value.resources) ? value.resources.map(normalizeResource) : [],
    createdAt,
    updatedAt,
  }
}

function getPartFileName(partId: string) {
  return `${encodeURIComponent(partId)}.json`
}

function getPartFilePath(partsDirectory: string, partId: string) {
  return path.join(partsDirectory, getPartFileName(partId))
}

export async function ensureLibraryPartStorage(partsDirectory: string) {
  await mkdir(partsDirectory, { recursive: true })
}

export async function listLibraryParts(partsDirectory: string) {
  await ensureLibraryPartStorage(partsDirectory)

  const fileNames = await readdir(partsDirectory)
  const parts = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.json'))
      .map(async (fileName) => {
        const rawPart = await readFile(path.join(partsDirectory, fileName), 'utf8')

        return normalizeLibraryPart(JSON.parse(rawPart))
      }),
  )

  return parts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function readLibraryPart(partsDirectory: string, partId: string) {
  try {
    const rawPart = await readFile(getPartFilePath(partsDirectory, partId), 'utf8')

    return normalizeLibraryPart(JSON.parse(rawPart))
  } catch {
    return null
  }
}

export async function saveLibraryPart(partsDirectory: string, part: unknown) {
  await ensureLibraryPartStorage(partsDirectory)

  const existingPart = isRecord(part) && typeof part.id === 'string'
    ? await readLibraryPart(partsDirectory, part.id)
    : null
  const normalizedPart = normalizeLibraryPart(part, existingPart ?? undefined)

  await writeFile(
    getPartFilePath(partsDirectory, normalizedPart.id),
    JSON.stringify(normalizedPart, null, 2),
    'utf8',
  )

  return normalizedPart
}

export async function deleteLibraryPart(
  partsDirectory: string,
  partId: string,
  partImagesDirectory?: string,
) {
  let removed = false

  try {
    await rm(getPartFilePath(partsDirectory, partId))
    removed = true
  } catch {
    // File may not exist; treat as not removed.
  }

  if (partImagesDirectory) {
    try {
      await rm(path.join(partImagesDirectory, encodeURIComponent(partId)), {
        recursive: true,
        force: true,
      })
    } catch {
      // Ignore image directory cleanup failures.
    }
  }

  return removed
}
