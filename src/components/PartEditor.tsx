import { useEffect, useMemo, useState } from 'react'

import { PartCanvas } from './PartCanvas'
import {
  addBreadboardGridGroup,
  createEmptyBreadboardPartDefinition,
  moveBreadboardRegion,
  parseGridSize,
} from '../lib/breadboardPartDefinitions'
import { loadPartDefinition, savePartDefinition } from '../lib/partDefinitionStorage'
import { getPartRegion, type PartDefinition } from '../lib/parts'

type PartEditorProps = {
  imageSrc: string
  imageWidth: number
  imageHeight: number
  imageName?: string
  onReplaceImage: () => void
}

type Position = {
  x: number
  y: number
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
  return createEmptyBreadboardPartDefinition({
    id: createDefinitionId(imageName),
    name: imageName ?? 'Breadboard',
    imageSrc,
    imageWidth,
    imageHeight,
  })
}

function getGroupSelection(definition: PartDefinition, pointId: string) {
  const region = definition.metadata.regions?.find((entry) => entry.pointIds.includes(pointId))

  return {
    regionId: region?.id,
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
    savedDefinition
      ? {
          ...savedDefinition,
          id: createDefinitionId(imageName),
          name: imageName ?? savedDefinition.name,
          imageSrc,
          imageWidth,
          imageHeight,
        }
      : createInitialDefinition(imageSrc, imageWidth, imageHeight, imageName),
  )
  const [gridSize, setGridSize] = useState('2x10')
  const [selectedRegionId, setSelectedRegionId] = useState(definition.metadata.regions?.[0]?.id ?? '')
  const [placementStage, setPlacementStage] = useState<'idle' | 'pick-top-left' | 'pick-bottom-right'>('idle')
  const [pendingTopLeft, setPendingTopLeft] = useState<Position>()
  const [statusMessage, setStatusMessage] = useState(
    savedDefinition
      ? 'Restored your saved points for this board.'
      : 'Clean slate. Start by adding a point group.',
  )

  useEffect(() => {
    savePartDefinition(definition)
  }, [definition])

  const selectedRegion = selectedRegionId ? getPartRegion(definition, selectedRegionId) : undefined
  const highlightedPointIds = useMemo(() => selectedRegion?.pointIds ?? [], [selectedRegion])

  function applyMovement(pointId: string, delta: Position) {
    setDefinition((currentDefinition) => {
      const selection = getGroupSelection(currentDefinition, pointId)

      if (!selection.regionId) {
        return currentDefinition
      }

      return moveBreadboardRegion(currentDefinition, selection.regionId, delta.x, delta.y)
    })
  }

  function handlePointPointerDown(pointId: string) {
    const selection = getGroupSelection(definition, pointId)
    setSelectedRegionId(selection.regionId ?? '')
  }

  function handleCanvasPointerDown(position: Position) {
    if (placementStage === 'pick-top-left') {
      setPendingTopLeft(position)
      setPlacementStage('pick-bottom-right')
      setStatusMessage('Top-left captured. Click the bottom-right corner for this group.')
      return
    }

    if (placementStage === 'pick-bottom-right' && pendingTopLeft) {
      const parsedGridSize = parseGridSize(gridSize)

      if (!parsedGridSize) {
        setPlacementStage('idle')
        setPendingTopLeft(undefined)
        setStatusMessage('Use a grid size like 2x10 or 7 by 60 before placing points.')
        return
      }

      const nextGroupIndex = (definition.metadata.regions?.length ?? 0) + 1
      const nextGroupId = `group-${nextGroupIndex}`
      const nextGroupLabel = `Group ${nextGroupIndex}`

      setDefinition((currentDefinition) =>
        addBreadboardGridGroup(currentDefinition, {
          groupId: nextGroupId,
          label: nextGroupLabel,
          rows: parsedGridSize.rows,
          columns: parsedGridSize.columns,
          topLeft: pendingTopLeft,
          bottomRight: position,
        }),
      )
      setSelectedRegionId(nextGroupId)
      setPendingTopLeft(undefined)
      setPlacementStage('idle')
      setStatusMessage(`Placed ${nextGroupLabel} with a ${parsedGridSize.rows}x${parsedGridSize.columns} grid.`)
    }
  }

  function handleStartGroupPlacement() {
    const parsedGridSize = parseGridSize(gridSize)

    if (!parsedGridSize) {
      setStatusMessage('Use a grid size like 2x10 or 7 by 60.')
      return
    }

    setPlacementStage('pick-top-left')
    setPendingTopLeft(undefined)
    setStatusMessage('Click the top-left corner for the new point group.')
  }

  function handleClearBoard() {
    setDefinition(createInitialDefinition(imageSrc, imageWidth, imageHeight, imageName))
    setSelectedRegionId('')
    setPendingTopLeft(undefined)
    setPlacementStage('idle')
    setStatusMessage('Board cleared. Changes are saved automatically.')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const isHorizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
    const isVertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'

    if (!isHorizontal && !isVertical) {
      return
    }

    const pointId = selectedRegion?.pointIds[0]

    if (!pointId) {
      return
    }

    event.preventDefault()

    const stepX = (event.shiftKey ? 10 : 1) / imageWidth
    const stepY = (event.shiftKey ? 10 : 1) / imageHeight

    applyMovement(pointId, {
      x: event.key === 'ArrowLeft' ? -stepX : event.key === 'ArrowRight' ? stepX : 0,
      y: event.key === 'ArrowUp' ? -stepY : event.key === 'ArrowDown' ? stepY : 0,
    })
  }

  return (
    <section className="part-editor" aria-label="Part editor" tabIndex={0} onKeyDown={handleKeyDown}>
      <aside className="part-editor__sidebar">
        <div className="part-editor__group">
          <p className="eyebrow">Editor</p>
          <h3 className="part-editor__title">Point groups</h3>
          <p className="part-editor__copy">
            Start with no points. Add one group at a time by choosing the top-left and
            bottom-right corners, then move the whole group with the mouse or arrow keys.
          </p>
        </div>

        <div className="part-editor__group">
          <label className="part-editor__label" htmlFor="grid-size-input">
            Grid size
          </label>
          <input
            id="grid-size-input"
            className="part-editor__input"
            value={gridSize}
            onChange={(event) => setGridSize(event.target.value)}
            placeholder="2x10"
          />
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">Workflow</p>
          <div className="part-editor__toolbar">
            <button type="button" className="action-button" onClick={handleStartGroupPlacement}>
              {placementStage === 'idle' ? 'Add point group' : 'Pick corners'}
            </button>
            <button type="button" className="ghost-button" onClick={handleClearBoard}>
              Clear board
            </button>
          </div>
          <button type="button" className="ghost-button" onClick={onReplaceImage}>
            Replace image
          </button>
        </div>

        <div className="part-editor__group">
          <p className="part-editor__label">Selected group</p>
          {selectedRegion ? (
            <p className="part-editor__selection">
              {selectedRegion.name} • {selectedRegion.rows.length}x{selectedRegion.columns.length}
            </p>
          ) : (
            <p className="part-editor__hint">No group selected yet.</p>
          )}
        </div>

        <p className="part-editor__status">{statusMessage} Autosaved.</p>
      </aside>

      <div className="part-editor__canvas-shell">
        <PartCanvas
          definition={definition}
          showPoints
          highlightedPointIds={highlightedPointIds}
          onPointPointerDown={handlePointPointerDown}
          onPointDrag={applyMovement}
          onCanvasPointerDown={handleCanvasPointerDown}
        />
      </div>
    </section>
  )
}