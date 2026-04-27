import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { PinPointEditor } from './PinPointEditor'
import type { BreadboardDefinition } from '../lib/breadboardDefinitionModel'

function createDefinition(overrides: Partial<BreadboardDefinition> = {}): BreadboardDefinition {
  return {
    id: 'def-1',
    name: 'Board',
    imageName: 'board.png',
    imagePath: '/board.png',
    imageWidth: 1000,
    imageHeight: 500,
    points: [],
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    ...overrides,
  }
}

function stubSvgRect(rect: Partial<DOMRect>) {
  const fullRect = { left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}), ...rect } as DOMRect
  Element.prototype.getBoundingClientRect = vi.fn(() => fullRect)
}

describe('PinPointEditor', () => {
  it('adds a pin where the user clicks the canvas', () => {
    const onChange = vi.fn()
    const definition = createDefinition()

    stubSvgRect({ width: 1000, height: 500 })

    render(
      <PinPointEditor
        definition={definition}
        imagePath="/board.png"
        imageWidth={1000}
        imageHeight={500}
        status="Add pins"
        onBack={vi.fn()}
        onChange={onChange}
        onSaveAndFinish={vi.fn()}
      />,
    )

    const canvas = screen.getByLabelText(/breadboard pin hole canvas/i)

    fireEvent.pointerDown(canvas, { button: 0, clientX: 250, clientY: 100 })

    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls[0][0] as BreadboardDefinition
    expect(next.points).toHaveLength(1)
    expect(next.points[0].x).toBeCloseTo(250)
    expect(next.points[0].y).toBeCloseTo(100)
    expect(next.points[0].kind).toBe('breadboard-hole')
    expect(next.points[0].label).toBe('1')
  })

  it('shows pin count and renders existing pins', () => {
    const definition = createDefinition({
      points: [
        { id: 'p1', label: '1', x: 100, y: 100, kind: 'breadboard-hole' },
        { id: 'p2', label: '2', x: 200, y: 200, kind: 'breadboard-hole' },
      ],
    })

    render(
      <PinPointEditor
        definition={definition}
        imagePath="/board.png"
        imageWidth={1000}
        imageHeight={500}
        status="Editing"
        onBack={vi.fn()}
        onChange={vi.fn()}
        onSaveAndFinish={vi.fn()}
      />,
    )

    expect(
      screen.getByText((_, element) => element?.textContent === '2 pin holes placed'),
    ).toBeTruthy()
    expect(screen.getByLabelText(/^pin hole 1$/i)).toBeTruthy()
    expect(screen.getByLabelText(/^pin hole 2$/i)).toBeTruthy()
  })

  it('removes a pin after a second click on it', () => {
    const onChange = vi.fn()
    const definition = createDefinition({
      points: [{ id: 'p1', label: '1', x: 100, y: 100, kind: 'breadboard-hole' }],
    })

    render(
      <PinPointEditor
        definition={definition}
        imagePath="/board.png"
        imageWidth={1000}
        imageHeight={500}
        status="Editing"
        onBack={vi.fn()}
        onChange={onChange}
        onSaveAndFinish={vi.fn()}
      />,
    )

    const pin = screen.getByLabelText(/^pin hole 1/i)

    fireEvent.pointerDown(pin)
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.pointerDown(pin)
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls[0][0] as BreadboardDefinition
    expect(next.points).toHaveLength(0)
  })

  it('clears all pins when the Clear all button is clicked', () => {
    const onChange = vi.fn()
    const definition = createDefinition({
      points: [
        { id: 'p1', label: '1', x: 100, y: 100, kind: 'breadboard-hole' },
        { id: 'p2', label: '2', x: 200, y: 200, kind: 'breadboard-hole' },
      ],
    })

    render(
      <PinPointEditor
        definition={definition}
        imagePath="/board.png"
        imageWidth={1000}
        imageHeight={500}
        status="Editing"
        onBack={vi.fn()}
        onChange={onChange}
        onSaveAndFinish={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))

    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls[0][0] as BreadboardDefinition
    expect(next.points).toHaveLength(0)
  })

  it('updates the breadboard name', () => {
    const onChange = vi.fn()
    const definition = createDefinition({ name: 'Original' })

    render(
      <PinPointEditor
        definition={definition}
        imagePath="/board.png"
        imageWidth={1000}
        imageHeight={500}
        status="Editing"
        onBack={vi.fn()}
        onChange={onChange}
        onSaveAndFinish={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/breadboard name/i), { target: { value: 'Renamed' } })

    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls[0][0] as BreadboardDefinition
    expect(next.name).toBe('Renamed')
  })
})
