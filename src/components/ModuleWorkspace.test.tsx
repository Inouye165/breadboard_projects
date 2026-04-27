import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'

import { ModuleWorkspace } from './ModuleWorkspace'
import {
  createEmptyLibraryPart,
  type LibraryPartDefinition,
} from '../lib/partLibraryModel'

function buildCalibratedPart(): LibraryPartDefinition {
  const base = createEmptyLibraryPart({ name: 'BME280' })
  return {
    ...base,
    id: 'library-part-test',
    category: 'sensor',
    dimensions: { widthMm: 11, heightMm: 16 },
    imageViews: [
      {
        id: 'image-view-top',
        label: 'Top',
        side: 'top',
        imageName: 'top.png',
        imagePath: '/top.png',
        imageWidth: 800,
        imageHeight: 600,
        calibration: {
          corners: {
            topLeft: { x: 100, y: 50 },
            topRight: { x: 700, y: 50 },
            bottomRight: { x: 700, y: 550 },
            bottomLeft: { x: 100, y: 550 },
          },
          widthMm: 11,
          heightMm: 16,
        },
      },
    ],
    logicalPins: [{ id: 'logical-pin-vcc', name: 'VCC' }],
  }
}

function stubStageRect(rect: Partial<DOMRect>) {
  const fullRect = {
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect
  Element.prototype.getBoundingClientRect = vi.fn(() => fullRect)
}

describe('ModuleWorkspace', () => {
  it('records the four corners when the user calibrates a fresh image', () => {
    const onChange = vi.fn()
    const base = createEmptyLibraryPart({ name: 'New module' })
    const part: LibraryPartDefinition = {
      ...base,
      dimensions: { widthMm: 11, heightMm: 16 },
      imageViews: [
        {
          id: 'image-view-top',
          label: 'Top',
          side: 'top',
          imageName: 'top.png',
          imagePath: '/top.png',
          imageWidth: 800,
          imageHeight: 600,
        },
      ],
    }

    stubStageRect({ width: 800, height: 600 })

    render(
      <ModuleWorkspace
        part={part}
        status=""
        onChange={onChange}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    const stage = screen.getByLabelText(/module image stage/i)

    fireEvent.click(stage, { clientX: 100, clientY: 50 })
    const firstCall = onChange.mock.calls[0][0] as LibraryPartDefinition
    expect(firstCall.imageViews[0].calibration?.corners.topLeft).toEqual({ x: 100, y: 50 })
  })

  it('places a physical point at the expected mm position when the user clicks the calibrated image', () => {
    const onChange = vi.fn()
    const part = buildCalibratedPart()

    stubStageRect({ width: 800, height: 600 })

    render(
      <ModuleWorkspace
        part={part}
        status=""
        onChange={onChange}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /place points/i }))

    const stage = screen.getByLabelText(/module image stage/i)
    // Pixel (400, 300) is the calibrated rectangle's centre -> (5.5mm, 8mm).
    fireEvent.click(stage, { clientX: 400, clientY: 300 })

    const lastCall = onChange.mock.calls.at(-1)?.[0] as LibraryPartDefinition
    expect(lastCall.physicalPoints).toHaveLength(1)
    expect(lastCall.physicalPoints[0].xMm).toBeCloseTo(5.5, 5)
    expect(lastCall.physicalPoints[0].yMm).toBeCloseTo(8, 5)
    expect(lastCall.physicalPoints[0].viewId).toBe('image-view-top')
    expect(lastCall.physicalPoints[0].kind).toBe('header-pin')
  })

  it('generates an evenly spaced pin row at 2.54mm pitch', () => {
    const onChange = vi.fn()
    const part = buildCalibratedPart()

    stubStageRect({ width: 800, height: 600 })

    render(
      <ModuleWorkspace
        part={part}
        status=""
        onChange={onChange}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /pin row helper/i }))

    const stage = screen.getByLabelText(/module image stage/i)

    // First anchor at (xMm = 0, yMm = 0) -> pixel (100, 50).
    fireEvent.click(stage, { clientX: 100, clientY: 50 })
    // Last anchor 7 * 2.54 = 17.78 mm right? Stage is 11 mm wide, so use a 4-pin
    // row from (1.27, 1.27) mm to (1.27 + 3*2.54, 1.27) mm = (8.89, 1.27) mm.
    // Forward-map those mm to pixels using the same affine mapping as the stage:
    // x_px = 100 + (xMm/11) * 600, y_px = 50 + (yMm/16) * 500.
    const startPx = { clientX: 100 + (1.27 / 11) * 600, clientY: 50 + (1.27 / 16) * 500 }
    const endPx = { clientX: 100 + (8.89 / 11) * 600, clientY: 50 + (1.27 / 16) * 500 }
    onChange.mockClear()
    fireEvent.click(stage, startPx)
    fireEvent.click(stage, endPx)

    fireEvent.change(screen.getByLabelText(/pin count/i), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /generate row/i }))

    const lastCall = onChange.mock.calls.at(-1)?.[0] as LibraryPartDefinition
    expect(lastCall.physicalPoints).toHaveLength(4)
    const xs = lastCall.physicalPoints.map((p) => p.xMm)
    expect(xs[0]).toBeCloseTo(1.27, 4)
    expect(xs[1] - xs[0]).toBeCloseTo(2.54, 4)
    expect(xs[2] - xs[1]).toBeCloseTo(2.54, 4)
    expect(xs[3] - xs[2]).toBeCloseTo(2.54, 4)
    lastCall.physicalPoints.forEach((p) => expect(p.yMm).toBeCloseTo(1.27, 4))
  })

  it('saves and goes back via the toolbar buttons', () => {
    const onSave = vi.fn()
    const onBack = vi.fn()

    render(
      <ModuleWorkspace
        part={buildCalibratedPart()}
        status="Ready"
        onChange={vi.fn()}
        onSave={onSave}
        onBack={onBack}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /save module/i }))
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows the module workspace eyebrow and category options', () => {
    render(
      <ModuleWorkspace
        part={buildCalibratedPart()}
        status="Ready"
        onChange={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    expect(screen.getByText(/modules\s*&\s*sensors/i)).toBeTruthy()
    const select = screen.getByLabelText(/category/i) as HTMLSelectElement
    const options = within(select).getAllByRole('option').map((opt) => opt.textContent)
    expect(options).toEqual(expect.arrayContaining(['sensor', 'module', 'breakout-board', 'microcontroller']))
  })
})
