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

  describe('grid fill', () => {
    function renderEditor(overrides: Partial<BreadboardDefinition> = {}) {
      const onChange = vi.fn()
      const definition = createDefinition(overrides)
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
      return { onChange, canvas: screen.getByLabelText(/breadboard pin hole canvas/i) }
    }

    it('places a 5x63 grid linked by columns and tags points with regionId/columnId', () => {
      const { onChange, canvas } = renderEditor()

      fireEvent.click(screen.getByRole('button', { name: /grid fill/i }))
      // Click two opposite corners.
      fireEvent.pointerDown(canvas, { button: 0, clientX: 0, clientY: 0 })
      fireEvent.pointerDown(canvas, { button: 0, clientX: 620, clientY: 40 })
      // Defaults are 5 rows x 63 cols, link rows off, link cols on.
      fireEvent.click(screen.getByRole('button', { name: /^apply grid$/i }))

      expect(onChange).toHaveBeenCalled()
      const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as BreadboardDefinition
      expect(next.points).toHaveLength(5 * 63)

      const region = next.regions?.[0]
      expect(region).toBeDefined()
      expect(region!.columns).toHaveLength(63)
      expect(region!.rows).toHaveLength(0)
      expect(region!.kind).toBe('terminal-strip')

      const colId = region!.columns[0].id
      const firstColumnPoints = next.points.filter((p) => p.columnId === colId)
      expect(firstColumnPoints).toHaveLength(5)
      for (const p of firstColumnPoints) {
        expect(p.regionId).toBe(region!.id)
        expect(p.snapSource).toBe('grid-fill')
      }
    })

    it('replaces existing points within half the derived pitch', () => {
      const { onChange, canvas } = renderEditor({
        points: [{ id: 'old', label: '1', x: 1, y: 1, kind: 'breadboard-hole' }],
      })

      fireEvent.click(screen.getByRole('button', { name: /grid fill/i }))
      fireEvent.pointerDown(canvas, { button: 0, clientX: 0, clientY: 0 })
      fireEvent.pointerDown(canvas, { button: 0, clientX: 620, clientY: 40 })
      fireEvent.click(screen.getByRole('button', { name: /^apply grid$/i }))

      const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as BreadboardDefinition
      expect(next.points.find((p) => p.id === 'old')).toBeUndefined()
    })

    it('skips region creation when neither link checkbox is set', () => {
      const { onChange, canvas } = renderEditor()

      fireEvent.click(screen.getByRole('button', { name: /grid fill/i }))
      fireEvent.pointerDown(canvas, { button: 0, clientX: 0, clientY: 0 })
      fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 })
      // Set rows=2, cols=2, uncheck the default Link columns.
      fireEvent.change(screen.getByLabelText(/^rows$/i), { target: { value: '2' } })
      fireEvent.change(screen.getByLabelText(/^columns$/i), { target: { value: '2' } })
      fireEvent.click(screen.getByLabelText(/link columns/i))
      fireEvent.click(screen.getByRole('button', { name: /^apply grid$/i }))

      const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as BreadboardDefinition
      expect(next.points).toHaveLength(4)
      expect(next.regions ?? []).toEqual([])
      for (const p of next.points) {
        expect(p.regionId).toBeUndefined()
        expect(p.rowId).toBeUndefined()
        expect(p.columnId).toBeUndefined()
      }
    })
  })
})
