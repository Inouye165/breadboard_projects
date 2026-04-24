import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import { ImageWorkspace } from './ImageWorkspace'

beforeEach(() => {
  class MockImage {
    naturalWidth = 1000

    naturalHeight = 500

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

describe('ImageWorkspace', () => {
  it('requires two clicks in alignment mode before the transform is updated', async () => {
    const onStagePointSelect = vi.fn()

    render(
      <ImageWorkspace
        imageName="board.png"
        imagePath="/board.png"
        rotationDegrees={0}
        pendingPoints={[]}
        isAlignmentMode
        status="Pick two points"
        onUploadRequest={vi.fn()}
        onEnterAlignmentMode={vi.fn()}
        onResetAlignment={vi.fn()}
        onSaveAlignment={vi.fn()}
        onStagePointSelect={onStagePointSelect}
      />,
    )

    const stage = await screen.findByRole('img', { name: /breadboard image board.png/i })

    Object.defineProperty(stage, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 500,
      }),
    })

    fireEvent.click(stage, { clientX: 100, clientY: 100 })

    expect(onStagePointSelect).toHaveBeenCalledTimes(1)
    expect(onStagePointSelect).toHaveBeenLastCalledWith({ x: 100, y: 100 })

    fireEvent.click(stage, { clientX: 600, clientY: 125 })

    expect(onStagePointSelect).toHaveBeenCalledTimes(2)
    expect(onStagePointSelect).toHaveBeenLastCalledWith({ x: 600, y: 125 })
  })

  it('shows only the temporary alignment markers rather than pin or grid overlays', async () => {
    const { container } = render(
      <ImageWorkspace
        imageName="board.png"
        imagePath="/board.png"
        rotationDegrees={0}
        pendingPoints={[{ x: 0.25, y: 0.5 }]}
        isAlignmentMode
        status="Pick two points"
        onUploadRequest={vi.fn()}
        onEnterAlignmentMode={vi.fn()}
        onResetAlignment={vi.fn()}
        onSaveAlignment={vi.fn()}
        onStagePointSelect={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /breadboard image board.png/i })).toBeTruthy()
    })

    expect(container.querySelectorAll('.image-stage__marker')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /connection point/i })).toBeNull()
    expect(container.querySelector('.part-canvas__overlay')).toBeNull()
  })

  it('renders the image stage with width-driven sizing and no fixed crop', async () => {
    render(
      <ImageWorkspace
        imageName="board.png"
        imagePath="/board.png"
        rotationDegrees={0}
        pendingPoints={[]}
        isAlignmentMode={false}
        status="Saved image loaded"
        onUploadRequest={vi.fn()}
        onEnterAlignmentMode={vi.fn()}
        onResetAlignment={vi.fn()}
        onSaveAlignment={vi.fn()}
        onStagePointSelect={vi.fn()}
      />,
    )

    const stage = await screen.findByRole('img', { name: /breadboard image board.png/i })

    expect(stage.tagName.toLowerCase()).toBe('svg')
    expect(stage.classList.contains('image-stage__svg')).toBe(true)
    expect(stage.getAttribute('viewBox')).toBe('0 0 1000 500')
  })
})