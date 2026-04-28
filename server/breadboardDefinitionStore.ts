import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  BreadboardDefinition,
  ConnectionPoint,
  DefinitionAxisGroup,
  DefinitionRegion,
  DefinitionRegionKind,
  ScaleCalibration,
} from '../src/lib/breadboardDefinitionModel'

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null
}

function isConnectionPointKind(value: unknown): value is ConnectionPoint['kind'] {
  return value === 'breadboard-hole' || value === 'pin' || value === 'rail'
}

function isSnapSource(value: unknown): value is NonNullable<ConnectionPoint['snapSource']> {
  return value === 'detected-hole' || value === 'manual' || value === 'grid-fill'
}

function isDefinitionRegionKind(value: unknown): value is DefinitionRegionKind {
  return value === 'terminal-strip' || value === 'power-rail' || value === 'custom-grid'
}

function normalizeAxisGroup(value: unknown): DefinitionAxisGroup {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.label !== 'string' ||
    !Array.isArray(value.pointIds) ||
    value.pointIds.some((id) => typeof id !== 'string')
  ) {
    throw new Error('Invalid axis group payload.')
  }
  return {
    id: value.id,
    label: value.label,
    pointIds: value.pointIds.map((id) => id as string),
  }
}

function normalizeDefinitionRegion(value: unknown): DefinitionRegion {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isDefinitionRegionKind(value.kind) ||
    !Array.isArray(value.pointIds) ||
    value.pointIds.some((id) => typeof id !== 'string') ||
    !Array.isArray(value.rows) ||
    !Array.isArray(value.columns)
  ) {
    throw new Error('Invalid region payload.')
  }
  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    pointIds: value.pointIds.map((id) => id as string),
    rows: value.rows.map(normalizeAxisGroup),
    columns: value.columns.map(normalizeAxisGroup),
  }
}

function normalizeConnectionPoint(value: unknown): ConnectionPoint {
  if (!isRecord(value)) {
    throw new Error('Invalid connection point payload.')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.x !== 'number' ||
    typeof value.y !== 'number' ||
    !isConnectionPointKind(value.kind)
  ) {
    throw new Error('Invalid connection point payload.')
  }

  if (value.confidence !== undefined && typeof value.confidence !== 'number') {
    throw new Error('Invalid connection point confidence.')
  }

  if (value.snapSource !== undefined && !isSnapSource(value.snapSource)) {
    throw new Error('Invalid connection point snap source.')
  }

  return {
    id: value.id,
    label: value.label,
    x: value.x,
    y: value.y,
    kind: value.kind,
    confidence: value.confidence,
    snapSource: value.snapSource,
    regionId: typeof value.regionId === 'string' ? value.regionId : undefined,
    rowId: typeof value.rowId === 'string' ? value.rowId : undefined,
    columnId: typeof value.columnId === 'string' ? value.columnId : undefined,
  }
}

function normalizeScaleCalibration(value: unknown): ScaleCalibration | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { x1, y1, x2, y2, realDistanceMm } = value

  if (
    typeof x1 !== 'number' ||
    typeof y1 !== 'number' ||
    typeof x2 !== 'number' ||
    typeof y2 !== 'number' ||
    typeof realDistanceMm !== 'number' ||
    realDistanceMm <= 0
  ) {
    return undefined
  }

  return { x1, y1, x2, y2, realDistanceMm }
}

function normalizeBreadboardDefinition(
  value: unknown,
  existingDefinition?: BreadboardDefinition,
): BreadboardDefinition {
  if (!isRecord(value)) {
    throw new Error('Invalid definition payload.')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.imageName !== 'string' ||
    typeof value.imagePath !== 'string' ||
    typeof value.imageWidth !== 'number' ||
    typeof value.imageHeight !== 'number' ||
    !Array.isArray(value.points)
  ) {
    throw new Error('Invalid definition payload.')
  }

  const createdAt =
    typeof value.createdAt === 'string'
      ? value.createdAt
      : (existingDefinition?.createdAt ?? new Date().toISOString())
  const updatedAt = new Date().toISOString()

  return {
    id: value.id,
    name: value.name,
    imageName: value.imageName,
    imagePath: value.imagePath,
    imageWidth: value.imageWidth,
    imageHeight: value.imageHeight,
    points: value.points.map(normalizeConnectionPoint),
    scaleCalibration: normalizeScaleCalibration(value.scaleCalibration),
    regions: Array.isArray(value.regions)
      ? value.regions.map(normalizeDefinitionRegion)
      : undefined,
    createdAt,
    updatedAt,
  }
}

function getDefinitionFileName(definitionId: string) {
  return `${encodeURIComponent(definitionId)}.json`
}

function getDefinitionFilePath(definitionsDirectory: string, definitionId: string) {
  return path.join(definitionsDirectory, getDefinitionFileName(definitionId))
}

export async function ensureBreadboardDefinitionStorage(definitionsDirectory: string) {
  await mkdir(definitionsDirectory, { recursive: true })
}

export async function listBreadboardDefinitions(definitionsDirectory: string) {
  await ensureBreadboardDefinitionStorage(definitionsDirectory)

  const fileNames = await readdir(definitionsDirectory)
  const definitions = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.json'))
      .map(async (fileName) => {
        const rawDefinition = await readFile(path.join(definitionsDirectory, fileName), 'utf8')

        return normalizeBreadboardDefinition(JSON.parse(rawDefinition))
      }),
  )

  return definitions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function readBreadboardDefinition(definitionsDirectory: string, definitionId: string) {
  try {
    const rawDefinition = await readFile(getDefinitionFilePath(definitionsDirectory, definitionId), 'utf8')

    return normalizeBreadboardDefinition(JSON.parse(rawDefinition))
  } catch {
    return null
  }
}

export async function saveBreadboardDefinition(definitionsDirectory: string, definition: unknown) {
  await ensureBreadboardDefinitionStorage(definitionsDirectory)

  const definitionRecord = isRecord(definition) && typeof definition.id === 'string'
    ? await readBreadboardDefinition(definitionsDirectory, definition.id)
    : null
  const normalizedDefinition = normalizeBreadboardDefinition(definition, definitionRecord ?? undefined)

  await writeFile(
    getDefinitionFilePath(definitionsDirectory, normalizedDefinition.id),
    JSON.stringify(normalizedDefinition, null, 2),
    'utf8',
  )

  return normalizedDefinition
}

export async function deleteBreadboardDefinition(definitionsDirectory: string, definitionId: string) {
  try {
    await rm(getDefinitionFilePath(definitionsDirectory, definitionId))
    return true
  } catch {
    return false
  }
}