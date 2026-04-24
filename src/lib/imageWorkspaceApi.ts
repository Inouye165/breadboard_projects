import type { SavedWorkspace } from './imageAlignment'

const WORKSPACE_ENDPOINT = '/api/workspace'
const IMAGE_UPLOAD_ENDPOINT = '/api/workspace/image'

async function parseResponse<T>(response: Response) {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result

      if (typeof result !== 'string') {
        reject(new Error('Could not read the selected image.'))
        return
      }

      const [, base64 = ''] = result.split(',', 2)
      resolve(base64)
    }

    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read the selected image.'))
    }

    reader.readAsDataURL(file)
  })
}

export async function loadSavedWorkspace(fetchImpl: typeof fetch = fetch) {
  const payload = await parseResponse<{ workspace: SavedWorkspace | null }>(
    await fetchImpl(WORKSPACE_ENDPOINT),
  )

  return payload.workspace
}

export async function uploadWorkspaceImage(file: File, fetchImpl: typeof fetch = fetch) {
  const contentsBase64 = await readFileAsBase64(file)
  const payload = await parseResponse<{ workspace: SavedWorkspace }>(
    await fetchImpl(IMAGE_UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contentsBase64,
        name: file.name,
      }),
    }),
  )

  return payload.workspace
}

export async function saveWorkspace(workspace: SavedWorkspace, fetchImpl: typeof fetch = fetch) {
  const payload = await parseResponse<{ workspace: SavedWorkspace }>(
    await fetchImpl(WORKSPACE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(workspace),
    }),
  )

  return payload.workspace
}