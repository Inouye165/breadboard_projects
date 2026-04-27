import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { BreadboardProject, Wire } from '../src/lib/breadboardProjectModel'

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

  return {
    id: value.id,
    fromPointId: value.fromPointId,
    toPointId: value.toPointId,
    color: value.color as string | undefined,
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

  return {
    id: value.id,
    name: value.name,
    breadboardDefinitionId: value.breadboardDefinitionId,
    wires: value.wires.map(normalizeWire),
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
