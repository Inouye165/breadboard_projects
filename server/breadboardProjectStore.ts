import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  PROJECT_COMPONENT_KINDS,
  type BreadboardProject,
  type ProjectComponent,
  type ProjectComponentKind,
  type Wire,
} from '../src/lib/breadboardProjectModel'

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null
}

function normalizeWire(value: unknown): Wire {
  if (!isRecord(value)) {
    throw new Error('Invalid wire payload.')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.fromPointId !== 'string' ||
    typeof value.toPointId !== 'string'
  ) {
    throw new Error('Invalid wire payload.')
  }

  if (value.color !== undefined && typeof value.color !== 'string') {
    throw new Error('Invalid wire color.')
  }

  let waypoints: Wire['waypoints']

  if (value.waypoints !== undefined) {
    if (!Array.isArray(value.waypoints)) {
      throw new Error('Invalid wire waypoints.')
    }

    waypoints = value.waypoints.map((waypoint) => {
      if (!isRecord(waypoint) || typeof waypoint.x !== 'number' || typeof waypoint.y !== 'number') {
        throw new Error('Invalid wire waypoint.')
      }

      return { x: waypoint.x, y: waypoint.y }
    })
  }

  return {
    id: value.id,
    fromPointId: value.fromPointId,
    toPointId: value.toPointId,
    color: value.color as string | undefined,
    waypoints,
  }
}

function normalizeProjectComponent(value: unknown): ProjectComponent {
  if (!isRecord(value)) {
    throw new Error('Invalid component payload.')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.label !== 'string'
  ) {
    throw new Error('Invalid component payload.')
  }

  if (!PROJECT_COMPONENT_KINDS.includes(value.kind as ProjectComponentKind)) {
    throw new Error('Invalid component kind.')
  }

  if (value.description !== undefined && typeof value.description !== 'string') {
    throw new Error('Invalid component description.')
  }

  return {
    id: value.id,
    kind: value.kind as ProjectComponentKind,
    label: value.label,
    description: value.description as string | undefined,
  }
}

function normalizeBreadboardProject(
  value: unknown,
  existingProject?: BreadboardProject,
): BreadboardProject {
  if (!isRecord(value)) {
    throw new Error('Invalid project payload.')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.breadboardDefinitionId !== 'string' ||
    !Array.isArray(value.wires)
  ) {
    throw new Error('Invalid project payload.')
  }

  const createdAt =
    typeof value.createdAt === 'string'
      ? value.createdAt
      : (existingProject?.createdAt ?? new Date().toISOString())
  const updatedAt = new Date().toISOString()

  let components: ProjectComponent[] | undefined

  if (value.components !== undefined) {
    if (!Array.isArray(value.components)) {
      throw new Error('Invalid project components.')
    }

    components = value.components.map(normalizeProjectComponent)
  }

  return {
    id: value.id,
    name: value.name,
    breadboardDefinitionId: value.breadboardDefinitionId,
    wires: value.wires.map(normalizeWire),
    components,
    createdAt,
    updatedAt,
  }
}

function getProjectFileName(projectId: string) {
  return `${encodeURIComponent(projectId)}.json`
}

function getProjectFilePath(projectsDirectory: string, projectId: string) {
  return path.join(projectsDirectory, getProjectFileName(projectId))
}

export async function ensureBreadboardProjectStorage(projectsDirectory: string) {
  await mkdir(projectsDirectory, { recursive: true })
}

export async function listBreadboardProjects(projectsDirectory: string) {
  await ensureBreadboardProjectStorage(projectsDirectory)

  const fileNames = await readdir(projectsDirectory)
  const projects = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.json'))
      .map(async (fileName) => {
        const rawProject = await readFile(path.join(projectsDirectory, fileName), 'utf8')

        return normalizeBreadboardProject(JSON.parse(rawProject))
      }),
  )

  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function readBreadboardProject(projectsDirectory: string, projectId: string) {
  try {
    const rawProject = await readFile(getProjectFilePath(projectsDirectory, projectId), 'utf8')

    return normalizeBreadboardProject(JSON.parse(rawProject))
  } catch {
    return null
  }
}

export async function saveBreadboardProject(projectsDirectory: string, project: unknown) {
  await ensureBreadboardProjectStorage(projectsDirectory)

  const projectRecord =
    isRecord(project) && typeof project.id === 'string'
      ? await readBreadboardProject(projectsDirectory, project.id)
      : null
  const normalizedProject = normalizeBreadboardProject(project, projectRecord ?? undefined)

  await writeFile(
    getProjectFilePath(projectsDirectory, normalizedProject.id),
    JSON.stringify(normalizedProject, null, 2),
    'utf8',
  )

  return normalizedProject
}

export async function deleteBreadboardProject(projectsDirectory: string, projectId: string) {
  try {
    await rm(getProjectFilePath(projectsDirectory, projectId))
    return true
  } catch {
    return false
  }
}
