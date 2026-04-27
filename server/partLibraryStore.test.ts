// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { LibraryPartDefinition } from '../src/lib/partLibraryModel'
import {
  deleteLibraryPart,
  listLibraryParts,
  readLibraryPart,
  saveLibraryPart,
} from './partLibraryStore'

const tempDirectories: string[] = []

async function createPartsDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'library-parts-'))
  tempDirectories.push(directory)

  return directory
}

function buildPart(): LibraryPartDefinition {
  return {
    id: 'library-part-1',
    name: 'BME280',
    category: 'sensor',
    manufacturer: 'Bosch',
    modelNumber: 'BME280',
    aliases: ['BME-280'],
    description: 'Temp/humidity/pressure sensor.',
    dimensions: { widthMm: 11, heightMm: 16, thicknessMm: 1.6 },
    imageViews: [
      {
        id: 'image-view-top',
        label: 'Top',
        side: 'top',
        imageName: 'top.png',
        imagePath: '/__breadboard_local__/parts/library-part-1/top.png',
        imageWidth: 800,
        imageHeight: 600,
        calibration: {
          corners: {
            topLeft: { x: 100, y: 50 },
            topRight: { x: 700, y: 50 },
            bottomRight: { x: 700, y: 550 },
            bottomLeft: { x: 100, y: 550 },
          },
          widthMm: 11,
          heightMm: 16,
        },
      },
    ],
    logicalPins: [{ id: 'logical-pin-gnd', name: 'GND', function: 'ground' }],
    physicalPoints: [
      {
        id: 'physical-point-1',
        viewId: 'image-view-top',
        xMm: 1.2345,
        yMm: 6.5432,
        kind: 'header-pin',
        logicalPinId: 'logical-pin-gnd',
        solderable: true,
        throughHole: true,
        diameterMm: 1.0,
      },
    ],
    resources: [
      { id: 'resource-1', kind: 'datasheet', label: 'Datasheet', url: 'https://example.com/ds.pdf' },
    ],
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('partLibraryStore', () => {
  it('saves a library part to local persistence', async () => {
    const partsDirectory = await createPartsDirectory()
    const part = buildPart()

    const saved = await saveLibraryPart(partsDirectory, part)
    const rawFile = await readFile(path.join(partsDirectory, 'library-part-1.json'), 'utf8')

    expect(saved.id).toBe('library-part-1')
    expect(JSON.parse(rawFile)).toMatchObject({ id: 'library-part-1', name: 'BME280', category: 'sensor' })
  })

  it('lists and reads saved parts', async () => {
    const partsDirectory = await createPartsDirectory()

    await saveLibraryPart(partsDirectory, buildPart())

    await expect(listLibraryParts(partsDirectory)).resolves.toHaveLength(1)
    await expect(readLibraryPart(partsDirectory, 'library-part-1')).resolves.toMatchObject({
      id: 'library-part-1',
      manufacturer: 'Bosch',
    })
  })

  it('preserves millimeter point coordinates and calibration corners exactly', async () => {
    const partsDirectory = await createPartsDirectory()

    await saveLibraryPart(partsDirectory, buildPart())

    const reloaded = await readLibraryPart(partsDirectory, 'library-part-1')
    expect(reloaded?.physicalPoints[0]).toMatchObject({
      xMm: 1.2345,
      yMm: 6.5432,
      diameterMm: 1.0,
      viewId: 'image-view-top',
    })
    expect(reloaded?.imageViews[0].calibration).toMatchObject({
      widthMm: 11,
      heightMm: 16,
      corners: {
        topLeft: { x: 100, y: 50 },
        topRight: { x: 700, y: 50 },
        bottomRight: { x: 700, y: 550 },
        bottomLeft: { x: 100, y: 550 },
      },
    })
  })

  it('updates an existing part and bumps updatedAt while preserving createdAt', async () => {
    const partsDirectory = await createPartsDirectory()
    const part = buildPart()

    const saved = await saveLibraryPart(partsDirectory, part)
    const updated = await saveLibraryPart(partsDirectory, { ...saved, name: 'BME280 revised' })

    expect(updated.createdAt).toBe(saved.createdAt)
    expect(updated.updatedAt).not.toBe(saved.updatedAt)
    expect(updated.name).toBe('BME280 revised')
  })

  it('rejects payloads with invalid category', async () => {
    const partsDirectory = await createPartsDirectory()

    await expect(
      saveLibraryPart(partsDirectory, { ...buildPart(), category: 'not-a-real-category' }),
    ).rejects.toThrow(/library part/i)
  })

  it('deletes a saved part and optionally clears its image directory', async () => {
    const partsDirectory = await createPartsDirectory()
    const imagesRoot = await createPartsDirectory()
    const partImageDir = path.join(imagesRoot, encodeURIComponent('library-part-1'))

    await mkdir(partImageDir, { recursive: true })
    await writeFile(path.join(partImageDir, 'top.png'), 'fake-image')
    await saveLibraryPart(partsDirectory, buildPart())

    await expect(deleteLibraryPart(partsDirectory, 'library-part-1', imagesRoot)).resolves.toBe(true)
    await expect(readLibraryPart(partsDirectory, 'library-part-1')).resolves.toBeNull()
  })
})
