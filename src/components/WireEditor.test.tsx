import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { WireEditor } from './WireEditor'
import type { BreadboardDefinition } from '../lib/breadboardDefinitionModel'
import type { BreadboardProject } from '../lib/breadboardProjectModel'

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

  it('persists a dragged waypoint to its dropped position', () => {
    const handleChange = vi.fn()

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
})
