import { useMemo, useState } from 'react'

import { PartCanvas } from './PartCanvas'
import {
  applyBreadboardRegionAnchors,
  createBreadboardPartDefinition,
  moveBreadboardColumn,
  moveBreadboardPoint,
  moveBreadboardRegion,
  moveBreadboardRow,
  resetBreadboardRegion,
} from '../lib/breadboardPartDefinitions'
import { loadPartDefinition, savePartDefinition } from '../lib/partDefinitionStorage'
import {
  getPartPointById,
  getPartRegion,
  updatePartPoints,
  type PartDefinition,
  type PartKind,
  type PartPoint,
  type PartRegionAnchorKey,
} from '../lib/parts'

type PartEditorProps = {
  imageSrc: string
  imageWidth: number
  imageHeight: number
  imageName?: string
  onReplaceImage: () => void
}

type EditorMode = 'select' | 'move-region' | 'move-row' | 'move-column' | 'move-point'

type Position = {
  x: number
  y: number
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'part'
}

function createDefinitionId(kind: PartKind, imageName?: string) {
  return `${kind}:${slugify(imageName ?? 'current-part')}`
}

function createEmptyPartDefinition(
  kind: PartKind,
  imageSrc: string,
  imageWidth: number,
  imageHeight: number,
  imageName?: string,
): PartDefinition {
  return {
    id: createDefinitionId(kind, imageName),
    name: imageName ?? 'Part',
    imageSrc,
    imageWidth,
    imageHeight,
    points: [],
    metadata: {
      kind,
      regions: [],
    },
  }
}

function createInitialDefinition(
  kind: PartKind,
  imageSrc: string,
  imageWidth: number,
  imageHeight: number,
  imageName?: string,
) {
  if (kind === 'breadboard') {
    return createBreadboardPartDefinition({
      id: createDefinitionId(kind, imageName),
      name: imageName ?? 'Breadboard',
      imageSrc,
      imageWidth,
      imageHeight,
    })
  }

  return createEmptyPartDefinition(kind, imageSrc, imageWidth, imageHeight, imageName)
}

function getBreadboardSelection(definition: PartDefinition, pointId: string) {
  const region = definition.metadata.regions?.find((entry) => entry.pointIds.includes(pointId))

  if (!region) {
    return {}
  }

  return {
    regionId: region.id,
    rowId: region.rows.find((entry) => entry.pointIds.includes(pointId))?.id,
    columnId: region.columns.find((entry) => entry.pointIds.includes(pointId))?.id,
  }
}

function addManualPoint(definition: PartDefinition, position: Position) {
  const nextIndex = definition.points.length + 1
  const point: PartPoint = {
    id: `point-${nextIndex}`,
    label: `P${nextIndex}`,
    x: position.x,
    y: position.y,
    kind: 'pin',
  }

  return {
    ...definition,
    points: [...definition.points, point],
  }
}

export function PartEditor({
  imageSrc,
  imageWidth,
  imageHeight,
  imageName,
  onReplaceImage,
}: PartEditorProps) {
  const [partKind, setPartKind] = useState<PartKind>('breadboard')
  const editorKey = `${partKind}:${imageSrc}:${imageWidth}:${imageHeight}:${imageName ?? 'part'}`

  return (
    <PartEditorWorkspace
      key={editorKey}
      partKind={partKind}
      setPartKind={setPartKind}
      imageSrc={imageSrc}
      imageWidth={imageWidth}
      imageHeight={imageHeight}
      imageName={imageName}
      onReplaceImage={onReplaceImage}
    />
  )
}

type PartEditorWorkspaceProps = PartEditorProps & {
  partKind: PartKind
  setPartKind: (kind: PartKind) => void
}

function PartEditorWorkspace({
  partKind,
  setPartKind,
  imageSrc,
  imageWidth,
  imageHeight,
  imageName,
  onReplaceImage,
}: PartEditorWorkspaceProps) {
  const savedDefinition = loadPartDefinition(createDefinitionId(partKind, imageName))
  const [definition, setDefinition] = useState<PartDefinition>(() =>
    savedDefinition
      ? {
          ...savedDefinition,
          id: createDefinitionId(partKind, imageName),
          name: imageName ?? savedDefinition.name,
          imageSrc,
          imageWidth,
          imageHeight,
        }
      : createInitialDefinition(partKind, imageSrc, imageWidth, imageHeight, imageName),
  )
  const [mode, setMode] = useState<EditorMode>('select')
  const [showPoints, setShowPoints] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [selectedRegionId, setSelectedRegionId] = useState(
    definition.metadata.regions?.[0]?.id ?? '',
  )
  const [selectedRowId, setSelectedRowId] = useState<string>()
  const [selectedColumnId, setSelectedColumnId] = useState<string>()
  const [selectedPointId, setSelectedPointId] = useState<string>()
  const [activeAnchorKey, setActiveAnchorKey] = useState<PartRegionAnchorKey>()
  const [isAddingManualPoint, setIsAddingManualPoint] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
    savedDefinition
      ? `Loaded saved ${partKind} definition.`
      : partKind === 'breadboard'
        ? 'Generated an initial point template. Place anchors to calibrate the grid.'
        : 'Ready for manual point placement.',
  )

  const selectedRegion = selectedRegionId ? getPartRegion(definition, selectedRegionId) : undefined
  const selectedPoint = selectedPointId ? getPartPointById(definition, selectedPointId) : undefined

  const highlightedPointIds = useMemo(() => {
    if (mode === 'move-region') {
      return selectedRegion?.pointIds ?? []
    }

    if (mode === 'move-row' && selectedRegion && selectedRowId) {
      return selectedRegion.rows.find((entry) => entry.id === selectedRowId)?.pointIds ?? []
    }

    if (mode === 'move-column' && selectedRegion && selectedColumnId) {
      return selectedRegion.columns.find((entry) => entry.id === selectedColumnId)?.pointIds ?? []
    }

    if (selectedPointId) {
      return [selectedPointId]
    }

    return []
  }, [mode, selectedColumnId, selectedPointId, selectedRegion, selectedRowId])

  function applyMovement(pointId: string, delta: Position) {
    setDefinition((currentDefinition) => {
      if (currentDefinition.metadata.kind === 'breadboard') {
        const selection = getBreadboardSelection(currentDefinition, pointId)

        if (mode === 'move-region' && selection.regionId) {
          return moveBreadboardRegion(currentDefinition, selection.regionId, delta.x, delta.y)
        }

        if (mode === 'move-row' && selection.regionId && selection.rowId) {
          return moveBreadboardRow(currentDefinition, selection.regionId, selection.rowId, delta.y)
        }

        if (mode === 'move-column' && selection.regionId && selection.columnId) {
          return moveBreadboardColumn(currentDefinition, selection.regionId, selection.columnId, delta.x)
        }

        if (mode === 'move-point') {
          return moveBreadboardPoint(currentDefinition, pointId, delta.x, delta.y)
        }

        return currentDefinition
      }

      if (mode === 'move-point') {
        return updatePartPoints(currentDefinition, [pointId], (point) => ({
          ...point,
          x: point.x + delta.x,
          y: point.y + delta.y,
        }))
      }

      return currentDefinition
    })
  }

  function handlePointPointerDown(pointId: string) {
    setSelectedPointId(pointId)

    if (definition.metadata.kind !== 'breadboard') {
      return
    }

    const selection = getBreadboardSelection(definition, pointId)
    setSelectedRegionId(selection.regionId ?? selectedRegionId)
    setSelectedRowId(selection.rowId)
    setSelectedColumnId(selection.columnId)
  }

  function handleCanvasPointerDown(position: Position) {
    if (definition.metadata.kind === 'breadboard' && activeAnchorKey && selectedRegion) {
      const nextAnchors = selectedRegion.anchors.map((anchor) =>
        anchor.key === activeAnchorKey
          ? {
              ...anchor,
              x: position.x,
              y: position.y,
            }
          : anchor,
      )

      setDefinition((currentDefinition) =>
        applyBreadboardRegionAnchors(currentDefinition, selectedRegion.id, nextAnchors),
      )
      setActiveAnchorKey(undefined)
      setStatusMessage(`Placed ${activeAnchorKey} anchor for ${selectedRegion.name}.`)
      return
    }

    if (definition.metadata.kind !== 'breadboard' && isAddingManualPoint) {
      setDefinition((currentDefinition) => addManualPoint(currentDefinition, position))
      setStatusMessage('Added a manual point. Select it to rename or nudge it.')
    }
  }

  function handleSaveDefinition() {
    savePartDefinition(definition)
    setStatusMessage(`Saved ${definition.name} definition.`)
  }

  function handleReloadDefinition() {
    const savedDefinition = loadPartDefinition(definition.id)

    if (!savedDefinition) {
      setStatusMessage('No saved definition found for this part yet.')
      return
    }

    setDefinition({
      ...savedDefinition,
      imageSrc,
      imageWidth,
      imageHeight,
    })
    setStatusMessage('Reloaded the saved part definition.')
  }

  function handleGenerateTemplate() {
    setDefinition(createInitialDefinition(partKind, imageSrc, imageWidth, imageHeight, imageName))
    setStatusMessage(
      partKind === 'breadboard'
        ? 'Regenerated the standard breadboard template.'
        : 'Cleared manual points for a fresh part definition.',
    )
  }

  function handleResetRegion() {
    if (!selectedRegionId || definition.metadata.kind !== 'breadboard') {
      return
    }

    setDefinition((currentDefinition) => resetBreadboardRegion(currentDefinition, selectedRegionId))
    setStatusMessage(`Reset ${selectedRegion?.name ?? 'region'} to its template anchors.`)
  }

  function handleSelectedPointLabelChange(nextLabel: string) {
    if (!selectedPointId) {
      return
    }

    setDefinition((currentDefinition) =>
      updatePartPoints(currentDefinition, [selectedPointId], (point) => ({
        ...point,
        label: nextLabel,
      })),
    )
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const isHorizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
    const isVertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'

    if (!isHorizontal && !isVertical) {
      return
    }

    const stepX = (event.shiftKey ? 10 : 1) / imageWidth
    const stepY = (event.shiftKey ? 10 : 1) / imageHeight
    const delta = {
      x: event.key === 'ArrowLeft' ? -stepX : event.key === 'ArrowRight' ? stepX : 0,
      y: event.key === 'ArrowUp' ? -stepY : event.key === 'ArrowDown' ? stepY : 0,
    }

    if (!selectedPointId && !selectedRegionId) {
      return
    }

    event.preventDefault()

    if (definition.metadata.kind === 'breadboard' && selectedPointId) {
      applyMovement(selectedPointId, delta)
      return
    }

    if (definition.metadata.kind !== 'breadboard' && selectedPointId) {
      applyMovement(selectedPointId, delta)
    }
  }

  return (
    <section className="part-editor" aria-label="Part editor" tabIndex={0} onKeyDown={handleKeyDown}>
      <aside className="part-editor__sidebar">
        <div className="part-editor__group">
          <p className="eyebrow">Editor</p>
          <h3 className="part-editor__title">Calibration-based part editor</h3>
          <p className="part-editor__copy">
            Fit reusable point templates to the image, then fine-tune regions, rows,
            columns, or individual points.
          </p>
        </div>

        <div className="part-editor__group">
          <label className="part-editor__label" htmlFor="part-kind-select">
            Part kind
          </label>
          <select
            id="part-kind-select"
            className="part-editor__select"
            value={partKind}
            onChange={(event) => setPartKind(event.target.value as PartKind)}
          >
            <option value="breadboard">Breadboard</option>
            <option value="module">Module</option>
            <option value="microcontroller">Microcontroller</option>
            <option value="sensor">Sensor</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">Editor mode</p>
          <div className="part-editor__button-grid">
            {[
              ['select', 'Select'],
              ['move-region', 'Move whole region'],
              ['move-row', 'Move row'],
              ['move-column', 'Move column'],
              ['move-point', 'Move point'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`ghost-button${mode === value ? ' ghost-button--active' : ''}`}
                onClick={() => setMode(value as EditorMode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">Canvas controls</p>
          <div className="part-editor__toolbar">
            <button
              type="button"
              className={`ghost-button${showPoints ? ' ghost-button--active' : ''}`}
              onClick={() => setShowPoints((current) => !current)}
            >
              {showPoints ? 'Hide points' : 'Show points'}
            </button>
            <button
              type="button"
              className={`ghost-button${showLabels ? ' ghost-button--active' : ''}`}
              onClick={() => setShowLabels((current) => !current)}
            >
              {showLabels ? 'Hide labels' : 'Show labels'}
            </button>
          </div>
          <div className="part-editor__toolbar">
            <button
              type="button"
              className="ghost-button"
              onClick={() => setZoom((current) => Math.max(0.75, current - 0.25))}
            >
              Zoom -
            </button>
            <span className="part-editor__zoom-label">{zoom.toFixed(2)}x</span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setZoom((current) => Math.min(3, current + 0.25))}
            >
              Zoom +
            </button>
          </div>
        </div>

        {definition.metadata.kind === 'breadboard' ? (
          <div className="part-editor__group">
            <label className="part-editor__label" htmlFor="region-select">
              Breadboard region
            </label>
            <select
              id="region-select"
              className="part-editor__select"
              value={selectedRegionId}
              onChange={(event) => setSelectedRegionId(event.target.value)}
            >
              {definition.metadata.regions?.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
            <div className="part-editor__button-grid part-editor__button-grid--anchors">
              {(selectedRegion?.anchors ?? []).map((anchor) => (
                <button
                  key={anchor.key}
                  type="button"
                  className={`ghost-button${activeAnchorKey === anchor.key ? ' ghost-button--active' : ''}`}
                  onClick={() => setActiveAnchorKey(anchor.key)}
                >
                  Set {anchor.label}
                </button>
              ))}
            </div>
            <div className="part-editor__toolbar">
              <button type="button" className="ghost-button" onClick={handleGenerateTemplate}>
                Generate template
              </button>
              <button type="button" className="ghost-button" onClick={handleResetRegion}>
                Reset region
              </button>
            </div>
          </div>
        ) : (
          <div className="part-editor__group">
            <p className="part-editor__label">Manual placement</p>
            <div className="part-editor__toolbar">
              <button
                type="button"
                className={`ghost-button${isAddingManualPoint ? ' ghost-button--active' : ''}`}
                onClick={() => setIsAddingManualPoint((current) => !current)}
              >
                {isAddingManualPoint ? 'Stop adding points' : 'Add point'}
              </button>
              <button type="button" className="ghost-button" onClick={handleGenerateTemplate}>
                Clear points
              </button>
            </div>
          </div>
        )}

        <div className="part-editor__group">
          <p className="part-editor__label">Definition actions</p>
          <div className="part-editor__toolbar">
            <button type="button" className="action-button" onClick={handleSaveDefinition}>
              Save part definition
            </button>
            <button type="button" className="ghost-button" onClick={handleReloadDefinition}>
              Load saved
            </button>
          </div>
          <button type="button" className="ghost-button" onClick={onReplaceImage}>
            Replace image
          </button>
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">Selected point</p>
          {selectedPoint ? (
            <>
              <p className="part-editor__selection">{selectedPoint.id}</p>
              <label className="part-editor__label" htmlFor="selected-point-label">
                Point label
              </label>
              <input
                id="selected-point-label"
                className="part-editor__input"
                value={selectedPoint.label}
                onChange={(event) => handleSelectedPointLabelChange(event.target.value)}
              />
            </>
          ) : (
            <p className="part-editor__hint">Select a point to rename or nudge it.</p>
          )}
        </div>

        <p className="part-editor__status">{statusMessage}</p>
      </aside>

      <div className="part-editor__canvas-shell">
        <PartCanvas
          definition={definition}
          zoom={zoom}
          showPoints={showPoints}
          showLabels={showLabels}
          highlightedPointIds={highlightedPointIds}
          onPointPointerDown={handlePointPointerDown}
          onPointDrag={applyMovement}
          onCanvasPointerDown={handleCanvasPointerDown}
        />
      </div>
    </section>
  )
}