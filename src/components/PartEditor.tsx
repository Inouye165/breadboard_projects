import { useEffect, useMemo, useState } from 'react'

import { PartCanvas } from './PartCanvas'
import {
  applyBreadboardRegionAnchors,
  createBreadboardPartDefinition,
  moveBreadboardAllRegions,
  moveBreadboardColumn,
  moveBreadboardPoint,
  moveBreadboardRegion,
  moveBreadboardRow,
  resetBreadboardRegion,
  rotateBreadboardRegion,
} from '../lib/breadboardPartDefinitions'
import { loadPartDefinition, savePartDefinition } from '../lib/partDefinitionStorage'
import { getPartPointById, getPartRegion, type PartDefinition, type Position } from '../lib/parts'

type PartEditorProps = {
  imageSrc: string
  imageWidth: number
  imageHeight: number
  imageName?: string
  onReplaceImage: () => void
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'part'
}

function createDefinitionId(imageName?: string) {
  return `breadboard:${slugify(imageName ?? 'current-part')}`
}

function createInitialDefinition(
  imageSrc: string,
  imageWidth: number,
  imageHeight: number,
  imageName?: string,
) {
  return createBreadboardPartDefinition({
    id: createDefinitionId(imageName),
    name: imageName ?? 'Breadboard',
    imageSrc,
    imageWidth,
    imageHeight,
  })
}

function normalizeDefinition(
  savedDefinition: PartDefinition | undefined,
  imageSrc: string,
  imageWidth: number,
  imageHeight: number,
  imageName?: string,
) {
  const fallbackDefinition = createInitialDefinition(imageSrc, imageWidth, imageHeight, imageName)

  if (!savedDefinition) {
    return fallbackDefinition
  }

  const hasCalibrationTemplate =
    (savedDefinition.metadata.template?.regions.length ?? 0) > 0 &&
    (savedDefinition.metadata.regions?.length ?? 0) > 0 &&
    savedDefinition.points.length > 0

  if (!hasCalibrationTemplate) {
    return fallbackDefinition
  }

  return {
    ...savedDefinition,
    id: createDefinitionId(imageName),
    name: imageName ?? savedDefinition.name,
    imageSrc,
    imageWidth,
    imageHeight,
  }
}

function getPointSelection(definition: PartDefinition, pointId: string) {
  const point = getPartPointById(definition, pointId)

  return {
    regionId: point?.regionId,
    rowId: point?.rowId,
    columnId: point?.columnId,
  }
}

export function PartEditor({
  imageSrc,
  imageWidth,
  imageHeight,
  imageName,
  onReplaceImage,
}: PartEditorProps) {
  const savedDefinition = loadPartDefinition(createDefinitionId(imageName))
  const [definition, setDefinition] = useState<PartDefinition>(() =>
    normalizeDefinition(savedDefinition, imageSrc, imageWidth, imageHeight, imageName),
  )
  const [selectedRegionId, setSelectedRegionId] = useState(definition.metadata.regions?.[0]?.id ?? '')
  const [selectedScope, setSelectedScope] = useState<'region' | 'row' | 'column' | 'point'>('region')
  const [selectedRowId, setSelectedRowId] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState('')
  const [selectedPointId, setSelectedPointId] = useState('')
  const [moveAllRegions, setMoveAllRegions] = useState(!savedDefinition)
  const [showDebugPoints, setShowDebugPoints] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
    savedDefinition
      ? 'Restored your saved calibration for this board.'
      : 'Generated a standard breadboard template. Start with whole-board alignment, then fine-tune each region.',
  )

  useEffect(() => {
    savePartDefinition(definition)
  }, [definition])

  const effectiveSelectedRegionId =
    definition.metadata.regions?.some((region) => region.id === selectedRegionId)
      ? selectedRegionId
      : (definition.metadata.regions?.[0]?.id ?? '')
  const selectedRegion = effectiveSelectedRegionId
    ? getPartRegion(definition, effectiveSelectedRegionId)
    : undefined
  const effectiveSelectedRowId =
    selectedRegion?.rows.some((row) => row.id === selectedRowId)
      ? selectedRowId
      : (selectedRegion?.rows[0]?.id ?? '')
  const effectiveSelectedColumnId =
    selectedRegion?.columns.some((column) => column.id === selectedColumnId)
      ? selectedColumnId
      : (selectedRegion?.columns[0]?.id ?? '')
  const effectiveSelectedPointId =
    selectedRegion?.pointIds.includes(selectedPointId)
      ? selectedPointId
      : (selectedRegion?.pointIds[0] ?? '')

  const highlightedPointIds = useMemo(() => {
    if (!selectedRegion) {
      return []
    }

    if (selectedScope === 'point' && effectiveSelectedPointId) {
      return [effectiveSelectedPointId]
    }

    if (selectedScope === 'row' && effectiveSelectedRowId) {
      return selectedRegion.rows.find((row) => row.id === effectiveSelectedRowId)?.pointIds ?? []
    }

    if (selectedScope === 'column' && effectiveSelectedColumnId) {
      return selectedRegion.columns.find((column) => column.id === effectiveSelectedColumnId)?.pointIds ?? []
    }

    return selectedRegion.pointIds
  }, [effectiveSelectedColumnId, effectiveSelectedPointId, effectiveSelectedRowId, selectedRegion, selectedScope])

  function applyNudge(delta: Position) {
    setDefinition((currentDefinition) => {
      if (moveAllRegions) {
        return moveBreadboardAllRegions(currentDefinition, delta.x, delta.y)
      }

      if (!effectiveSelectedRegionId) {
        return currentDefinition
      }

      if (selectedScope === 'row' && effectiveSelectedRowId) {
        return moveBreadboardRow(currentDefinition, effectiveSelectedRegionId, effectiveSelectedRowId, delta.x, delta.y)
      }

      if (selectedScope === 'column' && effectiveSelectedColumnId) {
        return moveBreadboardColumn(currentDefinition, effectiveSelectedRegionId, effectiveSelectedColumnId, delta.x, delta.y)
      }

      if (selectedScope === 'point' && effectiveSelectedPointId) {
        return moveBreadboardPoint(currentDefinition, effectiveSelectedRegionId, effectiveSelectedPointId, delta.x, delta.y)
      }

      return moveBreadboardRegion(currentDefinition, effectiveSelectedRegionId, delta.x, delta.y)
    })
  }

  function handlePointPointerDown(pointId: string) {
    const selection = getPointSelection(definition, pointId)

    setSelectedRegionId(selection.regionId ?? '')
    setSelectedRowId(selection.rowId ?? '')
    setSelectedColumnId(selection.columnId ?? '')
    setSelectedPointId(pointId)
  }

  function handleRegionSelected(regionId: string) {
    setSelectedRegionId(regionId)
    setSelectedScope('region')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const isHorizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
    const isVertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'

    if (!isHorizontal && !isVertical) {
      return
    }

    if (!effectiveSelectedRegionId) {
      return
    }

    event.preventDefault()

    const stepSize = event.shiftKey ? 8 : 1

    applyNudge({
      x: (event.key === 'ArrowLeft' ? -stepSize : event.key === 'ArrowRight' ? stepSize : 0) / imageWidth,
      y: (event.key === 'ArrowUp' ? -stepSize : event.key === 'ArrowDown' ? stepSize : 0) / imageHeight,
    })
  }

  function handleDirectionButtonClick(horizontal: -1 | 0 | 1, vertical: -1 | 0 | 1, large = false) {
    const stepSize = large ? 8 : 1

    applyNudge({
      x: (horizontal * stepSize) / imageWidth,
      y: (vertical * stepSize) / imageHeight,
    })
  }

  function handleMoveAllRegionsToggle() {
    const nextValue = !moveAllRegions

    setMoveAllRegions(nextValue)

    if (nextValue) {
      setSelectedScope('region')
      setStatusMessage('Whole-board alignment is active. Drag anywhere on the overlay to move all regions together.')
      return
    }

    setStatusMessage('Whole-board alignment is off. Fine-tune the selected region, row, column, or point.')
  }

  function handleRegionDrag(regionId: string, delta: Position) {
    setSelectedScope('region')
    setSelectedRegionId(regionId)
    setDefinition((currentDefinition) =>
      moveAllRegions
        ? moveBreadboardAllRegions(currentDefinition, delta.x, delta.y)
        : moveBreadboardRegion(currentDefinition, regionId, delta.x, delta.y),
    )
  }

  function handleBoardDrag(delta: Position) {
    setSelectedScope('region')
    setDefinition((currentDefinition) => moveBreadboardAllRegions(currentDefinition, delta.x, delta.y))
  }

  function handleRowDrag(regionId: string, rowId: string, delta: Position) {
    setSelectedScope('row')
    setSelectedRegionId(regionId)
    setSelectedRowId(rowId)
    setDefinition((currentDefinition) => moveBreadboardRow(currentDefinition, regionId, rowId, delta.x, delta.y))
  }

  function handleColumnDrag(regionId: string, columnId: string, delta: Position) {
    setSelectedScope('column')
    setSelectedRegionId(regionId)
    setSelectedColumnId(columnId)
    setDefinition((currentDefinition) =>
      moveBreadboardColumn(currentDefinition, regionId, columnId, delta.x, delta.y),
    )
  }

  function handleAnchorDrag(
    regionId: string,
    anchorKey: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight',
    delta: Position,
  ) {
    setSelectedScope('region')
    setSelectedRegionId(regionId)
    setDefinition((currentDefinition) => {
      const region = getPartRegion(currentDefinition, regionId)

      if (!region) {
        return currentDefinition
      }

      return applyBreadboardRegionAnchors(
        currentDefinition,
        regionId,
        region.anchors.map((anchor) =>
          anchor.key === anchorKey
            ? {
                ...anchor,
                x: Math.min(1, Math.max(0, anchor.x + delta.x)),
                y: Math.min(1, Math.max(0, anchor.y + delta.y)),
              }
            : anchor,
        ),
      )
    })
  }

  function handlePointDrag(pointId: string, delta: Position) {
    setDefinition((currentDefinition) => {
      const selection = getPointSelection(currentDefinition, pointId)

      if (!selection.regionId) {
        return currentDefinition
      }

      return moveBreadboardPoint(currentDefinition, selection.regionId, pointId, delta.x, delta.y)
    })
  }

  function handleResetRegion() {
    if (!effectiveSelectedRegionId) {
      return
    }

    setDefinition((currentDefinition) => resetBreadboardRegion(currentDefinition, effectiveSelectedRegionId))
    setStatusMessage('Selected region reset to the default template anchors and offsets.')
  }

  function handleSaveDefinition() {
    savePartDefinition(definition)
    setStatusMessage('Aligned breadboard definition saved locally for this image.')
  }

  function handleRotateRegion(degrees: number) {
    if (!effectiveSelectedRegionId) {
      return
    }

    setDefinition((currentDefinition) =>
      rotateBreadboardRegion(currentDefinition, effectiveSelectedRegionId, degrees),
    )
    setStatusMessage(`Rotated ${selectedRegion?.name ?? 'selected region'} by ${degrees}°.`)
  }

  const selectedPoint = effectiveSelectedPointId
    ? getPartPointById(definition, effectiveSelectedPointId)
    : undefined

  return (
    <section className="part-editor" aria-label="Part editor" tabIndex={0} onKeyDown={handleKeyDown}>
      <aside className="part-editor__sidebar">
        <div className="part-editor__group">
          <p className="eyebrow">Calibration editor</p>
          <h3 className="part-editor__title">Breadboard alignment</h3>
          <p className="part-editor__copy">
            Drag the corner anchors to fit each breadboard region to the photo, then fine-tune by region,
            row, column, or individual point.
          </p>
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">Workflow</p>
          <div className="part-editor__toolbar">
            <button type="button" className="action-button" onClick={handleSaveDefinition}>
              Save aligned definition
            </button>
            <button type="button" className="ghost-button" onClick={handleResetRegion}>
              Reset selected region
            </button>
            <button type="button" className="ghost-button" onClick={onReplaceImage}>
              Replace image
            </button>
          </div>
        </div>

        <div className="part-editor__group">
          <label className="part-editor__label" htmlFor="region-select">
            Region
          </label>
          <select
            id="region-select"
            className="part-editor__select"
            value={effectiveSelectedRegionId}
            onChange={(event) => handleRegionSelected(event.target.value)}
          >
            {(definition.metadata.regions ?? []).map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
          <p className="part-editor__selection">
            {selectedRegion
              ? `${selectedRegion.name} • ${selectedRegion.rows.length} rows • ${selectedRegion.columns.length} columns`
              : 'No region selected.'}
          </p>
        </div>

        <div className="part-editor__group">
          <label className="part-editor__label" htmlFor="scope-select">
            Fine-tune target
          </label>
          <select
            id="scope-select"
            className="part-editor__select"
            value={selectedScope}
            onChange={(event) =>
              setSelectedScope(event.target.value as 'region' | 'row' | 'column' | 'point')
            }
          >
            <option value="region">Whole region</option>
            <option value="row">Single row</option>
            <option value="column">Single column</option>
            <option value="point">Single point</option>
          </select>
          <div className="part-editor__toolbar">
            <button
              type="button"
              className={`ghost-button${moveAllRegions ? ' ghost-button--active' : ''}`}
              onClick={handleMoveAllRegionsToggle}
            >
              {moveAllRegions ? 'Moving all regions together' : 'Move all regions together'}
            </button>
          </div>
          <p className="part-editor__hint">
            Start with whole-board alignment, then switch this off for per-region fine tuning.
          </p>
          {selectedScope === 'row' ? (
            <select
              className="part-editor__select"
              aria-label="Row selection"
              value={effectiveSelectedRowId}
              onChange={(event) => setSelectedRowId(event.target.value)}
            >
              {selectedRegion?.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          ) : null}
          {selectedScope === 'column' ? (
            <select
              className="part-editor__select"
              aria-label="Column selection"
              value={effectiveSelectedColumnId}
              onChange={(event) => setSelectedColumnId(event.target.value)}
            >
              {selectedRegion?.columns.map((column) => (
                <option key={column.id} value={column.id}>
                  Column {column.label}
                </option>
              ))}
            </select>
          ) : null}
          {selectedScope === 'point' ? (
            <select
              className="part-editor__select"
              aria-label="Point selection"
              value={effectiveSelectedPointId}
              onChange={(event) => setSelectedPointId(event.target.value)}
            >
              {selectedRegion?.pointIds.map((pointId) => {
                const point = getPartPointById(definition, pointId)

                return (
                  <option key={pointId} value={pointId}>
                    {point?.label ?? pointId}
                  </option>
                )
              })}
            </select>
          ) : null}
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">View</p>
          <div className="part-editor__toolbar">
            <button
              type="button"
              className={`ghost-button${showDebugPoints ? ' ghost-button--active' : ''}`}
              onClick={() => setShowDebugPoints((currentValue) => !currentValue)}
            >
              {showDebugPoints ? 'Hide debug points' : 'Show debug points'}
            </button>
            <button
              type="button"
              className={`ghost-button${showLabels ? ' ghost-button--active' : ''}`}
              onClick={() => setShowLabels((currentValue) => !currentValue)}
            >
              {showLabels ? 'Hide labels' : 'Show labels'}
            </button>
          </div>
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">Nudge</p>
          <p className="part-editor__hint">Arrow keys move the selection by 1 px. Hold Shift for 8 px.</p>
          <div className="part-editor__nudge-grid" aria-label="Nudge controls">
            <button type="button" className="ghost-button" onClick={() => handleDirectionButtonClick(0, -1)}>
              Up
            </button>
            <button type="button" className="ghost-button" onClick={() => handleDirectionButtonClick(-1, 0)}>
              Left
            </button>
            <button type="button" className="ghost-button" onClick={() => handleDirectionButtonClick(1, 0)}>
              Right
            </button>
            <button type="button" className="ghost-button" onClick={() => handleDirectionButtonClick(0, 1)}>
              Down
            </button>
            <button type="button" className="ghost-button" onClick={() => handleDirectionButtonClick(0, -1, true)}>
              Shift Up
            </button>
            <button type="button" className="ghost-button" onClick={() => handleDirectionButtonClick(-1, 0, true)}>
              Shift Left
            </button>
            <button type="button" className="ghost-button" onClick={() => handleDirectionButtonClick(1, 0, true)}>
              Shift Right
            </button>
            <button type="button" className="ghost-button" onClick={() => handleDirectionButtonClick(0, 1, true)}>
              Shift Down
            </button>
          </div>
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">Rotate overlay</p>
          <p className="part-editor__hint">Rotate the selected region without moving the image.</p>
          <div className="part-editor__toolbar">
            <button type="button" className="ghost-button" onClick={() => handleRotateRegion(-1)}>
              Rotate -1°
            </button>
            <button type="button" className="ghost-button" onClick={() => handleRotateRegion(1)}>
              Rotate +1°
            </button>
            <button type="button" className="ghost-button" onClick={() => handleRotateRegion(-5)}>
              Rotate -5°
            </button>
            <button type="button" className="ghost-button" onClick={() => handleRotateRegion(5)}>
              Rotate +5°
            </button>
          </div>
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">Selection</p>
          <p className="part-editor__hint">
            {selectedScope === 'point' && selectedPoint
              ? `Selected point ${selectedPoint.label}`
              : selectedScope === 'column' && effectiveSelectedColumnId
                ? `Selected column ${effectiveSelectedColumnId}`
                : selectedScope === 'row' && effectiveSelectedRowId
                  ? `Selected row ${effectiveSelectedRowId}`
                  : selectedRegion?.name ?? 'No selection'}
          </p>
        </div>

        <p className="part-editor__status">{statusMessage}</p>
      </aside>

      <div className="part-editor__canvas-shell">
        <PartCanvas
          definition={definition}
          showPoints={showDebugPoints}
          showLabels={showLabels}
          interactionMode={selectedScope}
          moveAllRegions={moveAllRegions}
          highlightedPointIds={highlightedPointIds}
          selectedRegionId={effectiveSelectedRegionId}
          selectedRowId={selectedScope === 'row' ? effectiveSelectedRowId : undefined}
          selectedColumnId={selectedScope === 'column' ? effectiveSelectedColumnId : undefined}
          selectedPointId={selectedScope === 'point' ? effectiveSelectedPointId : undefined}
          onPointPointerDown={handlePointPointerDown}
          onPointDrag={handlePointDrag}
          onRowDrag={handleRowDrag}
          onColumnDrag={handleColumnDrag}
          onRegionPointerDown={handleRegionSelected}
          onRegionDrag={handleRegionDrag}
          onBoardDrag={handleBoardDrag}
          onAnchorDrag={handleAnchorDrag}
        />
      </div>
    </section>
  )
}
