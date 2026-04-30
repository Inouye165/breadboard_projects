import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { GeneratedPassiveEditor } from './GeneratedPassiveEditor'

describe('GeneratedPassiveEditor', () => {
  it('lets the user choose a part type, edit it, and save without uploading any image', () => {
    const onSave = vi.fn()
    render(
      <GeneratedPassiveEditor
        isBusy={false}
        status=""
        onCancel={() => {}}
        onSave={onSave}
      />,
    )

    // Step 1: choose Resistor
    fireEvent.click(screen.getByRole('button', { name: 'Resistor' }))

    // Step 2: edit appears with a live preview
    expect(screen.getByLabelText(/Live preview/i)).toBeTruthy()
    expect(screen.getByLabelText(/Resistor/i)).toBeTruthy()

    // Step 3: save
    fireEvent.click(screen.getByRole('button', { name: 'Save part' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.kind).toBe('generated-passive')
    expect(saved.imageViews).toEqual([])
    expect(saved.passive.passiveType).toBe('resistor')
    expect(saved.physicalPoints.length).toBe(2)
  })

  it('saves a polarized capacitor with + and - leads', () => {
    const onSave = vi.fn()
    render(
      <GeneratedPassiveEditor
        isBusy={false}
        status=""
        onCancel={() => {}}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Capacitor' }))
    fireEvent.change(screen.getByLabelText('Polarity'), { target: { value: 'polarized' } })
    fireEvent.change(screen.getByLabelText('Mounting style'), {
      target: { value: 'through-hole-radial' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save part' }))

    expect(onSave).toHaveBeenCalled()
    const saved = onSave.mock.calls[0][0]
    expect(saved.passive.polarized).toBe(true)
    const labels = saved.physicalPoints.map((p: { label?: string }) => p.label).sort()
    expect(labels).toEqual(['+', '-'])
  })
})
