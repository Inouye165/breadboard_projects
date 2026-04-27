import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import App from './App'
import type { BreadboardDefinition } from './lib/breadboardDefinitionModel'
import * as breadboardDefinitionApi from './lib/breadboardDefinitionApi'
import * as breadboardProjectApi from './lib/breadboardProjectApi'
import type { BreadboardProject } from './lib/breadboardProjectModel'
import type { SavedWorkspace } from './lib/imageAlignment'
import * as imageOrientation from './lib/imageOrientation'
import * as imageWorkspaceApi from './lib/imageWorkspaceApi'

vi.mock('./components/ImageWorkspace', async () => {
  const React = await import('react')

  return {
    ImageWorkspace: function MockImageWorkspace(props: {
      imageName?: string
      imagePath?: string
      rotationDegrees: number
      status: string
      canContinueToPoints?: boolean
      onImageDimensionsChange?: (dimensions: { width: number; height: number }) => void
      onUploadRequest: () => void
      onRotateLeft: (multiplier?: number) => void
      onRotateRight: (multiplier?: number) => void
      onRotationStepChange: (value: number) => void
      onSaveAlignment: () => void
      onBackToHome?: () => void
      onContinueToPoints?: () => void
    }) {
      const {
        imageName,
        imagePath,
        rotationDegrees,
        status,
        canContinueToPoints,
        onImageDimensionsChange,
        onUploadRequest,
        onRotateLeft,
        onRotateRight,
        onRotationStepChange,
        onSaveAlignment,
        onBackToHome,
        onContinueToPoints,
      } = props

      React.useEffect(() => {
        if (imagePath) {
          onImageDimensionsChange?.({ width: 1200, height: 600 })
        }
      }, [imagePath, onImageDimensionsChange])

      return (
        <section aria-label="Image alignment workspace">
          <p>{status}</p>
          {onBackToHome ? (
            <button type="button" onClick={onBackToHome}>
              Back
            </button>
          ) : null}
          <button type="button" onClick={onUploadRequest}>
            Replace image
          </button>
          <label htmlFor="rotation-step">Step size</label>
          <input
            id="rotation-step"
            type="range"
            value={0.25}
            onChange={(event) => onRotationStepChange(Number(event.target.value))}
          />
          <button type="button" onClick={() => onRotateLeft()}>
            Rotate left
          </button>
          <button type="button" onClick={() => onRotateRight()}>
            Rotate right
          </button>
          <button type="button" onClick={onSaveAlignment}>
            Save alignment
          </button>
          {onContinueToPoints ? (
            <button
              type="button"
              onClick={onContinueToPoints}
              disabled={!canContinueToPoints}
            >
              Continue to pin holes
            </button>
          ) : null}
          {imagePath ? (
            <div
              role="img"
              aria-label={imageName ? `Breadboard image ${imageName}` : 'Breadboard image'}
              data-rotation-degrees={rotationDegrees.toString()}
            />
          ) : null}
        </section>
      )
    },
  }
})

vi.mock('./lib/breadboardDefinitionApi', () => ({
  createBreadboardDefinitionRecord: vi.fn(),
  listBreadboardDefinitions: vi.fn(),
  loadBreadboardDefinition: vi.fn(),
  updateBreadboardDefinitionRecord: vi.fn(),
}))

vi.mock('./lib/breadboardProjectApi', () => ({
  createBreadboardProjectRecord: vi.fn(),
  listBreadboardProjects: vi.fn(),
  loadBreadboardProject: vi.fn(),
  updateBreadboardProjectRecord: vi.fn(),
  deleteBreadboardProjectRecord: vi.fn(),
}))

vi.mock('./lib/imageWorkspaceApi', () => ({
  loadSavedWorkspace: vi.fn(),
  saveWorkspace: vi.fn(),
  uploadWorkspaceImage: vi.fn(),
}))

vi.mock('./lib/imageOrientation', () => ({
  ensureLandscapeFile: vi.fn(async (file: File) => file),
  rotateImageFile: vi.fn(async (file: File) => file),
}))

const mockedApi = vi.mocked(imageWorkspaceApi)
const mockedDefinitionApi = vi.mocked(breadboardDefinitionApi)
const mockedProjectApi = vi.mocked(breadboardProjectApi)
const mockedOrientation = vi.mocked(imageOrientation)

const uploadedWorkspace: SavedWorkspace = {
  imageName: 'board.png',
  imagePath: '/__breadboard_local__/images/board.png',
  alignment: {
    rotationDegrees: 0,
    referencePoints: null,
  },
}

const savedDefinition: BreadboardDefinition = {
  id: 'definition-1',
  name: 'Saved board',
  imageName: 'board.png',
  imagePath: '/__breadboard_local__/images/board.png',
  imageWidth: 1200,
  imageHeight: 600,
  points: [],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
}

const wireableDefinition: BreadboardDefinition = {
  ...savedDefinition,
  points: [
    { id: 'p1', label: 'A1', x: 100, y: 100, kind: 'breadboard-hole' },
    { id: 'p2', label: 'A2', x: 300, y: 100, kind: 'breadboard-hole' },
    { id: 'p3', label: 'A3', x: 500, y: 200, kind: 'breadboard-hole' },
  ],
}

const savedProject: BreadboardProject = {
  id: 'project-1',
  name: 'Saved project',
  breadboardDefinitionId: 'definition-1',
  wires: [
    { id: 'wire-1', fromPointId: 'p1', toPointId: 'p2', color: '#cc3333' },
  ],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
}

beforeEach(() => {
  mockedDefinitionApi.createBreadboardDefinitionRecord.mockImplementation(async (definition) => ({
    ...definition,
    id: definition.id || 'created-1',
  }))
  mockedDefinitionApi.listBreadboardDefinitions.mockResolvedValue([])
  mockedDefinitionApi.loadBreadboardDefinition.mockResolvedValue(savedDefinition)
  mockedDefinitionApi.updateBreadboardDefinitionRecord.mockImplementation(async (definition) => definition)
  mockedProjectApi.listBreadboardProjects.mockResolvedValue([])
  mockedProjectApi.loadBreadboardProject.mockResolvedValue(savedProject)
  mockedProjectApi.createBreadboardProjectRecord.mockImplementation(async (project) => ({
    ...project,
    id: project.id || 'created-project-1',
  }))
  mockedProjectApi.updateBreadboardProjectRecord.mockImplementation(async (project) => project)
  mockedProjectApi.deleteBreadboardProjectRecord.mockResolvedValue(undefined)
  mockedApi.loadSavedWorkspace.mockResolvedValue(null)
  mockedApi.saveWorkspace.mockImplementation(async (workspace) => workspace)
  mockedApi.uploadWorkspaceImage.mockResolvedValue(uploadedWorkspace)

  class MockImage {
    naturalWidth = 1200

    naturalHeight = 600

    onload: null | (() => void) = null

    onerror: null | (() => void) = null

    set src(_value: string) {
      this.onload?.()
    }
  }

  vi.stubGlobal('Image', MockImage)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/png' }),
    } as Response),
  )

  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    top: 0,
    width: 1200,
    height: 600,
    right: 1200,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function uploadAndReachAlignStep() {
  const input = await screen.findByLabelText(/upload breadboard image/i)
  const file = new File(['image'], 'fresh-board.png', { type: 'image/png' })

  fireEvent.change(input, { target: { files: [file] } })

  await screen.findByRole('button', { name: /save alignment/i })
}

describe('App wizard flow', () => {
  it('shows the home screen with an Add breadboard button when no breadboards exist', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: /your breadboards/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /add breadboard/i })).toBeTruthy()
    expect(screen.getByText(/no breadboards yet/i)).toBeTruthy()
  })

  it('lists saved breadboards on the home screen and lets the user open one', async () => {
    mockedDefinitionApi.listBreadboardDefinitions.mockResolvedValue([savedDefinition])

    render(<App />)

    expect(await screen.findByText('Saved board')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /open/i }))

    await waitFor(() => {
      expect(mockedDefinitionApi.loadBreadboardDefinition).toHaveBeenCalledWith('definition-1')
    })

    // Goes straight to the pin point editor.
    expect(await screen.findByLabelText(/breadboard pin hole canvas/i)).toBeTruthy()
    expect(screen.getByLabelText(/breadboard name/i)).toBeTruthy()
  })

  it('walks through upload -> align -> add pin holes -> save', async () => {
    render(<App />)

    await screen.findByRole('button', { name: /add breadboard/i })

    // Step 1: upload
    await uploadAndReachAlignStep()

    expect(mockedApi.uploadWorkspaceImage).toHaveBeenCalled()
    expect(screen.getByRole('img', { name: /breadboard image board.png/i })).toBeTruthy()

    // Save alignment with no rotation
    fireEvent.click(screen.getByRole('button', { name: /save alignment/i }))

    await waitFor(() => {
      expect(mockedApi.saveWorkspace).toHaveBeenCalled()
    })

    // Continue to pin holes
    const continueButton = await screen.findByRole('button', { name: /continue to pin holes/i })
    await waitFor(() => {
      expect(continueButton.hasAttribute('disabled')).toBe(false)
    })
    fireEvent.click(continueButton)

    // Step 2: pin holes editor
    const canvas = await screen.findByLabelText(/breadboard pin hole canvas/i)
    expect(canvas).toBeTruthy()
    expect(
      screen.getByText((_, element) => element?.textContent === '0 pin holes placed'),
    ).toBeTruthy()

    // Click the canvas to add a pin
    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 50 })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === '1 pin hole placed'),
      ).toBeTruthy()
    })

    // Save the breadboard
    fireEvent.change(screen.getByLabelText(/breadboard name/i), { target: { value: 'My board' } })
    fireEvent.click(screen.getByRole('button', { name: /save breadboard/i }))

    await waitFor(() => {
      expect(mockedDefinitionApi.createBreadboardDefinitionRecord).toHaveBeenCalled()
    })

    const savedPayload = mockedDefinitionApi.createBreadboardDefinitionRecord.mock.calls[0][0]
    expect(savedPayload).toMatchObject({
      name: 'My board',
      imageName: 'board.png',
      imageWidth: 1200,
      imageHeight: 600,
    })
    expect(savedPayload.points).toHaveLength(1)
    expect(savedPayload.points[0].kind).toBe('breadboard-hole')

    // Returns to home screen
    expect(await screen.findByRole('heading', { name: /your breadboards/i })).toBeTruthy()
  })

  it('bakes a preview rotation into the image during alignment', async () => {
    render(<App />)
    await screen.findByRole('button', { name: /add breadboard/i })
    await uploadAndReachAlignStep()

    fireEvent.change(screen.getByLabelText(/step size/i), { target: { value: '1.25' } })
    fireEvent.click(screen.getByRole('button', { name: /rotate right/i }))
    fireEvent.click(screen.getByRole('button', { name: /save alignment/i }))

    await waitFor(() => {
      expect(mockedOrientation.rotateImageFile).toHaveBeenCalled()
    })
  })

  it('returns to the home screen from the alignment step', async () => {
    render(<App />)
    await screen.findByRole('button', { name: /add breadboard/i })
    await uploadAndReachAlignStep()

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))

    expect(await screen.findByRole('heading', { name: /your breadboards/i })).toBeTruthy()
  })

  it('starts a project, picks a breadboard, and saves a wire between two pins', async () => {
    mockedDefinitionApi.listBreadboardDefinitions.mockResolvedValue([wireableDefinition])
    mockedDefinitionApi.loadBreadboardDefinition.mockResolvedValue(wireableDefinition)

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: /start project/i }))

    fireEvent.click(await screen.findByRole('button', { name: /use this breadboard/i }))

    await screen.findByRole('button', { name: /Pin hole A1/ })
    fireEvent.click(screen.getByRole('button', { name: /Pin hole A1/ }))
    fireEvent.click(screen.getByRole('button', { name: /Pin hole A2/ }))

    await waitFor(() => {
      expect(mockedProjectApi.createBreadboardProjectRecord).toHaveBeenCalled()
    })

    const createdProject = mockedProjectApi.createBreadboardProjectRecord.mock.calls[0][0]
    expect(createdProject.breadboardDefinitionId).toBe('definition-1')
    expect(createdProject.wires).toHaveLength(1)
    expect(createdProject.wires[0].fromPointId).toBe('p1')
    expect(createdProject.wires[0].toPointId).toBe('p2')
  })

  it('lists saved projects on the home screen and lets the user open one for wiring', async () => {
    mockedDefinitionApi.listBreadboardDefinitions.mockResolvedValue([wireableDefinition])
    mockedDefinitionApi.loadBreadboardDefinition.mockResolvedValue(wireableDefinition)
    mockedProjectApi.listBreadboardProjects.mockResolvedValue([savedProject])

    render(<App />)

    expect(await screen.findByText('Saved project')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /open project/i }))

    await waitFor(() => {
      expect(mockedProjectApi.loadBreadboardProject).toHaveBeenCalledWith('project-1')
    })

    expect(await screen.findByLabelText(/Wire from A1 to A2/)).toBeTruthy()
  })
})
