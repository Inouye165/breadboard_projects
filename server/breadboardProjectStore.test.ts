// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { BreadboardProject } from '../src/lib/breadboardProjectModel'
import {
  deleteBreadboardProject,
  listBreadboardProjects,
  readBreadboardProject,
  saveBreadboardProject,
} from './breadboardProjectStore'

const tempDirectories: string[] = []

async function createProjectsDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'breadboard-projects-'))
  tempDirectories.push(directory)

  return directory
}

function createProject(): BreadboardProject {
  return {
    id: 'project-1',
    name: 'Project A',
    breadboardDefinitionId: 'definition-1',
    wires: [
      {
        id: 'wire-1',
        fromPointId: 'point-1',
        toPointId: 'point-2',
        color: '#cc3333',
      },
    ],
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  }
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('breadboardProjectStore', () => {
  it('saves a project to local persistence', async () => {
    const projectsDirectory = await createProjectsDirectory()
    const project = createProject()

    const savedProject = await saveBreadboardProject(projectsDirectory, project)
    const rawFile = await readFile(path.join(projectsDirectory, 'project-1.json'), 'utf8')

    expect(savedProject.id).toBe('project-1')
    expect(JSON.parse(rawFile)).toMatchObject({
      id: 'project-1',
      name: 'Project A',
      breadboardDefinitionId: 'definition-1',
      wires: [
        expect.objectContaining({
          fromPointId: 'point-1',
          toPointId: 'point-2',
        }),
      ],
    })
  })

  it('loads saved projects', async () => {
    const projectsDirectory = await createProjectsDirectory()

    await saveBreadboardProject(projectsDirectory, createProject())

    await expect(listBreadboardProjects(projectsDirectory)).resolves.toHaveLength(1)
    await expect(readBreadboardProject(projectsDirectory, 'project-1')).resolves.toMatchObject({
      id: 'project-1',
      name: 'Project A',
    })
  })

  it('updates an existing project', async () => {
    const projectsDirectory = await createProjectsDirectory()
    const project = createProject()

    const savedProject = await saveBreadboardProject(projectsDirectory, project)
    const updatedProject = await saveBreadboardProject(projectsDirectory, {
      ...savedProject,
      name: 'Project A revised',
    })

    expect(updatedProject.createdAt).toBe(savedProject.createdAt)
    expect(updatedProject.updatedAt).not.toBe(savedProject.updatedAt)
    expect(updatedProject.name).toBe('Project A revised')
  })

  it('deletes a saved project', async () => {
    const projectsDirectory = await createProjectsDirectory()

    await saveBreadboardProject(projectsDirectory, createProject())

    await expect(deleteBreadboardProject(projectsDirectory, 'project-1')).resolves.toBe(true)
    await expect(readBreadboardProject(projectsDirectory, 'project-1')).resolves.toBeNull()
  })
})
