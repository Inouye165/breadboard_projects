export type SavedBreadboard = {
  name: string
  url: string
}

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
}

const DB_NAME = 'breadboard-projects'
const STORE_NAME = 'handles'
const DIRECTORY_KEY = 'breadboard-library-directory'
const DIRECTORY_NAME_KEY = 'breadboard-library-name'
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1)

    request.onerror = () => {
      reject(request.error)
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
}

function splitFileName(name: string) {
  const extensionIndex = name.lastIndexOf('.')

  if (extensionIndex === -1) {
    return {
      baseName: name,
      extension: '',
    }
  }

  return {
    baseName: name.slice(0, extensionIndex),
    extension: name.slice(extensionIndex),
  }
}

function isNotFoundError(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

function isImageFile(name: string) {
  const lowerName = name.toLowerCase()

  return IMAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

async function createUniqueFileName(directoryHandle: FileSystemDirectoryHandle, name: string) {
  const normalizedName = sanitizeFileName(name) || 'breadboard-image'
  const { baseName, extension } = splitFileName(normalizedName)
  let candidateName = `${baseName}${extension}`
  let counter = 2

  while (true) {
    try {
      await directoryHandle.getFileHandle(candidateName)
      candidateName = `${baseName}-${counter}${extension}`
      counter += 1
    } catch (error) {
      if (isNotFoundError(error)) {
        return candidateName
      }

      throw error
    }
  }
}

export async function persistBreadboardLibraryHandle(handle: FileSystemDirectoryHandle) {
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const request = transaction.objectStore(STORE_NAME).put(handle, DIRECTORY_KEY)

    request.onerror = () => {
      reject(request.error)
    }
    transaction.oncomplete = () => {
      resolve()
    }
    transaction.onerror = () => {
      reject(transaction.error)
    }
  })

  database.close()
  window.localStorage.setItem(DIRECTORY_NAME_KEY, handle.name)
}

export async function restoreBreadboardLibraryHandle() {
  const database = await openDatabase()
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(DIRECTORY_KEY)

    request.onerror = () => {
      reject(request.error)
    }
    request.onsuccess = () => {
      resolve(request.result as FileSystemDirectoryHandle | undefined)
    }
  })

  database.close()

  return handle
}

export function getStoredBreadboardLibraryName() {
  return window.localStorage.getItem(DIRECTORY_NAME_KEY) ?? undefined
}

export async function canReadBreadboardLibrary(handle: FileSystemDirectoryHandle) {
  const permissionAwareHandle = handle as PermissionAwareDirectoryHandle

  if (!permissionAwareHandle.queryPermission) {
    return true
  }

  const permission = await permissionAwareHandle.queryPermission({ mode: 'readwrite' })

  return permission === 'granted'
}

export async function saveBreadboardImageToFolder(
  directoryHandle: FileSystemDirectoryHandle,
  file: File,
) {
  const fileName = await createUniqueFileName(directoryHandle, file.name)
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true })
  const writableStream = await fileHandle.createWritable()

  await writableStream.write(file)
  await writableStream.close()

  return fileName
}

export async function loadSavedBreadboards(directoryHandle: FileSystemDirectoryHandle) {
  const savedBreadboards: SavedBreadboard[] = []

  for await (const entry of directoryHandle.values()) {
    if (entry.kind !== 'file' || !isImageFile(entry.name)) {
      continue
    }

    const file = await entry.getFile()

    savedBreadboards.push({
      name: entry.name,
      url: URL.createObjectURL(file),
    })
  }

  savedBreadboards.sort((left, right) => left.name.localeCompare(right.name))

  return savedBreadboards
}