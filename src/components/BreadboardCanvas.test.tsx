import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BreadboardCanvas } from './BreadboardCanvas'

describe('BreadboardCanvas', () => {
  it('prompts for a screenshot when no image is provided', () => {
    render(<BreadboardCanvas onImageSelected={vi.fn()} />)

    expect(
      screen.getByRole('heading', {
        name: /add a breadboard screenshot to begin/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/breadboard upload prompt/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /choose image/i })).toBeInTheDocument()
  })

  it('renders the supplied breadboard image', () => {
    const { container } = render(
      <BreadboardCanvas imageSrc="/example-board.png" imageName="main-board" onImageSelected={vi.fn()} />,
    )
    const view = within(container)

    expect(view.getByLabelText(/part editor/i)).toBeInTheDocument()
    expect(view.getByRole('button', { name: /replace image/i })).toBeInTheDocument()
    expect(view.getByRole('button', { name: /save aligned definition/i })).toBeInTheDocument()
    expect(view.getByRole('combobox', { name: /^region$/i })).toBeInTheDocument()
    expect(view.getByRole('button', { name: /upper terminal strip top left anchor/i })).toBeInTheDocument()
  })

  it('forwards a selected file from the fallback input', () => {
    const onImageSelected = vi.fn()

    const { container } = render(<BreadboardCanvas onImageSelected={onImageSelected} />)

    const input = container.querySelector('input[type="file"]')
    const file = new File(['image'], 'board.png', { type: 'image/png' })

    expect(input).not.toBeNull()

    fireEvent.change(input!, { target: { files: [file] } })

    expect(onImageSelected).toHaveBeenCalledWith(file)
  })

  it('migrates stale autosaved definitions into the standard calibration template', () => {
    window.localStorage.setItem(
      'breadboard-projects.part-definitions',
      JSON.stringify({
        'breadboard:autosaved-board': {
          id: 'breadboard:autosaved-board',
          name: 'autosaved-board',
          imageSrc: '/example-board.png',
          imageWidth: 1200,
          imageHeight: 420,
          points: [
            {
              id: 'group-1:1-1',
              label: 'Group 1 1,1',
              x: 0.2,
              y: 0.2,
              kind: 'breadboard-hole',
              group: 'group-1',
            },
          ],
          metadata: {
            kind: 'breadboard',
            regions: [
              {
                id: 'group-1',
                name: 'Group 1',
                pointIds: ['group-1:1-1'],
                rows: [{ id: '1', label: 'Row 1', pointIds: ['group-1:1-1'] }],
                columns: [{ id: '1', label: 'Column 1', pointIds: ['group-1:1-1'] }],
                anchors: [
                  { key: 'topLeft', label: 'Top left', x: 0.2, y: 0.2 },
                  { key: 'topRight', label: 'Top right', x: 0.2, y: 0.2 },
                  { key: 'bottomLeft', label: 'Bottom left', x: 0.2, y: 0.2 },
                  { key: 'bottomRight', label: 'Bottom right', x: 0.2, y: 0.2 },
                ],
                defaultAnchors: [
                  { key: 'topLeft', label: 'Top left', x: 0.2, y: 0.2 },
                  { key: 'topRight', label: 'Top right', x: 0.2, y: 0.2 },
                  { key: 'bottomLeft', label: 'Bottom left', x: 0.2, y: 0.2 },
                  { key: 'bottomRight', label: 'Bottom right', x: 0.2, y: 0.2 },
                ],
              },
            ],
          },
        },
      }),
    )

    render(
      <BreadboardCanvas imageSrc="/example-board.png" imageName="autosaved-board" onImageSelected={vi.fn()} />,
    )

    expect(screen.getByText(/restored your saved calibration for this board/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^connection point a1$/i }).length).toBeGreaterThan(0)
  })
})