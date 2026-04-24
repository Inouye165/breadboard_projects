import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'

import { PartEditor } from './PartEditor'

function mockCanvasBounds(container: HTMLElement) {
  const content = container.querySelector('[data-testid="part-canvas-content"]') as HTMLDivElement | null

  if (!content) {
    throw new Error('Part canvas content wrapper not found.')
  }

  vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    top: 0,
    right: 100,
    bottom: 100,
    left: 0,
    toJSON: () => ({}),
  })
}

describe('PartEditor', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

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

    expect(image.getAttribute('width')).toBe('1788')
    expect(image.getAttribute('height')).toBe('659')
  })

  it('shows calibration controls for the generated breadboard template', () => {
    const { container } = render(
      <PartEditor
        imageSrc="/board.png"
        imageWidth={1200}
        imageHeight={420}
        imageName="main-board"
        onReplaceImage={vi.fn()}
      />,
    )

    const view = within(container)

    expect(view.getAllByRole('button', { name: /save aligned definition/i }).length).toBeGreaterThan(0)
    expect(view.getAllByText(/top power rails/i).length).toBeGreaterThan(0)
    expect(view.getByRole('button', { name: /upper terminal strip top left anchor/i })).toBeTruthy()
  })

  it('uses the current anchor state during continuous anchor drags', () => {
    const { container } = render(
      <PartEditor
        imageSrc="/board.png"
        imageWidth={1200}
        imageHeight={420}
        imageName="main-board"
        onReplaceImage={vi.fn()}
      />,
    )
    const view = within(container)
    mockCanvasBounds(container)

    fireEvent.change(view.getByRole('combobox', { name: /^region$/i }), {
      target: { value: 'upper-terminal-strip' },
    })

    const beforeAnchor = container.querySelector(
      'g[data-region-id="upper-terminal-strip"] circle.part-canvas__anchor',
    )

    expect(Number(beforeAnchor?.getAttribute('cx'))).toBeCloseTo(88.8)

    fireEvent.pointerDown(view.getByRole('button', { name: /upper terminal strip top left anchor/i }), {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 30, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 30, clientY: 10, pointerId: 1 })

    const afterAnchor = container.querySelector(
      'g[data-region-id="upper-terminal-strip"] circle.part-canvas__anchor',
    )

    expect(Number(afterAnchor?.getAttribute('cx'))).toBeCloseTo(328.8)
  })
})