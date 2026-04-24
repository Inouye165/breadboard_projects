import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import App from './App'
import type { SavedWorkspace } from './lib/imageAlignment'
import * as imageWorkspaceApi from './lib/imageWorkspaceApi'

vi.mock('./lib/imageWorkspaceApi', () => ({
  loadSavedWorkspace: vi.fn(),
  saveWorkspace: vi.fn(),
  uploadWorkspaceImage: vi.fn(),
}))

const mockedApi = vi.mocked(imageWorkspaceApi)

const savedWorkspace: SavedWorkspace = {
  imageName: 'board.png',
  imagePath: '/__breadboard_local__/images/board.png',
  alignment: {
    rotationDegrees: 12,
    referencePoints: [
      { x: 0.2, y: 0.4 },
      { x: 0.7, y: 0.44 },
    ],
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

  it('auto-loads the saved image workspace and keeps the old pin overlay UI out of view', async () => {
    mockedApi.loadSavedWorkspace.mockResolvedValue(savedWorkspace)

    render(<App />)

    expect(await screen.findByRole('img', { name: /breadboard image board.png/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /align horizontally/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /connection point/i })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /^region$/i })).toBeNull()
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

  it('does not over-rotate when re-aligning an image that is already horizontally aligned on screen', async () => {
    mockedApi.loadSavedWorkspace.mockResolvedValue(savedWorkspace)

    render(<App />)

    const alignButton = await screen.findByRole('button', { name: /align horizontally/i })
    const stage = await screen.findByRole('img', { name: /breadboard image board.png/i })

    Object.defineProperty(stage, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 1200,
        height: 600,
      }),
    })

    fireEvent.click(alignButton)
    fireEvent.click(stage, { clientX: 200, clientY: 220 })
    fireEvent.click(stage, { clientX: 1000, clientY: 220 })

    fireEvent.click(screen.getByRole('button', { name: /save alignment/i }))

    await waitFor(() => {
      expect(mockedApi.saveWorkspace).toHaveBeenCalled()
    })

    const lastSavedWorkspace = mockedApi.saveWorkspace.mock.calls.at(-1)?.[0]

    expect(lastSavedWorkspace?.alignment.rotationDegrees).toBeCloseTo(
      savedWorkspace.alignment.rotationDegrees,
      10,
    )
  })
})