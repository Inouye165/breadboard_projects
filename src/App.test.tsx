import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import App from './App'
import type { SavedWorkspace } from './lib/imageAlignment'
import * as imageOrientation from './lib/imageOrientation'
import * as imageWorkspaceApi from './lib/imageWorkspaceApi'

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
const mockedOrientation = vi.mocked(imageOrientation)

const savedWorkspace: SavedWorkspace = {
  imageName: 'board.png',
  imagePath: '/__breadboard_local__/images/board.png',
  alignment: {
    rotationDegrees: 12,
    referencePoints: null,
  },
}

beforeEach(() => {
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
    expect(screen.getByLabelText(/nudge step/i)).toBeTruthy()
    expect(screen.getByLabelText(/step size/i)).toBeTruthy()
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
