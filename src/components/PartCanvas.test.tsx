import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
    },
    {
      id: 'P2',
      label: 'P2',
      x: 0.75,
      y: 0.65,
      kind: 'pin',
    },
  ],
  metadata: {
    kind: 'custom',
    regions: [],
  },
}

describe('PartCanvas', () => {
  it('renders connection points for a part definition overlay', () => {
    render(<PartCanvas definition={testDefinition} showPoints showLabels />)

    expect(screen.getByLabelText(/test part connection points overlay/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connection point p1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connection point p2/i })).toBeInTheDocument()
    expect(screen.getByText('P1')).toBeInTheDocument()
  })

  it('reports point drags through normalized deltas', () => {
    const onPointPointerDown = vi.fn()
    const onPointDrag = vi.fn()

    const { container } = render(
      <PartCanvas
        definition={testDefinition}
        showPoints
        onPointPointerDown={onPointPointerDown}
        onPointDrag={onPointDrag}
      />,
    )
    const view = within(container)

    const point = view.getByRole('button', { name: /connection point p1/i })

    fireEvent.pointerDown(point, { clientX: 20, clientY: 30, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 26, clientY: 34, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 26, clientY: 34, pointerId: 1 })

    expect(onPointPointerDown).toHaveBeenCalledWith('P1')
    expect(onPointDrag).toHaveBeenCalled()
  })

  it('renders region anchors when region metadata is present', () => {
    render(
      <PartCanvas
        definition={{
          ...testDefinition,
          metadata: {
            kind: 'breadboard',
            regions: [
              {
                id: 'region-1',
                name: 'Region 1',
                kind: 'custom-grid',
                pointIds: ['P1', 'P2'],
                rows: [{ id: 'row-1', label: 'Row 1', pointIds: ['P1'] }],
                columns: [{ id: 'col-1', label: 'Column 1', pointIds: ['P1', 'P2'] }],
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
            ],
          },
        }}
        selectedRegionId="region-1"
      />,
    )

    expect(screen.getByRole('button', { name: /region 1 top left anchor/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /region 1 region/i })).toBeInTheDocument()
  })
})
