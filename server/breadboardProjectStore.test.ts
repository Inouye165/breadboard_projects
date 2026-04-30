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

  it('round-trips wire waypoints through persistence', async () => {
    const projectsDirectory = await createProjectsDirectory()
    const project: BreadboardProject = {
      ...createProject(),
      wires: [
        {
          id: 'wire-1',
          fromPointId: 'point-1',
          toPointId: 'point-2',
          color: '#cc3333',
          waypoints: [
            { x: 25, y: 80 },
            { x: 60, y: 120 },
          ],
        },
      ],
    }

    await saveBreadboardProject(projectsDirectory, project)
    const loaded = await readBreadboardProject(projectsDirectory, 'project-1')

    expect(loaded?.wires[0].waypoints).toEqual([
      { x: 25, y: 80 },
      { x: 60, y: 120 },
    ])
  })

  it('round-trips project components through persistence', async () => {
    const projectsDirectory = await createProjectsDirectory()
    const project: BreadboardProject = {
      ...createProject(),
      components: [
        { id: 'c-1', kind: 'resistor', label: 'R1', description: '220 ohms' },
        { id: 'c-2', kind: 'led', label: 'LED1' },
      ],
    }

    await saveBreadboardProject(projectsDirectory, project)
    const loaded = await readBreadboardProject(projectsDirectory, 'project-1')

    expect(loaded?.components).toEqual([
      { id: 'c-1', kind: 'resistor', label: 'R1', description: '220 ohms' },
      { id: 'c-2', kind: 'led', label: 'LED1', description: undefined },
    ])
  })

  it('rejects components with an unknown kind', async () => {
    const projectsDirectory = await createProjectsDirectory()
    const project = {
      ...createProject(),
      components: [{ id: 'c-1', kind: 'unicorn', label: 'X' }],
    }

    await expect(saveBreadboardProject(projectsDirectory, project)).rejects.toThrow(
      /Invalid component kind/,
    )
  })

  it('rejects wires with malformed waypoints', async () => {
    const projectsDirectory = await createProjectsDirectory()
    const project = {
      ...createProject(),
      wires: [
        {
          id: 'wire-1',
          fromPointId: 'point-1',
          toPointId: 'point-2',
          waypoints: [{ x: 'oops', y: 1 }],
        },
      ],
    }

    await expect(saveBreadboardProject(projectsDirectory, project)).rejects.toThrow(
      /Invalid wire waypoint/,
    )
  })

  it('round-trips passiveSpanMm on placed generated-passive modules', async () => {
    // Regression: the server normaliser used to drop passiveSpanMm on save,
    // which made dragged resistor leads "snap back" to native spacing as
    // soon as the saved project was echoed back from the API.
    const projectsDirectory = await createProjectsDirectory()
    const project: BreadboardProject = {
      ...createProject(),
      modules: [
        {
          id: 'mod-1',
          libraryPartId: 'lib-resistor-1',
          centerX: 250,
          centerY: 110,
          rotationDeg: 17,
          passiveSpanMm: 18.7,
        },
      ],
    }

    const saved = await saveBreadboardProject(projectsDirectory, project)
    expect(saved.modules?.[0].passiveSpanMm).toBe(18.7)
    expect(saved.modules?.[0].rotationDeg).toBe(17)

    const reloaded = await readBreadboardProject(projectsDirectory, 'project-1')
    expect(reloaded?.modules?.[0].passiveSpanMm).toBe(18.7)
    expect(reloaded?.modules?.[0].centerX).toBe(250)
  })

  it('rejects modules whose passiveSpanMm is the wrong type', async () => {
    const projectsDirectory = await createProjectsDirectory()
    const project = {
      ...createProject(),
      modules: [
        {
          id: 'mod-1',
          libraryPartId: 'lib-1',
          centerX: 0,
          centerY: 0,
          rotationDeg: 0,
          passiveSpanMm: 'twelve',
        },
      ],
    }

    await expect(saveBreadboardProject(projectsDirectory, project)).rejects.toThrow(
      /passiveSpanMm/,
    )
  })
})
