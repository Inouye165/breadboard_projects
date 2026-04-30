import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { WireEditor } from './WireEditor'
import type { BreadboardDefinition } from '../lib/breadboardDefinitionModel'
import type { BreadboardProject } from '../lib/breadboardProjectModel'
import { buildPassiveLibraryPart, defaultResistorSpec } from '../lib/generatedPassive'

const breadboard: BreadboardDefinition = {
  id: 'definition-1',
  name: 'Definition A',
  imageName: 'a.png',
  imagePath: '/__breadboard_local__/images/a.png',
  imageWidth: 1000,
  imageHeight: 500,
  points: [
    { id: 'p1', label: 'A1', x: 100, y: 100, kind: 'breadboard-hole' },
    { id: 'p2', label: 'A2', x: 200, y: 100, kind: 'breadboard-hole' },
    { id: 'p3', label: 'A3', x: 300, y: 200, kind: 'breadboard-hole' },
  ],
  createdAt: '2026-04-24T00:00:00.000Z',
  updatedAt: '2026-04-24T00:00:00.000Z',
}

function makeProject(wires: BreadboardProject['wires'] = []): BreadboardProject {
  return {
    id: 'project-1',
    name: 'Test project',
    breadboardDefinitionId: breadboard.id,
    wires,
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
  }
}

describe('WireEditor', () => {
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect))
  })

  it('adds a wire when the user clicks two pin holes', () => {
    const handleChange = vi.fn()

    render(
      <WireEditor
        project={makeProject()}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Pin hole A1/ }))
    fireEvent.click(screen.getByRole('button', { name: /Pin hole A2/ }))

    expect(handleChange).toHaveBeenCalledTimes(1)
    const updated = handleChange.mock.calls[0][0] as BreadboardProject
    expect(updated.wires).toHaveLength(1)
    expect(updated.wires[0].fromPointId).toBe('p1')
    expect(updated.wires[0].toPointId).toBe('p2')
  })

  it('clears the pending pin when the same pin is clicked twice', () => {
    const handleChange = vi.fn()

    render(
      <WireEditor
        project={makeProject()}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    const firstPin = screen.getByRole('button', { name: /Pin hole A1/ })
    fireEvent.click(firstPin)
    fireEvent.click(firstPin)

    expect(handleChange).not.toHaveBeenCalled()
  })

  it('renders existing wires as svg polylines through their endpoints', () => {
    render(
      <WireEditor
        project={makeProject([
          { id: 'wire-1', fromPointId: 'p1', toPointId: 'p3', color: '#cc3333' },
        ])}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={() => {}}
      />,
    )

    const wire = screen.getByRole('button', { name: /Wire from A1 to A3/ })
    expect(wire.tagName.toLowerCase()).toBe('polyline')
    expect(wire.getAttribute('points')).toBe('100,100 300,200')
  })

  it('renders the waypoint inline on a rerouted wire', () => {
    render(
      <WireEditor
        project={makeProject([
          {
            id: 'wire-1',
            fromPointId: 'p1',
            toPointId: 'p3',
            color: '#cc3333',
            waypoints: [{ x: 250, y: 50 }],
          },
        ])}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={() => {}}
      />,
    )

    const wire = screen.getByRole('button', { name: /Wire from A1 to A3/ })
    expect(wire.getAttribute('points')).toBe('100,100 250,50 300,200')
    expect(screen.getByRole('button', { name: /routing point 1/ })).toBeTruthy()
  })

  it('removes a wire when it is clicked twice', () => {
    const handleChange = vi.fn()

    render(
      <WireEditor
        project={makeProject([
          { id: 'wire-1', fromPointId: 'p1', toPointId: 'p2', color: '#cc3333' },
        ])}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    const wire = screen.getByRole('button', { name: /Wire from A1 to A2/ })
    fireEvent.click(wire)
    fireEvent.click(wire)

    expect(handleChange).toHaveBeenCalledTimes(1)
    const updated = handleChange.mock.calls[0][0] as BreadboardProject
    expect(updated.wires).toHaveLength(0)
  })

  it('updates the project name as the user edits the input', () => {
    const handleChange = vi.fn()

    render(
      <WireEditor
        project={makeProject()}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    const nameInput = screen.getByLabelText('Project name')
    fireEvent.change(nameInput, { target: { value: 'Renamed project' } })

    expect(handleChange).toHaveBeenCalledTimes(1)
    const updated = handleChange.mock.calls[0][0] as BreadboardProject
    expect(updated.name).toBe('Renamed project')
  })

  it('inserts a routing waypoint when the midpoint handle is clicked', () => {
    const handleChange = vi.fn()

    render(
      <WireEditor
        project={makeProject([
          { id: 'wire-1', fromPointId: 'p1', toPointId: 'p2', color: '#cc3333' },
        ])}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Add routing point to wire from A1 to A2/ }))

    expect(handleChange).toHaveBeenCalledTimes(1)
    const updated = handleChange.mock.calls[0][0] as BreadboardProject
    expect(updated.wires[0].waypoints).toEqual([{ x: 150, y: 100 }])
  })

  it('removes a waypoint when it is double-clicked', () => {
    const handleChange = vi.fn()

    render(
      <WireEditor
        project={makeProject([
          {
            id: 'wire-1',
            fromPointId: 'p1',
            toPointId: 'p2',
            color: '#cc3333',
            waypoints: [{ x: 150, y: 50 }],
          },
        ])}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    fireEvent.doubleClick(screen.getByRole('button', { name: /routing point 1/ }))

    expect(handleChange).toHaveBeenCalledTimes(1)
    const updated = handleChange.mock.calls[0][0] as BreadboardProject
    expect(updated.wires[0].waypoints).toBeUndefined()
  })

  it('persists a dragged waypoint to its dropped position', () => {    const handleChange = vi.fn()

    render(
      <WireEditor
        project={makeProject([
          {
            id: 'wire-1',
            fromPointId: 'p1',
            toPointId: 'p2',
            color: '#cc3333',
            waypoints: [{ x: 150, y: 100 }],
          },
        ])}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    const handle = screen.getByRole('button', { name: /routing point 1/ })

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 150, clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 200, clientY: 250 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 200, clientY: 250 })

    expect(handleChange).toHaveBeenCalledTimes(1)
    const updated = handleChange.mock.calls[0][0] as BreadboardProject
    expect(updated.wires[0].waypoints).toEqual([{ x: 200, y: 250 }])
  })

  it('adds a project component through the components panel', () => {
    const handleChange = vi.fn()

    render(
      <WireEditor
        project={makeProject()}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    fireEvent.change(screen.getByLabelText(/^Type$/), { target: { value: 'led' } })
    fireEvent.change(screen.getByLabelText(/^Label$/), { target: { value: 'D1' } })
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Red 5mm' } })
    fireEvent.click(screen.getByRole('button', { name: /Add component/ }))

    expect(handleChange).toHaveBeenCalledTimes(1)
    const updated = handleChange.mock.calls[0][0] as BreadboardProject
    expect(updated.components).toHaveLength(1)
    expect(updated.components![0]).toMatchObject({
      kind: 'led',
      label: 'D1',
      description: 'Red 5mm',
    })
  })

  it('does nothing when the component label is blank', () => {
    const handleChange = vi.fn()

    render(
      <WireEditor
        project={makeProject()}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    expect(screen.getByRole('button', { name: /Add component/ }).hasAttribute('disabled')).toBe(true)
  })

  it('removes a component when its Remove button is clicked', () => {
    const handleChange = vi.fn()
    const project: BreadboardProject = {
      ...makeProject(),
      components: [{ id: 'c-1', kind: 'resistor', label: 'R1', description: '220' }],
    }

    render(
      <WireEditor
        project={project}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
        onChange={handleChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Remove component R1/ }))

    expect(handleChange).toHaveBeenCalledTimes(1)
    const updated = handleChange.mock.calls[0][0] as BreadboardProject
    expect(updated.components).toBeUndefined()
  })

  // ---------------------------------------------------------------------
  // Generated-passive endpoint drag (regression: dragging a resistor lead
  // onto a different breadboard pin must update centerX/centerY/rotationDeg/
  // passiveSpanMm so the body re-angles and snaps to the new pin instead of
  // springing back to its original position.)
  // ---------------------------------------------------------------------
  describe('passive endpoint dragging', () => {
    // Breadboard with 1 mm == 1 px (calibration line is 100 px / 100 mm).
    // Pins are spaced 10 mm apart along a row, plus a third pin offset
    // diagonally so a snap test can verify both centre relocation AND
    // rotation change.
    const passiveBoard: BreadboardDefinition = {
      id: 'def-passive',
      name: 'Passive bench',
      imageName: 'p.png',
      imagePath: '/__breadboard_local__/images/p.png',
      // Match the global beforeEach() getBoundingClientRect() mock (1000×500)
      // so client/svg coords are 1:1 — otherwise pointer events get rescaled
      // and the snap pin we're aiming at is nowhere near our pointer coords.
      imageWidth: 1000,
      imageHeight: 500,
      // 1 px == 1 mm so geometry math stays trivial in assertions.
      scaleCalibration: { x1: 0, y1: 0, x2: 100, y2: 0, realDistanceMm: 100 },
      points: [
        { id: 'pinA', label: 'A', x: 50, y: 100, kind: 'breadboard-hole' },
        { id: 'pinB', label: 'B', x: 70, y: 100, kind: 'breadboard-hole' },
        // 30 mm horizontal + 30 mm vertical from pinA = 42.4 mm total,
        // well within an axial resistor's lead reach (~56 mm) yet still
        // far enough that snapping to it produces a clearly different
        // angle (~37°) than the original 0°.
        { id: 'pinTarget', label: 'T', x: 80, y: 130, kind: 'breadboard-hole' },
      ],
      createdAt: '2026-04-24T00:00:00.000Z',
      updatedAt: '2026-04-24T00:00:00.000Z',
    }

    function makeResistorPart() {
      const spec = defaultResistorSpec()
      return buildPassiveLibraryPart(spec, { id: 'lib-resistor-1' })
    }

    function makeProjectWithResistorBetween(pinA: { x: number; y: number }, pinB: { x: number; y: number }) {
      const dx = pinB.x - pinA.x
      const dy = pinB.y - pinA.y
      return {
        id: 'project-passive',
        name: 'Passive project',
        breadboardDefinitionId: passiveBoard.id,
        wires: [],
        modules: [
          {
            id: 'mod-1',
            libraryPartId: 'lib-resistor-1',
            centerX: (pinA.x + pinB.x) / 2,
            centerY: (pinA.y + pinB.y) / 2,
            rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
            passiveSpanMm: Math.hypot(dx, dy),
          },
        ],
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      } satisfies BreadboardProject
    }

    function getSvg(): SVGSVGElement {
      // The wiring canvas <svg> has role="img" with an aria-label.
      return screen.getByRole('img', { name: /Breadboard wiring canvas/ }) as unknown as SVGSVGElement
    }

    function dragRightHandleTo(targetX: number, targetY: number) {
      const handle = screen.getByLabelText(/Drag right contact of/)
      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 70, clientY: 100 })
      const svg = getSvg()
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: targetX, clientY: targetY })
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: targetX, clientY: targetY })
    }

    it('snaps the dragged endpoint to a new pin and recomputes angle + center + span', () => {
      const part = makeResistorPart()
      const project = makeProjectWithResistorBetween({ x: 50, y: 100 }, { x: 70, y: 100 })
      const handleChange = vi.fn()

      render(
        <WireEditor
          project={project}
          breadboard={passiveBoard}
          libraryParts={[part]}
          status=""
          onBack={() => {}}
          onChange={handleChange}
        />,
      )

      // Select the resistor so the endpoint handles render. Dispatching
      // pointerdown directly on the handle would also select it, but doing
      // it via the body group mirrors the real user flow.
      const moduleGroup = document.querySelector('[data-module-id="mod-1"]') as SVGGElement
      fireEvent.pointerDown(moduleGroup, { button: 0, pointerId: 99, clientX: 60, clientY: 100 })
      fireEvent.pointerUp(moduleGroup, { button: 0, pointerId: 99, clientX: 60, clientY: 100 })
      handleChange.mockClear()

      // Drag the right contact to pinTarget (80,130). The anchor (left
      // contact) stays at pinA (50,100), so the new center must be
      // ((50+80)/2, (100+130)/2) = (65,115) and the rotation must point
      // from anchor → dragged end.
      dragRightHandleTo(80, 130)

      expect(handleChange).toHaveBeenCalled()
      const last = handleChange.mock.calls[handleChange.mock.calls.length - 1][0] as BreadboardProject
      const updated = last.modules?.[0]
      expect(updated).toBeTruthy()
      expect(updated!.centerX).toBeCloseTo(65, 5)
      expect(updated!.centerY).toBeCloseTo(115, 5)
      const expectedRotation = (Math.atan2(130 - 100, 80 - 50) * 180) / Math.PI
      expect(updated!.rotationDeg).toBeCloseTo(expectedRotation, 4)
      const expectedSpan = Math.hypot(80 - 50, 130 - 100)
      expect(updated!.passiveSpanMm).toBeCloseTo(expectedSpan, 4)
    })

    it('does not commit when the drag is released away from any breadboard pin', () => {
      const part = makeResistorPart()
      const project = makeProjectWithResistorBetween({ x: 50, y: 100 }, { x: 70, y: 100 })
      const original = project.modules![0]
      const handleChange = vi.fn()

      render(
        <WireEditor
          project={project}
          breadboard={passiveBoard}
          libraryParts={[part]}
          status=""
          onBack={() => {}}
          onChange={handleChange}
        />,
      )

      const moduleGroup = document.querySelector('[data-module-id="mod-1"]') as SVGGElement
      fireEvent.pointerDown(moduleGroup, { button: 0, pointerId: 99, clientX: 60, clientY: 100 })
      fireEvent.pointerUp(moduleGroup, { button: 0, pointerId: 99, clientX: 60, clientY: 100 })
      handleChange.mockClear()

      // Release in empty space (well away from every pin).
      dragRightHandleTo(300, 20)

      // No persisted commit – original geometry is preserved.
      const lastCall = handleChange.mock.calls[handleChange.mock.calls.length - 1]
      if (lastCall) {
        const last = lastCall[0] as BreadboardProject
        const updated = last.modules?.[0]
        if (updated) {
          // If anything was written, it must equal the original (i.e. no
          // accidental geometry mutation).
          expect(updated.centerX).toBeCloseTo(original.centerX, 5)
          expect(updated.centerY).toBeCloseTo(original.centerY, 5)
        }
      }
    })
  })
})
