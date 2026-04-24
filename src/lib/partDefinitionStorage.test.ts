import { describe, expect, it } from 'vitest'

import { createBreadboardPartDefinition } from './breadboardPartDefinitions'
import { loadPartDefinition, savePartDefinition, serializePartDefinition } from './partDefinitionStorage'

function createStorageMock() {
  const values: Record<string, string> = {}

  return {
    getItem(key: string) {
      return values[key] ?? null
    },
    setItem(key: string, value: string) {
      values[key] = value
    },
  }
}

function createDefinition() {
  return createBreadboardPartDefinition({
    id: 'breadboard-1',
    name: 'Breadboard',
    imageSrc: '/breadboard.png',
    imageWidth: 1200,
    imageHeight: 420,
  })
}

describe('partDefinitionStorage', () => {
  it('saves and loads part definitions', () => {
    const storage = createStorageMock()
    const definition = createDefinition()

    savePartDefinition(definition, storage)

    expect(loadPartDefinition('breadboard-1', storage)).toEqual(definition)
  })

  it('serializes part definitions into formatted json', () => {
    const definition = createDefinition()
    const serialized = serializePartDefinition(definition)

    expect(serialized).toContain('"metadata"')
    expect(serialized).toContain('"points"')
  })
})
