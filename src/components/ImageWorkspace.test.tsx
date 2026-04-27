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
  it('renders the guide line and manual rotation controls', async () => {
    render(
      <ImageWorkspace
        currentDefinitionName="Board A"
        definitionOptions={[]}
        imageName="board.png"
        imagePath="/board.png"
        rotationDegrees={0}
        guideLinePercent={25}
        rotationStep={0.25}
        guideLineStep={0.5}
        status="Adjust manually"
        onCreateDefinition={vi.fn()}
        onCurrentDefinitionNameChange={vi.fn()}
        onDefinitionSelected={vi.fn()}
        onUploadRequest={vi.fn()}
        onGuideLineChange={vi.fn()}
        onImageDimensionsChange={vi.fn()}
        onRotationStepChange={vi.fn()}
        onGuideLineStepChange={vi.fn()}
        onRotateLeft={vi.fn()}
        onRotateRight={vi.fn()}
        onNudgeGuideLine={vi.fn()}
        onResetAlignment={vi.fn()}
        onSaveDefinition={vi.fn()}
        onSaveAlignment={vi.fn()}
      />,
    )

    const stage = await screen.findByRole('img', { name: /breadboard image board.png/i })

    expect(stage.querySelector('.image-stage__guide-line')).toBeTruthy()
    expect(screen.getByLabelText(/position/i)).toBeTruthy()
    expect(screen.getByLabelText(/nudge step/i)).toBeTruthy()
    expect(screen.getByLabelText(/step size/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /rotate left/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /rotate right/i })).toBeTruthy()
  })

  it('does not render pin or grid overlays', async () => {
    const { container } = render(
      <ImageWorkspace
        currentDefinitionName="Board A"
        definitionOptions={[]}
        imageName="board.png"
        imagePath="/board.png"
        rotationDegrees={0}
        guideLinePercent={50}
        rotationStep={0.5}
        guideLineStep={0.5}
        status="Adjust manually"
        onCreateDefinition={vi.fn()}
        onCurrentDefinitionNameChange={vi.fn()}
        onDefinitionSelected={vi.fn()}
        onUploadRequest={vi.fn()}
        onGuideLineChange={vi.fn()}
        onImageDimensionsChange={vi.fn()}
        onRotationStepChange={vi.fn()}
        onGuideLineStepChange={vi.fn()}
        onRotateLeft={vi.fn()}
        onRotateRight={vi.fn()}
        onNudgeGuideLine={vi.fn()}
        onResetAlignment={vi.fn()}
        onSaveDefinition={vi.fn()}
        onSaveAlignment={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /breadboard image board.png/i })).toBeTruthy()
    })

    expect(screen.queryByRole('button', { name: /connection point/i })).toBeNull()
    expect(container.querySelector('.part-canvas__overlay')).toBeNull()
  })

  it('renders the image stage with width-driven sizing and no fixed crop', async () => {
    render(
      <ImageWorkspace
        currentDefinitionName="Board A"
        definitionOptions={[]}
        imageName="board.png"
        imagePath="/board.png"
        rotationDegrees={0}
        guideLinePercent={25}
        rotationStep={0.25}
        guideLineStep={0.5}
        status="Saved image loaded"
        onCreateDefinition={vi.fn()}
        onCurrentDefinitionNameChange={vi.fn()}
        onDefinitionSelected={vi.fn()}
        onUploadRequest={vi.fn()}
        onGuideLineChange={vi.fn()}
        onImageDimensionsChange={vi.fn()}
        onRotationStepChange={vi.fn()}
        onGuideLineStepChange={vi.fn()}
        onRotateLeft={vi.fn()}
        onRotateRight={vi.fn()}
        onNudgeGuideLine={vi.fn()}
        onResetAlignment={vi.fn()}
        onSaveDefinition={vi.fn()}
        onSaveAlignment={vi.fn()}
      />,
    )

    const stage = await screen.findByRole('img', { name: /breadboard image board.png/i })

    expect(stage.tagName.toLowerCase()).toBe('svg')
    expect(stage.classList.contains('image-stage__svg')).toBe(true)
    expect(stage.getAttribute('viewBox')).toBe('0 0 1000 500')
  })

  it('nudges rotation and guide line from the keyboard when the stage is focused', async () => {
    const onRotateLeft = vi.fn()
    const onRotateRight = vi.fn()
    const onNudgeGuideLine = vi.fn()

    render(
      <ImageWorkspace
        currentDefinitionName="Board A"
        definitionOptions={[]}
        imageName="board.png"
        imagePath="/board.png"
        rotationDegrees={0}
        guideLinePercent={25}
        rotationStep={0.25}
        guideLineStep={0.5}
        status="Saved image loaded"
        onCreateDefinition={vi.fn()}
        onCurrentDefinitionNameChange={vi.fn()}
        onDefinitionSelected={vi.fn()}
        onUploadRequest={vi.fn()}
        onGuideLineChange={vi.fn()}
        onImageDimensionsChange={vi.fn()}
        onRotationStepChange={vi.fn()}
        onGuideLineStepChange={vi.fn()}
        onRotateLeft={onRotateLeft}
        onRotateRight={onRotateRight}
        onNudgeGuideLine={onNudgeGuideLine}
        onResetAlignment={vi.fn()}
        onSaveDefinition={vi.fn()}
        onSaveAlignment={vi.fn()}
      />,
    )

    const stage = await screen.findByRole('img', { name: /breadboard image board.png/i })

    fireEvent.keyDown(stage, { key: 'ArrowLeft' })
    fireEvent.keyDown(stage, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(stage, { key: 'ArrowUp' })
    fireEvent.keyDown(stage, { key: 'ArrowDown', shiftKey: true })

    expect(onRotateLeft).toHaveBeenCalledWith(1)
    expect(onRotateRight).toHaveBeenCalledWith(10)
    expect(onNudgeGuideLine).toHaveBeenCalledWith(-1, 1)
    expect(onNudgeGuideLine).toHaveBeenCalledWith(1, 10)
  })
})
