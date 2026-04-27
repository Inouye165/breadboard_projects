// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { BreadboardDefinition } from '../src/lib/breadboardDefinitionModel'
import {
  deleteBreadboardDefinition,
  listBreadboardDefinitions,
  readBreadboardDefinition,
  saveBreadboardDefinition,
} from './breadboardDefinitionStore'

const tempDirectories: string[] = []

async function createDefinitionsDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'breadboard-definitions-'))
  tempDirectories.push(directory)

  return directory
}

function createDefinition(): BreadboardDefinition {
  return {
    id: 'definition-1',
    name: 'Board A',
    imageName: 'board-a.png',
    imagePath: '/__breadboard_local__/images/board-a.png',
    imageWidth: 1200,
    imageHeight: 420,
    points: [
      {
        id: 'point-1',
        label: 'A1',
        x: 0.123456,
        y: 0.654321,
        kind: 'breadboard-hole',
        confidence: 0.9,
        snapSource: 'manual',
      },
    ],
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  }
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('breadboardDefinitionStore', () => {
  it('saves a definition to local persistence', async () => {
    const definitionsDirectory = await createDefinitionsDirectory()
    const definition = createDefinition()

    const savedDefinition = await saveBreadboardDefinition(definitionsDirectory, definition)
    const rawFile = await readFile(path.join(definitionsDirectory, 'definition-1.json'), 'utf8')

    expect(savedDefinition.id).toBe('definition-1')
    expect(JSON.parse(rawFile)).toMatchObject({
      id: 'definition-1',
      name: 'Board A',
    })
  })

  it('loads saved definitions', async () => {
    const definitionsDirectory = await createDefinitionsDirectory()

    await saveBreadboardDefinition(definitionsDirectory, createDefinition())

    await expect(listBreadboardDefinitions(definitionsDirectory)).resolves.toHaveLength(1)
    await expect(readBreadboardDefinition(definitionsDirectory, 'definition-1')).resolves.toMatchObject({
      id: 'definition-1',
      name: 'Board A',
    })
  })

  it('updates an existing definition', async () => {
    const definitionsDirectory = await createDefinitionsDirectory()
    const definition = createDefinition()

    const savedDefinition = await saveBreadboardDefinition(definitionsDirectory, definition)
    const updatedDefinition = await saveBreadboardDefinition(definitionsDirectory, {
      ...savedDefinition,
      name: 'Board A revised',
    })

    expect(updatedDefinition.createdAt).toBe(savedDefinition.createdAt)
    expect(updatedDefinition.updatedAt).not.toBe(savedDefinition.updatedAt)
    expect(updatedDefinition.name).toBe('Board A revised')
  })

  it('preserves normalized point coordinates exactly', async () => {
    const definitionsDirectory = await createDefinitionsDirectory()
    const definition = createDefinition()

    await saveBreadboardDefinition(definitionsDirectory, definition)

    await expect(readBreadboardDefinition(definitionsDirectory, 'definition-1')).resolves.toMatchObject({
      points: [
        expect.objectContaining({
          x: 0.123456,
          y: 0.654321,
        }),
      ],
    })
  })

  it('deletes a saved definition', async () => {
    const definitionsDirectory = await createDefinitionsDirectory()

    await saveBreadboardDefinition(definitionsDirectory, createDefinition())

    await expect(deleteBreadboardDefinition(definitionsDirectory, 'definition-1')).resolves.toBe(true)
    await expect(readBreadboardDefinition(definitionsDirectory, 'definition-1')).resolves.toBeNull()
  })
})