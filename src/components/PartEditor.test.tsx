import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PartEditor } from './PartEditor'

describe('PartEditor', () => {
  it('updates the rendered image dimensions when the processed image size changes', () => {
    const { rerender } = render(
      <PartEditor
        key="1200x420"
        imageSrc="/board.png"
        imageWidth={1200}
        imageHeight={420}
        imageName="main-board"
        onReplaceImage={vi.fn()}
      />,
    )

    rerender(
      <PartEditor
        key="1788x659"
        imageSrc="/board.png"
        imageWidth={1788}
        imageHeight={659}
        imageName="main-board"
        onReplaceImage={vi.fn()}
      />,
    )

    const image = screen.getByRole('img', { name: /main-board/i })

    expect(image).toHaveAttribute('width', '1788')
    expect(image).toHaveAttribute('height', '659')
  })
})