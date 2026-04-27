import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

import {
  deleteBreadboardDefinition,
  listBreadboardDefinitions,
  readBreadboardDefinition,
  saveBreadboardDefinition,
} from './server/breadboardDefinitionStore'
import {
  deleteBreadboardProject,
  listBreadboardProjects,
  readBreadboardProject,
  saveBreadboardProject,
} from './server/breadboardProjectStore'

const WORKSPACE_STORAGE_DIR = path.resolve(__dirname, '.breadboard-local')
const BREADBOARD_DEFINITIONS_DIR = path.join(WORKSPACE_STORAGE_DIR, 'definitions')
const BREADBOARD_PROJECTS_DIR = path.join(WORKSPACE_STORAGE_DIR, 'projects')
const WORKSPACE_IMAGE_DIR = path.join(WORKSPACE_STORAGE_DIR, 'images')
const WORKSPACE_METADATA_FILE = path.join(WORKSPACE_STORAGE_DIR, 'workspace.json')
const WORKSPACE_IMAGE_BASE_PATH = '/__breadboard_local__/images/'
const PART_DEFINITIONS_ENDPOINT = '/api/part-definitions'
const PROJECTS_ENDPOINT = '/api/projects'

type AlignmentPoint = {
  x: number
  y: number
}

type SavedWorkspace = {
  imageName: string
  imagePath: string
  alignment: {
    rotationDegrees: number
    referencePoints: [AlignmentPoint, AlignmentPoint] | null
  }
}

type UploadPayload = {
  contentsBase64?: string
  name?: string
}

type MiddlewareRequest = IncomingMessage & {
  method?: string
  url?: string
}

type MiddlewareResponse = ServerResponse<IncomingMessage>

type NextHandler = () => void

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
}

function getContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()

  switch (extension) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function createDefaultWorkspace(imageName: string, imagePath: string): SavedWorkspace {
  return {
    imageName,
    imagePath,
    alignment: {
      rotationDegrees: 0,
      referencePoints: null,
    },
  }
}

async function ensureWorkspaceStorage() {
  await mkdir(WORKSPACE_IMAGE_DIR, { recursive: true })
}

async function readRequestBody(request: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function readSavedWorkspace() {
  try {
    const rawWorkspace = await readFile(WORKSPACE_METADATA_FILE, 'utf8')

    return JSON.parse(rawWorkspace) as SavedWorkspace
  } catch {
    return null
  }
}

async function writeSavedWorkspace(workspace: SavedWorkspace) {
  await ensureWorkspaceStorage()
  await writeFile(WORKSPACE_METADATA_FILE, JSON.stringify(workspace, null, 2), 'utf8')

  return workspace
}

function sendJson(response: MiddlewareResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

function getDefinitionIdFromRequest(url: string) {
  if (!url.startsWith(PART_DEFINITIONS_ENDPOINT)) {
    return null
  }

  const remainder = url.slice(PART_DEFINITIONS_ENDPOINT.length)

  if (remainder === '' || remainder === '/') {
    return ''
  }

  if (!remainder.startsWith('/')) {
    return null
  }

  const [definitionId] = remainder.slice(1).split('/', 1)

  return definitionId ? decodeURIComponent(definitionId) : null
}

function getProjectIdFromRequest(url: string) {
  if (!url.startsWith(PROJECTS_ENDPOINT)) {
    return null
  }

  const remainder = url.slice(PROJECTS_ENDPOINT.length)

  if (remainder === '' || remainder === '/') {
    return ''
  }

  if (!remainder.startsWith('/')) {
    return null
  }

  const [projectId] = remainder.slice(1).split('/', 1)

  return projectId ? decodeURIComponent(projectId) : null
}

async function handleWorkspaceRequest(
  request: MiddlewareRequest,
  response: MiddlewareResponse,
) {
  if (request.method === 'GET') {
    sendJson(response, 200, { workspace: await readSavedWorkspace() })
    return true
  }

  if (request.method === 'POST') {
    try {
      const workspace = JSON.parse(await readRequestBody(request)) as SavedWorkspace

      sendJson(response, 200, { workspace: await writeSavedWorkspace(workspace) })
    } catch {
      sendJson(response, 400, { error: 'Invalid workspace payload.' })
    }

    return true
  }

  return false
}

async function handleWorkspaceImageUpload(
  request: MiddlewareRequest,
  response: MiddlewareResponse,
) {
  if (request.method !== 'POST') {
    return false
  }

  try {
    const payload = JSON.parse(await readRequestBody(request)) as UploadPayload

    if (!payload.name || !payload.contentsBase64) {
      sendJson(response, 400, { error: 'Missing image upload payload.' })
      return true
    }

    await ensureWorkspaceStorage()

    const fileName = `${Date.now()}-${sanitizeFileName(payload.name) || 'breadboard-image.png'}`
    const filePath = path.join(WORKSPACE_IMAGE_DIR, fileName)

    await writeFile(filePath, Buffer.from(payload.contentsBase64, 'base64'))

    const workspace = await writeSavedWorkspace(
      createDefaultWorkspace(payload.name, `${WORKSPACE_IMAGE_BASE_PATH}${fileName}`),
    )

    sendJson(response, 200, { workspace })
  } catch {
    sendJson(response, 400, { error: 'Could not save the uploaded image.' })
  }

  return true
}

async function handleWorkspaceImageRead(
  request: MiddlewareRequest,
  response: MiddlewareResponse,
) {
  if (request.method !== 'GET' || !request.url) {
    return false
  }

  const relativeImagePath = request.url.slice(WORKSPACE_IMAGE_BASE_PATH.length)
  const filePath = path.join(WORKSPACE_IMAGE_DIR, relativeImagePath)

  try {
    const fileStat = await stat(filePath)

    if (!fileStat.isFile()) {
      response.statusCode = 404
      response.end()
      return true
    }

    response.statusCode = 200
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', getContentType(filePath))
    createReadStream(filePath).pipe(response)
  } catch {
    response.statusCode = 404
    response.end()
  }

  return true
}

async function handlePartDefinitionRequest(
  request: MiddlewareRequest,
  response: MiddlewareResponse,
) {
  const requestUrl = request.url ?? ''
  const definitionId = getDefinitionIdFromRequest(requestUrl)

  if (definitionId === null) {
    return false
  }

  if (request.method === 'GET' && definitionId === '') {
    sendJson(response, 200, { definitions: await listBreadboardDefinitions(BREADBOARD_DEFINITIONS_DIR) })
    return true
  }

  if (request.method === 'GET' && definitionId) {
    const definition = await readBreadboardDefinition(BREADBOARD_DEFINITIONS_DIR, definitionId)

    if (!definition) {
      sendJson(response, 404, { error: 'Definition not found.' })
      return true
    }

    sendJson(response, 200, { definition })
    return true
  }

  if (request.method === 'POST' && definitionId === '') {
    try {
      const definition = await saveBreadboardDefinition(
        BREADBOARD_DEFINITIONS_DIR,
        JSON.parse(await readRequestBody(request)),
      )

      sendJson(response, 200, { definition })
    } catch {
      sendJson(response, 400, { error: 'Invalid definition payload.' })
    }

    return true
  }

  if (request.method === 'PUT' && definitionId) {
    try {
      const payload = JSON.parse(await readRequestBody(request)) as { id?: string }

      if (payload.id !== definitionId) {
        sendJson(response, 400, { error: 'Definition id mismatch.' })
        return true
      }

      const definition = await saveBreadboardDefinition(BREADBOARD_DEFINITIONS_DIR, payload)

      sendJson(response, 200, { definition })
    } catch {
      sendJson(response, 400, { error: 'Invalid definition payload.' })
    }

    return true
  }

  if (request.method === 'DELETE' && definitionId) {
    const deleted = await deleteBreadboardDefinition(BREADBOARD_DEFINITIONS_DIR, definitionId)

    if (!deleted) {
      sendJson(response, 404, { error: 'Definition not found.' })
      return true
    }

    sendJson(response, 200, { success: true })
    return true
  }

  return false
}

async function handleProjectRequest(
  request: MiddlewareRequest,
  response: MiddlewareResponse,
) {
  const requestUrl = request.url ?? ''
  const projectId = getProjectIdFromRequest(requestUrl)

  if (projectId === null) {
    return false
  }

  if (request.method === 'GET' && projectId === '') {
    sendJson(response, 200, { projects: await listBreadboardProjects(BREADBOARD_PROJECTS_DIR) })
    return true
  }

  if (request.method === 'GET' && projectId) {
    const project = await readBreadboardProject(BREADBOARD_PROJECTS_DIR, projectId)

    if (!project) {
      sendJson(response, 404, { error: 'Project not found.' })
      return true
    }

    sendJson(response, 200, { project })
    return true
  }

  if (request.method === 'POST' && projectId === '') {
    try {
      const project = await saveBreadboardProject(
        BREADBOARD_PROJECTS_DIR,
        JSON.parse(await readRequestBody(request)),
      )

      sendJson(response, 200, { project })
    } catch {
      sendJson(response, 400, { error: 'Invalid project payload.' })
    }

    return true
  }

  if (request.method === 'PUT' && projectId) {
    try {
      const payload = JSON.parse(await readRequestBody(request)) as { id?: string }

      if (payload.id !== projectId) {
        sendJson(response, 400, { error: 'Project id mismatch.' })
        return true
      }

      const project = await saveBreadboardProject(BREADBOARD_PROJECTS_DIR, payload)

      sendJson(response, 200, { project })
    } catch {
      sendJson(response, 400, { error: 'Invalid project payload.' })
    }

    return true
  }

  if (request.method === 'DELETE' && projectId) {
    const deleted = await deleteBreadboardProject(BREADBOARD_PROJECTS_DIR, projectId)

    if (!deleted) {
      sendJson(response, 404, { error: 'Project not found.' })
      return true
    }

    sendJson(response, 200, { success: true })
    return true
  }

  return false
}

function createWorkspacePersistenceMiddleware() {
  return (request: MiddlewareRequest, response: MiddlewareResponse, next: NextHandler) => {
    const requestUrl = request.url ?? ''

    if (requestUrl.startsWith(PART_DEFINITIONS_ENDPOINT)) {
      void handlePartDefinitionRequest(request, response).then((handled) => {
        if (!handled) {
          next()
        }
      })
      return
    }

    if (requestUrl.startsWith(PROJECTS_ENDPOINT)) {
      void handleProjectRequest(request, response).then((handled) => {
        if (!handled) {
          next()
        }
      })
      return
    }

    if (requestUrl.startsWith('/api/workspace/image')) {
      void handleWorkspaceImageUpload(request, response).then((handled) => {
        if (!handled) {
          next()
        }
      })
      return
    }

    if (requestUrl === '/api/workspace') {
      void handleWorkspaceRequest(request, response).then((handled) => {
        if (!handled) {
          next()
        }
      })
      return
    }

    if (requestUrl.startsWith(WORKSPACE_IMAGE_BASE_PATH)) {
      void handleWorkspaceImageRead(request, response).then((handled) => {
        if (!handled) {
          next()
        }
      })
      return
    }

    next()
  }
}

function imageWorkspacePersistencePlugin(): Plugin {
  return {
    name: 'image-workspace-persistence',
    configureServer(server) {
      server.middlewares.use(createWorkspacePersistenceMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createWorkspacePersistenceMiddleware())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), imageWorkspacePersistencePlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    globals: true,
    fileParallelism: false,
    reporters: 'verbose',
  },
})
