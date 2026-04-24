import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'

import { PartCanvas } from './PartCanvas'
import type { PartDefinition } from '../lib/parts'

const testDefinition: PartDefinition = {
  id: 'test-part',
  name: 'Test Part',
  imageSrc: '/test-part.png',
  imageWidth: 400,
  imageHeight: 200,
  points: [
    {
      id: 'P1',
      label: 'P1',
      x: 0.2,
      y: 0.3,
      kind: 'pin',
      regionId: 'region-1',
      rowId: 'row-1',
      columnId: 'col-1',
    },
    {
      id: 'P2',
      label: 'P2',
      x: 0.75,
      y: 0.65,
      kind: 'pin',
      regionId: 'region-1',
      rowId: 'row-2',
      columnId: 'col-2',
    },
    {
      id: 'P3',
      label: 'P3',
      x: 0.4,
      y: 0.55,
      kind: 'pin',
      regionId: 'region-2',
      rowId: 'row-3',
      columnId: 'col-3',
    },
  ],
  metadata: {
    kind: 'breadboard',
    regions: [
      {
        id: 'region-1',
        name: 'Region 1',
        kind: 'custom-grid',
        pointIds: ['P1', 'P2'],
        rows: [
          { id: 'row-1', label: 'Row 1', pointIds: ['P1'] },
          { id: 'row-2', label: 'Row 2', pointIds: ['P2'] },
        ],
        columns: [
          { id: 'col-1', label: 'Column 1', pointIds: ['P1'] },
          { id: 'col-2', label: 'Column 2', pointIds: ['P2'] },
        ],
        anchors: [
          { key: 'topLeft', label: 'Top left', x: 0.1, y: 0.1 },
          { key: 'topRight', label: 'Top right', x: 0.9, y: 0.1 },
          { key: 'bottomLeft', label: 'Bottom left', x: 0.1, y: 0.9 },
          { key: 'bottomRight', label: 'Bottom right', x: 0.9, y: 0.9 },
        ],
        defaultAnchors: [
          { key: 'topLeft', label: 'Top left', x: 0.1, y: 0.1 },
          { key: 'topRight', label: 'Top right', x: 0.9, y: 0.1 },
          { key: 'bottomLeft', label: 'Bottom left', x: 0.1, y: 0.9 },
          { key: 'bottomRight', label: 'Bottom right', x: 0.9, y: 0.9 },
        ],
      },
      {
        id: 'region-2',
        name: 'Region 2',
        kind: 'custom-grid',
        pointIds: ['P3'],
        rows: [{ id: 'row-3', label: 'Row 3', pointIds: ['P3'] }],
        columns: [{ id: 'col-3', label: 'Column 3', pointIds: ['P3'] }],
        anchors: [
          { key: 'topLeft', label: 'Top left', x: 0.3, y: 0.3 },
          { key: 'topRight', label: 'Top right', x: 0.6, y: 0.3 },
          { key: 'bottomLeft', label: 'Bottom left', x: 0.3, y: 0.7 },
          { key: 'bottomRight', label: 'Bottom right', x: 0.6, y: 0.7 },
        ],
        defaultAnchors: [
          { key: 'topLeft', label: 'Top left', x: 0.3, y: 0.3 },
          { key: 'topRight', label: 'Top right', x: 0.6, y: 0.3 },
          { key: 'bottomLeft', label: 'Bottom left', x: 0.3, y: 0.7 },
          { key: 'bottomRight', label: 'Bottom right', x: 0.6, y: 0.7 },
        ],
      },
    ],
  },
}

function mockCanvasBounds(container: HTMLElement) {
  const content = container.querySelector('[data-testid="part-canvas-content"]') as HTMLDivElement | null

  if (!content) {
    throw new Error('Part canvas content wrapper not found.')
  }

  vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    top: 0,
    right: 100,
    bottom: 50,
    left: 0,
    toJSON: () => ({}),
  })
}

describe('PartCanvas', () => {
  it('renders connection points for a part definition overlay', () => {
    render(<PartCanvas definition={testDefinition} showPoints showLabels />)

    expect(screen.getByLabelText(/test part connection points overlay/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /connection point p1/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /connection point p2/i })).toBeTruthy()
    expect(screen.getByText('P1')).toBeTruthy()
  })

  it('reports point drags through normalized deltas', () => {
    const onPointPointerDown = vi.fn()
    const onPointDrag = vi.fn()

    const { container } = render(
      <PartCanvas
        definition={testDefinition}
        showPoints
        interactionMode="point"
        onPointPointerDown={onPointPointerDown}
        onPointDrag={onPointDrag}
      />,
    )
    const view = within(container)
    mockCanvasBounds(container)

    const point = view.getByRole('button', { name: /connection point p1/i })

    fireEvent.pointerDown(point, { clientX: 20, clientY: 30, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 26, clientY: 34, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 26, clientY: 34, pointerId: 1 })

    expect(onPointPointerDown).toHaveBeenCalledWith('P1')
    expect(onPointDrag).toHaveBeenCalled()
  })

  it('renders region anchors when region metadata is present', () => {
    render(<PartCanvas definition={testDefinition} selectedRegionId="region-1" />)

    expect(screen.getByRole('button', { name: /region 1 top left anchor/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /region 1 region/i })).toBeTruthy()
  })

  it('orders region polygon corners as top-left, top-right, bottom-right, bottom-left', () => {
    const { container } = render(<PartCanvas definition={testDefinition} selectedRegionId="region-1" />)
    const polygon = container.querySelector('polygon.part-canvas__region')

    expect(polygon?.getAttribute('points')).toBe('40,20 360,20 360,180 40,180')
  })

  it('keeps debug point styling separate from highlighted and selected points', () => {
    const { container } = render(
      <PartCanvas
        definition={testDefinition}
        showPoints
        highlightedPointIds={['P2']}
        selectedPointId="P3"
      />,
    )

    const debugPoint = container.querySelector('g[data-point-id="P1"] circle.part-canvas__point')
    const highlightedPoint = container.querySelector('g[data-point-id="P2"] circle.part-canvas__point')
    const selectedPoint = container.querySelector('g[data-point-id="P3"] circle.part-canvas__point')

    expect(debugPoint?.getAttribute('class')).toContain('part-canvas__point--debug')
    expect(debugPoint?.getAttribute('class')).not.toContain('part-canvas__point--selected')
    expect(highlightedPoint?.getAttribute('class')).toContain('part-canvas__point--highlighted')
    expect(highlightedPoint?.getAttribute('class')).not.toContain('part-canvas__point--selected')
    expect(selectedPoint?.getAttribute('class')).toContain('part-canvas__point--selected')
  })

  it('routes point drags to the selected region in region mode', () => {
    const onPointPointerDown = vi.fn()
    const onPointDrag = vi.fn()
    const onRegionDrag = vi.fn()
    const { container } = render(
      <PartCanvas
        definition={testDefinition}
        interactionMode="region"
        onPointPointerDown={onPointPointerDown}
        onPointDrag={onPointDrag}
        onRegionDrag={onRegionDrag}
      />,
    )
    const view = within(container)
    mockCanvasBounds(container)

    fireEvent.pointerDown(view.getByRole('button', { name: /connection point p1/i }), {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 15, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 15, pointerId: 1 })

    expect(onPointPointerDown).toHaveBeenCalledWith('P1')
    expect(onRegionDrag).toHaveBeenCalledTimes(1)
    expect(onRegionDrag.mock.calls[0][0]).toBe('region-1')
    expect(onRegionDrag.mock.calls[0][1].x).toBeCloseTo(0.1)
    expect(onRegionDrag.mock.calls[0][1].y).toBeCloseTo(0.1)
    expect(onPointDrag).not.toHaveBeenCalled()
  })

  it('routes whole-board drags through the board callback', () => {
    const onBoardDrag = vi.fn()
    const onRegionDrag = vi.fn()
    const { container } = render(
      <PartCanvas
        definition={testDefinition}
        moveAllRegions
        onBoardDrag={onBoardDrag}
        onRegionDrag={onRegionDrag}
      />,
    )
    const view = within(container)
    mockCanvasBounds(container)

    fireEvent.pointerDown(view.getByRole('button', { name: /region 1 region/i }), {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    })
    fireEvent.pointerMove(window, { clientX: 15, clientY: 20, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 15, clientY: 20, pointerId: 1 })

    expect(onBoardDrag).toHaveBeenCalledTimes(1)
    expect(onBoardDrag.mock.calls[0][0].x).toBeCloseTo(0.05)
    expect(onBoardDrag.mock.calls[0][0].y).toBeCloseTo(0.2)
    expect(onRegionDrag).not.toHaveBeenCalled()
  })

  it('keeps point drags scoped to a single point in point mode', () => {
    const onPointDrag = vi.fn()
    const onRegionDrag = vi.fn()
    const { container } = render(
      <PartCanvas
        definition={testDefinition}
        interactionMode="point"
        onPointDrag={onPointDrag}
        onRegionDrag={onRegionDrag}
      />,
    )
    const view = within(container)
    mockCanvasBounds(container)

    fireEvent.pointerDown(view.getByRole('button', { name: /connection point p1/i }), {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    })
    fireEvent.pointerMove(window, { clientX: 18, clientY: 12, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 18, clientY: 12, pointerId: 1 })

    expect(onPointDrag).toHaveBeenCalledTimes(1)
    expect(onPointDrag.mock.calls[0][0]).toBe('P1')
    expect(onPointDrag.mock.calls[0][1].x).toBeCloseTo(0.08)
    expect(onPointDrag.mock.calls[0][1].y).toBeCloseTo(0.04)
    expect(onRegionDrag).not.toHaveBeenCalled()
  })
})
