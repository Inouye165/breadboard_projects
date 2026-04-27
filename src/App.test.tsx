import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import App from './App'
import type { BreadboardDefinition } from './lib/breadboardDefinitionModel'
import * as breadboardDefinitionApi from './lib/breadboardDefinitionApi'
import type { SavedWorkspace } from './lib/imageAlignment'
import * as imageOrientation from './lib/imageOrientation'
import * as imageWorkspaceApi from './lib/imageWorkspaceApi'

vi.mock('./components/ImageWorkspace', async () => {
  const React = await import('react')

  return {
    ImageWorkspace: function MockImageWorkspace(props: {
      currentDefinitionName: string
      definitionOptions: Array<{ id: string; name: string }>
      imageName?: string
      imagePath?: string
      rotationDegrees: number
      status: string
      onCreateDefinition: () => void
      onCurrentDefinitionNameChange: (value: string) => void
      onDefinitionSelected: (definitionId: string) => void
      onGuideLineChange: (value: number) => void
      onGuideLineStepChange: (value: number) => void
      onImageDimensionsChange?: (dimensions: { width: number; height: number }) => void
      onNudgeGuideLine: (direction: -1 | 1, multiplier?: number) => void
      onRotateLeft: (multiplier?: number) => void
      onRotateRight: (multiplier?: number) => void
      onRotationStepChange: (value: number) => void
      onSaveAlignment: () => void
      onSaveDefinition: () => void
      onUploadRequest: () => void
    }) {
      const {
        currentDefinitionName,
        definitionOptions,
        imageName,
        imagePath,
        onCreateDefinition,
        onCurrentDefinitionNameChange,
        onDefinitionSelected,
        onGuideLineChange,
        onGuideLineStepChange,
        onImageDimensionsChange,
        onNudgeGuideLine,
        onRotateLeft,
        onRotateRight,
        onRotationStepChange,
        onSaveAlignment,
        onSaveDefinition,
        onUploadRequest,
        rotationDegrees,
        status,
      } = props

      React.useEffect(() => {
        if (imagePath) {
          onImageDimensionsChange?.({ width: 1200, height: 600 })
        }
      }, [imagePath, onImageDimensionsChange])

      if (!imagePath) {
        return (
          <section aria-label="Image alignment workspace">
            <h2>Upload a breadboard image to begin.</h2>
            <button type="button" onClick={onUploadRequest}>
              Upload image
            </button>
          </section>
        )
      }

      return (
        <section aria-label="Image alignment workspace">
          <p>{status}</p>
          <button type="button" onClick={onUploadRequest}>
            Replace image
          </button>
          <label htmlFor="current-definition-name">Current definition name</label>
          <input
            id="current-definition-name"
            value={currentDefinitionName}
            onChange={(event) => onCurrentDefinitionNameChange(event.target.value)}
          />
          <label htmlFor="definition-list">Load definition list</label>
          <select id="definition-list" onChange={(event) => onDefinitionSelected(event.target.value)}>
            <option value="">Select a saved definition</option>
            {definitionOptions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={onCreateDefinition}>
            New definition
          </button>
          <button type="button" onClick={onSaveDefinition}>
            Save definition
          </button>
          <label htmlFor="guide-line-position">Position</label>
          <input
            id="guide-line-position"
            type="range"
            value={25}
            onChange={(event) => onGuideLineChange(Number(event.target.value))}
          />
          <label htmlFor="guide-line-step">Nudge step</label>
          <input
            id="guide-line-step"
            type="range"
            value={0.5}
            onChange={(event) => onGuideLineStepChange(Number(event.target.value))}
          />
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
          <button type="button" onClick={() => onNudgeGuideLine(-1, 1)}>
            Nudge up
          </button>
          <button type="button" onClick={() => onNudgeGuideLine(1, 1)}>
            Nudge down
          </button>
          <button type="button" onClick={onSaveAlignment}>
            Save alignment
          </button>
          <div role="img" aria-label={imageName ? `Breadboard image ${imageName}` : 'Breadboard image'} data-rotation-degrees={rotationDegrees.toString()} />
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
const mockedOrientation = vi.mocked(imageOrientation)

const savedWorkspace: SavedWorkspace = {
  imageName: 'board.png',
  imagePath: '/__breadboard_local__/images/board.png',
  alignment: {
    rotationDegrees: 12,
    referencePoints: null,
  },
}

const savedDefinition: BreadboardDefinition = {
  id: 'definition-1',
  name: 'Board definition',
  imageName: 'board.png',
  imagePath: '/__breadboard_local__/images/board.png',
  imageWidth: 1200,
  imageHeight: 600,
  points: [],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
}

beforeEach(() => {
  mockedDefinitionApi.createBreadboardDefinitionRecord.mockImplementation(async (definition) => definition)
  mockedDefinitionApi.listBreadboardDefinitions.mockResolvedValue([])
  mockedDefinitionApi.loadBreadboardDefinition.mockResolvedValue(savedDefinition)
  mockedDefinitionApi.updateBreadboardDefinitionRecord.mockImplementation(async (definition) => definition)
  mockedApi.loadSavedWorkspace.mockResolvedValue(null)
  mockedApi.saveWorkspace.mockImplementation(async (workspace) => workspace)
  mockedApi.uploadWorkspaceImage.mockResolvedValue(savedWorkspace)

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
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('shows the upload flow when no saved image exists', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: /upload a breadboard image to begin/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /upload image/i })).toBeTruthy()
  })

  it('auto-loads the saved image workspace and shows manual rotation controls', async () => {
    mockedApi.loadSavedWorkspace.mockResolvedValue(savedWorkspace)

    render(<App />)

    expect(await screen.findByRole('img', { name: /breadboard image board.png/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /rotate left/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /rotate right/i })).toBeTruthy()
    expect(screen.getByLabelText(/position/i)).toBeTruthy()
    expect(screen.getByLabelText(/current definition name/i)).toBeTruthy()
    expect(screen.getByLabelText(/nudge step/i)).toBeTruthy()
    expect(screen.getByLabelText(/step size/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /connection point/i })).toBeNull()
  })

  it('saves a breadboard definition without requiring any overlay point interaction', async () => {
    mockedApi.loadSavedWorkspace.mockResolvedValue(savedWorkspace)

    render(<App />)

    await screen.findByRole('img', { name: /breadboard image board.png/i })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save definition/i }).hasAttribute('disabled')).toBe(false)
    })

    fireEvent.change(screen.getByLabelText(/current definition name/i), {
      target: { value: 'Saved board' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save definition/i }))

    await waitFor(() => {
      expect(mockedDefinitionApi.createBreadboardDefinitionRecord).toHaveBeenCalled()
    })

    expect(mockedDefinitionApi.createBreadboardDefinitionRecord.mock.calls[0][0]).toMatchObject({
      name: 'Saved board',
      imageName: 'board.png',
      imageWidth: 1200,
      imageHeight: 600,
      points: [],
    })
    expect(screen.queryByRole('button', { name: /connection point/i })).toBeNull()
  })

  it('uploads a selected image through the local persistence API', async () => {
    render(<App />)

    const input = await screen.findByLabelText(/upload breadboard image/i)
    const file = new File(['image'], 'fresh-board.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(mockedApi.uploadWorkspaceImage).toHaveBeenCalled()
    })

    expect(mockedApi.uploadWorkspaceImage.mock.calls[0][0]).toBe(file)
  })

  it('applies a manual rotation amount to the preview', async () => {
    mockedApi.loadSavedWorkspace.mockResolvedValue(savedWorkspace)

    render(<App />)

    const stage = await screen.findByRole('img', { name: /breadboard image board.png/i })

    fireEvent.change(screen.getByLabelText(/step size/i), { target: { value: '0.5' } })
    fireEvent.click(screen.getByRole('button', { name: /rotate right/i }))

    expect(stage.getAttribute('data-rotation-degrees')).toBe('12.5')
  })

  it('bakes the preview rotation into a newly uploaded image and resets stored metadata', async () => {
    mockedApi.loadSavedWorkspace.mockResolvedValue(savedWorkspace)
    mockedApi.uploadWorkspaceImage.mockResolvedValue({
      imageName: 'board.png',
      imagePath: '/__breadboard_local__/images/rotated-board.png',
      alignment: {
        rotationDegrees: 0,
        referencePoints: null,
      },
    })

    render(<App />)

    await screen.findByRole('img', { name: /breadboard image board.png/i })

    fireEvent.change(screen.getByLabelText(/step size/i), { target: { value: '1.25' } })
    fireEvent.click(screen.getByRole('button', { name: /rotate right/i }))
    fireEvent.click(screen.getByRole('button', { name: /save alignment/i }))

    await waitFor(() => {
      expect(mockedOrientation.rotateImageFile).toHaveBeenCalled()
      expect(mockedApi.uploadWorkspaceImage).toHaveBeenCalled()
    })

    const uploadedCall = mockedApi.uploadWorkspaceImage.mock.calls.at(-1)
    expect(uploadedCall?.[2]).toBeTruthy()
  })
})
