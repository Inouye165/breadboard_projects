import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProjectView } from './ProjectView'
import type { BreadboardDefinition } from '../lib/breadboardDefinitionModel'
import type { BreadboardProject } from '../lib/breadboardProjectModel'

const breadboard: BreadboardDefinition = {
  id: 'definition-1',
  name: 'Test breadboard',
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

function makeProject(overrides: Partial<BreadboardProject> = {}): BreadboardProject {
  return {
    id: 'project-1',
    name: 'My LED project',
    breadboardDefinitionId: breadboard.id,
    wires: [
      { id: 'wire-1', fromPointId: 'p1', toPointId: 'p2', color: '#cc3333' },
      {
        id: 'wire-2',
        fromPointId: 'p2',
        toPointId: 'p3',
        color: '#1f8e4d',
        waypoints: [{ x: 250, y: 150 }],
      },
    ],
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    ...overrides,
  }
}

describe('ProjectView', () => {
  it('renders project metadata, breadboard module, and wire list', () => {
    render(
      <ProjectView
        project={makeProject()}
        breadboard={breadboard}
        status="2 wires placed"
        onBack={() => {}}
      />,
    )

    expect(screen.getByRole('heading', { name: /My LED project/ })).toBeTruthy()
    expect(screen.getByText('2 wires placed')).toBeTruthy()
    expect(screen.getByText('Test breadboard')).toBeTruthy()
    expect(screen.getByLabelText('Wire 1: A1 to A2')).toBeTruthy()
    expect(screen.getByLabelText('Wire 2: A2 to A3')).toBeTruthy()
    expect(screen.getByText(/1 routing point/)).toBeTruthy()
  })

  it('renders wires as polylines that include any waypoints', () => {
    render(
      <ProjectView
        project={makeProject()}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
      />,
    )

    const wireWithWaypoint = screen.getByLabelText('Wire from A2 to A3')
    expect(wireWithWaypoint.tagName.toLowerCase()).toBe('polyline')
    expect(wireWithWaypoint.getAttribute('points')).toBe('200,100 250,150 300,200')
  })

  it('groups components by kind and shows label plus description', () => {
    render(
      <ProjectView
        project={makeProject({
          components: [
            { id: 'c-1', kind: 'resistor', label: 'R1', description: '220 ohms' },
            { id: 'c-2', kind: 'resistor', label: 'R2' },
            { id: 'c-3', kind: 'led', label: 'D1', description: 'Red 5mm' },
          ],
        })}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
      />,
    )

    expect(screen.getByText(/Components \(3\)/)).toBeTruthy()
    expect(screen.getByText(/Resistor \(2\)/)).toBeTruthy()
    expect(screen.getByText(/Led \(1\)/)).toBeTruthy()
    expect(screen.getByText('R1 - 220 ohms')).toBeTruthy()
    expect(screen.getByText('R2')).toBeTruthy()
    expect(screen.getByText('D1 - Red 5mm')).toBeTruthy()
  })

  it('shows an empty-state message when there are no components', () => {
    render(
      <ProjectView
        project={makeProject({ components: [] })}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
      />,
    )

    expect(screen.getByText(/No components tracked yet/)).toBeTruthy()
  })

  it('does not render any editor handles or pin click affordances', () => {
    render(
      <ProjectView
        project={makeProject()}
        breadboard={breadboard}
        status=""
        onBack={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: /Add routing point/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /routing point 1/ })).toBeNull()
    expect(screen.queryByLabelText(/Pin hole A1$/)?.tagName.toLowerCase()).not.toBe('button')
  })

  it('invokes onBack and onEdit when their buttons are clicked', () => {
    const handleBack = vi.fn()
    const handleEdit = vi.fn()

    render(
      <ProjectView
        project={makeProject()}
        breadboard={breadboard}
        status=""
        onBack={handleBack}
        onEdit={handleEdit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Back to projects/ }))
    fireEvent.click(screen.getByRole('button', { name: /Edit project/ }))

    expect(handleBack).toHaveBeenCalledTimes(1)
    expect(handleEdit).toHaveBeenCalledTimes(1)
  })
})
