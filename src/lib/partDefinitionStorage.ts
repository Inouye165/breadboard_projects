import type { PartDefinition } from './parts'

const STORAGE_KEY = 'breadboard-projects.part-definitions'

type StorageShape = Record<string, PartDefinition>

function parseStoredDefinitions(rawValue: string | null): StorageShape {
  if (!rawValue) {
    return {}
  }

  try {
    return JSON.parse(rawValue) as StorageShape
  } catch {
    return {}
  }
}

export function savePartDefinition(
  definition: PartDefinition,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage,
) {
  const existingDefinitions = parseStoredDefinitions(storage.getItem(STORAGE_KEY))

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...existingDefinitions,
      [definition.id]: definition,
    }),
  )
}

export function loadPartDefinition(
  definitionId: string,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
) {
  return parseStoredDefinitions(storage.getItem(STORAGE_KEY))[definitionId]
}

export function serializePartDefinition(definition: PartDefinition) {
  return JSON.stringify(definition, null, 2)
}