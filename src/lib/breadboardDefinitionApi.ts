import type { BreadboardDefinition } from './breadboardDefinitionModel'

const PART_DEFINITIONS_ENDPOINT = '/api/part-definitions'

async function parseResponse<T>(response: Response) {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

export async function listBreadboardDefinitions(fetchImpl: typeof fetch = fetch) {
  const payload = await parseResponse<{ definitions: BreadboardDefinition[] }>(
    await fetchImpl(PART_DEFINITIONS_ENDPOINT),
  )

  return payload.definitions
}

export async function loadBreadboardDefinition(definitionId: string, fetchImpl: typeof fetch = fetch) {
  const payload = await parseResponse<{ definition: BreadboardDefinition }>(
    await fetchImpl(`${PART_DEFINITIONS_ENDPOINT}/${encodeURIComponent(definitionId)}`),
  )

  return payload.definition
}

export async function createBreadboardDefinitionRecord(
  definition: BreadboardDefinition,
  fetchImpl: typeof fetch = fetch,
) {
  const payload = await parseResponse<{ definition: BreadboardDefinition }>(
    await fetchImpl(PART_DEFINITIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(definition),
    }),
  )

  return payload.definition
}

export async function updateBreadboardDefinitionRecord(
  definition: BreadboardDefinition,
  fetchImpl: typeof fetch = fetch,
) {
  const payload = await parseResponse<{ definition: BreadboardDefinition }>(
    await fetchImpl(`${PART_DEFINITIONS_ENDPOINT}/${encodeURIComponent(definition.id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(definition),
    }),
  )

  return payload.definition
}

export async function deleteBreadboardDefinitionRecord(
  definitionId: string,
  fetchImpl: typeof fetch = fetch,
) {
  await parseResponse<{ success: true }>(
    await fetchImpl(`${PART_DEFINITIONS_ENDPOINT}/${encodeURIComponent(definitionId)}`, {
      method: 'DELETE',
    }),
  )
}