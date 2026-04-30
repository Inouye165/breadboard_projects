import { useMemo, useState } from 'react'

import { GeneratedPassivePreview } from './GeneratedPassiveSvg'
import {
  CAPACITOR_PRESETS,
  CAPACITOR_TOLERANCES,
  CAPACITOR_TYPES,
  CAPACITOR_UNITS,
  CAPACITOR_VOLTAGE_PRESETS,
  RESISTOR_MATERIALS,
  RESISTOR_MOUNTING_STYLES,
  RESISTOR_POWER_RATINGS,
  RESISTOR_PRESETS,
  RESISTOR_TOLERANCES,
  RESISTOR_UNITS,
  SMD_PACKAGE_SIZES,
  buildPassiveLibraryPart,
  computePassiveGeometry,
  defaultCapacitorSpec,
  defaultResistorSpec,
  validatePassiveSpec,
  type CapacitorSpec,
  type GeneratedPassiveSpec,
  type PassiveType,
  type ResistorSpec,
} from '../lib/generatedPassive'
import { capacitorEiaCode } from '../lib/capacitorLabel'
import type { LibraryPartDefinition } from '../lib/partLibraryModel'

type Props = {
  initialPart?: LibraryPartDefinition | null
  isBusy: boolean
  status: string
  onCancel: () => void
  onSave: (part: LibraryPartDefinition) => void
}

type WizardStep = 'choose-type' | 'edit'

export function GeneratedPassiveEditor({ initialPart, isBusy, status, onCancel, onSave }: Props) {
  const initialSpec =
    initialPart && initialPart.kind === 'generated-passive' && initialPart.passive
      ? (initialPart.passive as GeneratedPassiveSpec)
      : null
  const [step, setStep] = useState<WizardStep>(initialSpec ? 'edit' : 'choose-type')
  const [spec, setSpec] = useState<GeneratedPassiveSpec | null>(initialSpec)

  const issues = useMemo(() => (spec ? validatePassiveSpec(spec) : []), [spec])
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')

  function pickType(type: PassiveType) {
    setSpec(type === 'resistor' ? defaultResistorSpec() : defaultCapacitorSpec())
    setStep('edit')
  }

  function handleSave() {
    if (!spec || errors.length > 0) return
    const part = buildPassiveLibraryPart(spec, { existing: initialPart ?? undefined })
    onSave(part)
  }

  if (step === 'choose-type' || !spec) {
    return (
      <section className="image-workspace" aria-label="Add generated part - choose type">
        <header className="image-workspace__header">
          <p className="image-workspace__eyebrow">Generated part - step 1 of 3</p>
          <h1 className="image-workspace__title">Choose part type</h1>
          <p className="image-workspace__status">{status}</p>
        </header>
        <div className="image-workspace__actions" style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="action-button" onClick={() => pickType('resistor')}>
            Resistor
          </button>
          <button type="button" className="action-button" onClick={() => pickType('capacitor')}>
            Capacitor
          </button>
          <button type="button" className="action-button action-button--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="image-workspace" aria-label="Edit generated passive part">
      <header className="image-workspace__header">
        <p className="image-workspace__eyebrow">
          Generated {spec.passiveType} - step 2 of 3
        </p>
        <h1 className="image-workspace__title">{spec.displayName || 'Untitled passive'}</h1>
        <p className="image-workspace__status">{status}</p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 1fr) minmax(280px, 360px)',
          gap: 24,
          alignItems: 'start',
        }}
      >
        <div>
          <Field label="Display name">
            <input
              type="text"
              value={spec.displayName}
              onChange={(event) => setSpec({ ...spec, displayName: event.target.value })}
            />
          </Field>

          {spec.passiveType === 'resistor' ? (
            <ResistorFields spec={spec} onChange={setSpec} />
          ) : (
            <CapacitorFields spec={spec} onChange={setSpec} />
          )}
        </div>

        <aside aria-label="Live preview">
          <h2 className="component-library__panel-title">Preview</h2>
          <GeneratedPassivePreview spec={spec} />
          <PartSummary spec={spec} />
          {errors.length > 0 ? (
            <ul style={{ color: '#9b1c1c', marginTop: 8 }} aria-label="Validation errors">
              {errors.map((issue, index) => (
                <li key={`err-${index}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {warnings.length > 0 ? (
            <ul style={{ color: '#915b00', marginTop: 8 }} aria-label="Validation warnings">
              {warnings.map((issue, index) => (
                <li key={`warn-${index}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </aside>
      </div>

      <div className="image-workspace__actions" style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          type="button"
          className="action-button"
          onClick={handleSave}
          disabled={isBusy || errors.length > 0}
        >
          Save part
        </button>
        <button type="button" className="action-button action-button--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginBottom: 10,
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

function PartSummary({ spec }: { spec: GeneratedPassiveSpec }) {
  const geom = computePassiveGeometry(spec)
  return (
    <p style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
      Bounding box: {geom.widthMm.toFixed(2)} × {geom.heightMm.toFixed(2)} mm
      <br />
      Leads: {geom.leads.map((l) => `${l.name}(${l.xMm.toFixed(1)},${l.yMm.toFixed(1)})`).join('  ')}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Resistor-specific fields
// ---------------------------------------------------------------------------

function ResistorFields({
  spec,
  onChange,
}: {
  spec: ResistorSpec
  onChange: (next: GeneratedPassiveSpec) => void
}) {
  function update<K extends keyof ResistorSpec>(key: K, value: ResistorSpec[K]) {
    onChange({ ...spec, [key]: value })
  }

  function applyPreset(presetId: string) {
    const preset = RESISTOR_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const presetSpec = preset.spec()
    onChange({
      ...presetSpec,
      displayName: spec.displayName,
      resistance: spec.resistance,
      unit: spec.unit,
      tolerance: spec.tolerance,
    })
  }

  function updatePhysical<F extends string, V>(field: F, value: V) {
    onChange({ ...spec, physical: { ...spec.physical, [field]: value } as ResistorSpec['physical'] })
  }

  return (
    <>
      <Field label="Preset">
        <select onChange={(e) => applyPreset(e.target.value)} value="" aria-label="Apply preset">
          <option value="" disabled>
            Choose preset…
          </option>
          {RESISTOR_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Resistance">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            min={0}
            step="any"
            value={spec.resistance}
            onChange={(e) => update('resistance', Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <select value={spec.unit} onChange={(e) => update('unit', e.target.value as typeof spec.unit)}>
            {RESISTOR_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <Field label="Tolerance">
        <select
          value={spec.tolerance}
          onChange={(e) => update('tolerance', Number(e.target.value) as typeof spec.tolerance)}
        >
          {RESISTOR_TOLERANCES.map((tol) => (
            <option key={tol} value={tol}>
              ±{tol}%
            </option>
          ))}
        </select>
      </Field>

      <Field label="Power rating">
        <select
          value={spec.powerRating}
          onChange={(e) => update('powerRating', e.target.value as typeof spec.powerRating)}
        >
          {RESISTOR_POWER_RATINGS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Max working voltage (V, optional)">
        <input
          type="number"
          min={0}
          value={spec.maxWorkingVoltageV ?? ''}
          onChange={(e) =>
            update('maxWorkingVoltageV', e.target.value === '' ? undefined : Number(e.target.value))
          }
        />
      </Field>

      <Field label="Temperature coefficient (ppm/°C, optional)">
        <input
          type="number"
          value={spec.temperatureCoefficient ?? ''}
          onChange={(e) =>
            update('temperatureCoefficient', e.target.value === '' ? undefined : Number(e.target.value))
          }
        />
      </Field>

      <Field label="Material / composition">
        <select value={spec.material} onChange={(e) => update('material', e.target.value as typeof spec.material)}>
          {RESISTOR_MATERIALS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Mounting style">
        <select
          value={spec.physical.mounting}
          onChange={(e) => {
            const mounting = e.target.value as typeof spec.physical.mounting
            const preset = RESISTOR_PRESETS.find((p) =>
              mounting === 'smd-chip'
                ? p.id === 'smd-0805'
                : mounting === 'ceramic-power'
                  ? p.id === 'axial-1-2w-metal-film'
                  : p.id === 'axial-1-4w-metal-film',
            )
            const next = preset ? preset.spec() : spec
            onChange({ ...spec, physical: { ...next.physical, mounting } })
          }}
        >
          {RESISTOR_MOUNTING_STYLES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      {spec.physical.mounting === 'smd-chip' ? (
        <>
          <Field label="SMD package">
            <select
              value={spec.physical.packageSize}
              onChange={(e) => {
                const packageSize = e.target.value as (typeof SMD_PACKAGE_SIZES)[number]
                const dims =
                  packageSize === '1206'
                    ? { bodyLengthMm: 3.2, bodyWidthMm: 1.6 }
                    : packageSize === '0805'
                      ? { bodyLengthMm: 2.0, bodyWidthMm: 1.25 }
                      : packageSize === '0603'
                        ? { bodyLengthMm: 1.6, bodyWidthMm: 0.8 }
                        : packageSize === '0402'
                          ? { bodyLengthMm: 1.0, bodyWidthMm: 0.5 }
                          : { bodyLengthMm: 0.6, bodyWidthMm: 0.3 }
                onChange({
                  ...spec,
                  physical: { mounting: 'smd-chip', packageSize, ...dims },
                })
              }}
            >
              {SMD_PACKAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field label="Body length (mm)">
            <input
              type="number"
              min={0}
              step="0.1"
              value={spec.physical.bodyLengthMm}
              onChange={(e) => updatePhysical('bodyLengthMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Body diameter (mm)">
            <input
              type="number"
              min={0}
              step="0.1"
              value={spec.physical.bodyDiameterMm}
              onChange={(e) => updatePhysical('bodyDiameterMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Lead diameter (mm)">
            <input
              type="number"
              min={0}
              step="0.05"
              value={spec.physical.leadDiameterMm}
              onChange={(e) => updatePhysical('leadDiameterMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Lead length (mm)">
            <input
              type="number"
              min={0}
              step="1"
              value={spec.physical.leadLengthMm}
              onChange={(e) => updatePhysical('leadLengthMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Breadboard lead spacing (mm)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={spec.physical.leadSpacingMm}
              onChange={(e) => updatePhysical('leadSpacingMm', Number(e.target.value))}
            />
          </Field>
        </>
      )}

      <Field label="Color band display">
        <select
          value={spec.bands.bandCount}
          onChange={(e) =>
            update('bands', { ...spec.bands, bandCount: Number(e.target.value) as 4 | 5 })
          }
        >
          <option value={4}>4 bands</option>
          <option value={5}>5 bands</option>
        </select>
      </Field>

      <Field label="Manual band override (comma-separated colors, optional)">
        <input
          type="text"
          placeholder="e.g. red,black,brown,gold"
          value={spec.bands.override?.join(',') ?? ''}
          onChange={(e) => {
            const raw = e.target.value.trim()
            update('bands', {
              ...spec.bands,
              override: raw === '' ? null : raw.split(',').map((c) => c.trim()),
            })
          }}
        />
      </Field>
    </>
  )
}

// ---------------------------------------------------------------------------
// Capacitor-specific fields
// ---------------------------------------------------------------------------

function CapacitorFields({
  spec,
  onChange,
}: {
  spec: CapacitorSpec
  onChange: (next: GeneratedPassiveSpec) => void
}) {
  function update<K extends keyof CapacitorSpec>(key: K, value: CapacitorSpec[K]) {
    onChange({ ...spec, [key]: value })
  }

  function applyPreset(presetId: string) {
    const preset = CAPACITOR_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const presetSpec = preset.spec()
    onChange({
      ...presetSpec,
      displayName: spec.displayName,
      capacitance: spec.capacitance,
      unit: spec.unit,
      voltageRatingV: spec.voltageRatingV,
      tolerance: spec.tolerance,
    })
  }

  function updatePhysical<F extends string, V>(field: F, value: V) {
    onChange({ ...spec, physical: { ...spec.physical, [field]: value } as CapacitorSpec['physical'] })
  }

  function regenerateLabel() {
    update('printedLabel', capacitorEiaCode(spec.capacitance, spec.unit))
  }

  return (
    <>
      <Field label="Preset">
        <select onChange={(e) => applyPreset(e.target.value)} value="" aria-label="Apply preset">
          <option value="" disabled>
            Choose preset…
          </option>
          {CAPACITOR_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Capacitance">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            min={0}
            step="any"
            value={spec.capacitance}
            onChange={(e) => update('capacitance', Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <select value={spec.unit} onChange={(e) => update('unit', e.target.value as typeof spec.unit)}>
            {CAPACITOR_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <Field label="Voltage rating (V)">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            min={0}
            step="any"
            value={spec.voltageRatingV}
            onChange={(e) => update('voltageRatingV', Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <select
            value=""
            onChange={(e) => {
              if (e.target.value !== '') {
                update('voltageRatingV', Number(e.target.value))
              }
            }}
            aria-label="Voltage preset"
          >
            <option value="">Preset…</option>
            {CAPACITOR_VOLTAGE_PRESETS.map((v) => (
              <option key={v} value={v}>
                {v}V
              </option>
            ))}
          </select>
        </div>
      </Field>

      <Field label="Tolerance">
        <select
          value={spec.tolerance}
          onChange={(e) => update('tolerance', Number(e.target.value) as typeof spec.tolerance)}
        >
          {CAPACITOR_TOLERANCES.map((t) => (
            <option key={t} value={t}>
              ±{t}%
            </option>
          ))}
        </select>
      </Field>

      <Field label="Polarity">
        <select
          value={spec.polarized ? 'polarized' : 'non-polarized'}
          onChange={(e) => update('polarized', e.target.value === 'polarized')}
        >
          <option value="non-polarized">Non-polarized</option>
          <option value="polarized">Polarized</option>
        </select>
      </Field>

      <Field label="ESR (Ω, optional)">
        <input
          type="number"
          min={0}
          step="any"
          value={spec.esrOhms ?? ''}
          onChange={(e) => update('esrOhms', e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </Field>

      <Field label="Temperature rating (°C, optional)">
        <input
          type="number"
          value={spec.temperatureRatingC ?? ''}
          onChange={(e) =>
            update('temperatureRatingC', e.target.value === '' ? undefined : Number(e.target.value))
          }
        />
      </Field>

      <Field label="Type / material">
        <select value={spec.type} onChange={(e) => update('type', e.target.value as typeof spec.type)}>
          {CAPACITOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Mounting style">
        <select
          value={spec.physical.mounting}
          onChange={(e) => {
            const mounting = e.target.value as typeof spec.physical.mounting
            const fallback =
              mounting === 'smd'
                ? CAPACITOR_PRESETS.find((p) => p.id === 'mlcc-0805')!.spec()
                : mounting === 'through-hole-radial'
                  ? CAPACITOR_PRESETS.find((p) => p.id === 'electrolytic-5x11')!.spec()
                  : mounting === 'through-hole-axial'
                    ? {
                        ...defaultCapacitorSpec(),
                        physical: {
                          mounting: 'through-hole-axial' as const,
                          bodyLengthMm: 25,
                          bodyDiameterMm: 8,
                          leadLengthMm: 12,
                        },
                      }
                    : CAPACITOR_PRESETS.find((p) => p.id === 'ceramic-disc-2p54')!.spec()
            onChange({ ...spec, physical: fallback.physical })
          }}
        >
          {['through-hole-radial', 'through-hole-axial', 'smd', 'ceramic-disc'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      {spec.physical.mounting === 'smd' ? (
        <Field label="SMD package">
          <select
            value={spec.physical.packageSize}
            onChange={(e) => {
              const packageSize = e.target.value as (typeof SMD_PACKAGE_SIZES)[number]
              const dims =
                packageSize === '1206'
                  ? { bodyLengthMm: 3.2, bodyWidthMm: 1.6 }
                  : packageSize === '0805'
                    ? { bodyLengthMm: 2.0, bodyWidthMm: 1.25 }
                    : packageSize === '0603'
                      ? { bodyLengthMm: 1.6, bodyWidthMm: 0.8 }
                      : packageSize === '0402'
                        ? { bodyLengthMm: 1.0, bodyWidthMm: 0.5 }
                        : { bodyLengthMm: 0.6, bodyWidthMm: 0.3 }
              onChange({
                ...spec,
                physical: { mounting: 'smd', packageSize, ...dims },
              })
            }}
          >
            {SMD_PACKAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {spec.physical.mounting === 'through-hole-radial' ? (
        <>
          <Field label="Body diameter (mm)">
            <input
              type="number"
              min={0}
              step="0.1"
              value={spec.physical.bodyDiameterMm}
              onChange={(e) => updatePhysical('bodyDiameterMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Body height (mm)">
            <input
              type="number"
              min={0}
              step="0.1"
              value={spec.physical.bodyHeightMm}
              onChange={(e) => updatePhysical('bodyHeightMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Lead spacing (mm)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={spec.physical.leadSpacingMm}
              onChange={(e) => updatePhysical('leadSpacingMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Lead diameter (mm)">
            <input
              type="number"
              min={0}
              step="0.05"
              value={spec.physical.leadDiameterMm}
              onChange={(e) => updatePhysical('leadDiameterMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Lead length (mm)">
            <input
              type="number"
              min={0}
              step="1"
              value={spec.physical.leadLengthMm}
              onChange={(e) => updatePhysical('leadLengthMm', Number(e.target.value))}
            />
          </Field>
        </>
      ) : null}

      {spec.physical.mounting === 'through-hole-axial' ? (
        <>
          <Field label="Body length (mm)">
            <input
              type="number"
              min={0}
              step="0.1"
              value={spec.physical.bodyLengthMm}
              onChange={(e) => updatePhysical('bodyLengthMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Body diameter (mm)">
            <input
              type="number"
              min={0}
              step="0.1"
              value={spec.physical.bodyDiameterMm}
              onChange={(e) => updatePhysical('bodyDiameterMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Lead length (mm)">
            <input
              type="number"
              min={0}
              step="1"
              value={spec.physical.leadLengthMm}
              onChange={(e) => updatePhysical('leadLengthMm', Number(e.target.value))}
            />
          </Field>
        </>
      ) : null}

      {spec.physical.mounting === 'ceramic-disc' ? (
        <>
          <Field label="Disc diameter (mm)">
            <input
              type="number"
              min={0}
              step="0.1"
              value={spec.physical.discDiameterMm}
              onChange={(e) => updatePhysical('discDiameterMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Lead spacing (mm)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={spec.physical.leadSpacingMm}
              onChange={(e) => updatePhysical('leadSpacingMm', Number(e.target.value))}
            />
          </Field>
          <Field label="Lead length (mm)">
            <input
              type="number"
              min={0}
              step="1"
              value={spec.physical.leadLengthMm}
              onChange={(e) => updatePhysical('leadLengthMm', Number(e.target.value))}
            />
          </Field>
        </>
      ) : null}

      <Field label="Printed label">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={spec.printedLabel ?? ''}
            onChange={(e) => update('printedLabel', e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" className="action-button action-button--ghost" onClick={regenerateLabel}>
            Auto
          </button>
        </div>
      </Field>
    </>
  )
}
