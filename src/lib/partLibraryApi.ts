import type { LibraryPartDefinition, PartImageView } from './partLibraryModel'

const LIBRARY_PARTS_ENDPOINT = '/api/library-parts'

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

export async function listLibraryParts(fetchImpl: typeof fetch = fetch) {
  const payload = await parseResponse<{ parts: LibraryPartDefinition[] }>(
    await fetchImpl(LIBRARY_PARTS_ENDPOINT),
  )

  return payload.parts
}

export async function loadLibraryPart(partId: string, fetchImpl: typeof fetch = fetch) {
  const payload = await parseResponse<{ part: LibraryPartDefinition }>(
    await fetchImpl(`${LIBRARY_PARTS_ENDPOINT}/${encodeURIComponent(partId)}`),
  )

  return payload.part
}

export async function createLibraryPartRecord(
  part: LibraryPartDefinition,
  fetchImpl: typeof fetch = fetch,
) {
  const payload = await parseResponse<{ part: LibraryPartDefinition }>(
    await fetchImpl(LIBRARY_PARTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(part),
    }),
  )

  return payload.part
}

export async function updateLibraryPartRecord(
  part: LibraryPartDefinition,
  fetchImpl: typeof fetch = fetch,
) {
  const payload = await parseResponse<{ part: LibraryPartDefinition }>(
    await fetchImpl(`${LIBRARY_PARTS_ENDPOINT}/${encodeURIComponent(part.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(part),
    }),
  )

  return payload.part
}

export async function deleteLibraryPartRecord(partId: string, fetchImpl: typeof fetch = fetch) {
  await parseResponse<{ success: true }>(
    await fetchImpl(`${LIBRARY_PARTS_ENDPOINT}/${encodeURIComponent(partId)}`, {
      method: 'DELETE',
    }),
  )
}

export type UploadedLibraryPartImage = Pick<
  PartImageView,
  'imageName' | 'imagePath' | 'imageWidth' | 'imageHeight'
>

export type UploadLibraryPartImageOptions = {
  side?: PartImageView['side']
  label?: string
  imageWidth?: number
  imageHeight?: number
}

export async function uploadLibraryPartImage(
  partId: string,
  file: File,
  options: UploadLibraryPartImageOptions = {},
  fetchImpl: typeof fetch = fetch,
) {
  const contentsBase64 = await readFileAsBase64(file)
  const payload = await parseResponse<{ image: UploadedLibraryPartImage }>(
    await fetchImpl(`${LIBRARY_PARTS_ENDPOINT}/${encodeURIComponent(partId)}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentsBase64,
        name: file.name,
        side: options.side,
        label: options.label,
        imageWidth: options.imageWidth,
        imageHeight: options.imageHeight,
      }),
    }),
  )

  return payload.image
}
