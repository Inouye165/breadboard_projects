import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { PartDefinition, PartRegionAnchor } from '../lib/parts'

type NormalizedPosition = {
  x: number
  y: number
}

type AnchorKey = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

type InteractionMode = 'region' | 'row' | 'column' | 'point'

type PartCanvasProps = {
  definition: PartDefinition
  zoom?: number
  showPoints?: boolean
  showLabels?: boolean
  interactionMode?: InteractionMode
  moveAllRegions?: boolean
  highlightedPointIds?: string[]
  selectedRegionId?: string
  selectedRowId?: string
  selectedColumnId?: string
  selectedPointId?: string
  onPointPointerDown?: (pointId: string) => void
  onPointDrag?: (pointId: string, delta: NormalizedPosition) => void
  onRowDrag?: (regionId: string, rowId: string, delta: NormalizedPosition) => void
  onColumnDrag?: (regionId: string, columnId: string, delta: NormalizedPosition) => void
  onRegionPointerDown?: (regionId: string) => void
  onRegionDrag?: (regionId: string, delta: NormalizedPosition) => void
  onBoardDrag?: (delta: NormalizedPosition) => void
  onAnchorDrag?: (regionId: string, anchorKey: AnchorKey, delta: NormalizedPosition) => void
}

type PartCanvasLayout = {
  boundingWidth: number
  boundingHeight: number
  contentWidth: number
  contentHeight: number
  rotationDegrees: 0 | 90 | 180 | 270
}

type DragState = {
  kind: 'point' | 'row' | 'column' | 'region' | 'anchor' | 'board'
  pointId?: string
  regionId?: string
  rowId?: string
  columnId?: string
  anchorKey?: AnchorKey
  lastPosition: NormalizedPosition
  pointerId: number
}

function getOrderedRegionAnchors(anchors: PartRegionAnchor[]) {
  const anchorMap = new Map(anchors.map((anchor) => [anchor.key, anchor]))

  return [
    anchorMap.get('topLeft'),
    anchorMap.get('topRight'),
    anchorMap.get('bottomRight'),
    anchorMap.get('bottomLeft'),
  ].filter((anchor): anchor is NonNullable<typeof anchor> => Boolean(anchor))
}

function getDisplayRotationDegrees(definition: PartDefinition): 0 | 90 | 180 | 270 {
  return definition.metadata.displayRotationDegrees ?? 0
}

export function PartCanvas({
  definition,
  zoom = 1,
  showPoints = true,
  showLabels = false,
  interactionMode = 'region',
  moveAllRegions = false,
  highlightedPointIds = [],
  selectedRegionId,
  selectedRowId,
  selectedColumnId,
  selectedPointId,
  onPointPointerDown,
  onPointDrag,
  onRowDrag,
  onColumnDrag,
  onRegionPointerDown,
  onRegionDrag,
  onBoardDrag,
  onAnchorDrag,
}: PartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [layout, setLayout] = useState<PartCanvasLayout | null>(null)
  const highlightedPointIdSet = useMemo(() => new Set(highlightedPointIds), [highlightedPointIds])
  const pointMap = useMemo(() => new Map(definition.points.map((point) => [point.id, point])), [definition.points])

  const getNormalizedPosition = useCallback((
    event: Pick<PointerEvent, 'clientX' | 'clientY'> | React.PointerEvent<SVGElement>,
  ) => {
    const contentElement = contentRef.current

    if (!contentElement) {
      return {
        x: 0,
        y: 0,
      }
    }

    const bounds = contentElement.getBoundingClientRect()

    if (!bounds.width || !bounds.height) {
      return {
        x: 0,
        y: 0,
      }
    }

    const normalizedDisplayPosition = {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    }

    if (layout?.rotationDegrees === 90) {
      return {
        x: normalizedDisplayPosition.y,
        y: 1 - normalizedDisplayPosition.x,
      }
    }

    if (layout?.rotationDegrees === 180) {
      return {
        x: 1 - normalizedDisplayPosition.x,
        y: 1 - normalizedDisplayPosition.y,
      }
    }

    if (layout?.rotationDegrees === 270) {
      return {
        x: 1 - normalizedDisplayPosition.y,
        y: normalizedDisplayPosition.x,
      }
    }

    return {
      x: normalizedDisplayPosition.x,
      y: normalizedDisplayPosition.y,
    }
  }, [layout?.rotationDegrees])

  useEffect(() => {
    function updateLayout() {
      const containerElement = containerRef.current
      const { imageWidth, imageHeight } = definition
      const rotationDegrees = getDisplayRotationDegrees(definition)
      const isRotated = rotationDegrees === 90 || rotationDegrees === 270
      const displayWidth = isRotated ? imageHeight : imageWidth
      const displayHeight = isRotated ? imageWidth : imageHeight

      const availableWidth = containerElement?.clientWidth ?? 0
      const availableHeight = containerElement?.clientHeight ?? 0

      if (!availableWidth || !availableHeight) {
        setLayout({
          boundingWidth: displayWidth * zoom,
          boundingHeight: displayHeight * zoom,
          contentWidth: imageWidth * zoom,
          contentHeight: imageHeight * zoom,
          rotationDegrees,
        })
        return
      }

      const scale = Math.min(availableWidth / displayWidth, availableHeight / displayHeight) * zoom

      setLayout({
        boundingWidth: displayWidth * scale,
        boundingHeight: displayHeight * scale,
        contentWidth: imageWidth * scale,
        contentHeight: imageHeight * scale,
        rotationDegrees,
      })
    }

    updateLayout()

    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = new ResizeObserver(() => {
      updateLayout()
    })

    if (containerRef.current) {
      resizeObserverRef.current.observe(containerRef.current)
    }

    return () => {
      resizeObserverRef.current?.disconnect()
    }
  }, [definition, zoom])

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current

      if (!dragState) {
        return
      }

      const nextPosition = getNormalizedPosition(event)
      const delta = {
        x: nextPosition.x - dragState.lastPosition.x,
        y: nextPosition.y - dragState.lastPosition.y,
      }

      if (dragState.kind === 'point' && dragState.pointId) {
        onPointDrag?.(dragState.pointId, delta)
      }

      if (dragState.kind === 'row' && dragState.regionId && dragState.rowId) {
        onRowDrag?.(dragState.regionId, dragState.rowId, delta)
      }

      if (dragState.kind === 'column' && dragState.regionId && dragState.columnId) {
        onColumnDrag?.(dragState.regionId, dragState.columnId, delta)
      }

      if (dragState.kind === 'region' && dragState.regionId) {
        onRegionDrag?.(dragState.regionId, delta)
      }

      if (dragState.kind === 'board') {
        onBoardDrag?.(delta)
      }

      if (dragState.kind === 'anchor' && dragState.regionId && dragState.anchorKey) {
        onAnchorDrag?.(dragState.regionId, dragState.anchorKey, delta)
      }

      dragStateRef.current = {
        ...dragState,
        lastPosition: nextPosition,
      }
    }

    function handleWindowPointerUp(event: PointerEvent) {
      if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
        return
      }

      dragStateRef.current = null
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', handleWindowPointerUp)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp)
    }
  }, [getNormalizedPosition, onAnchorDrag, onBoardDrag, onColumnDrag, onPointDrag, onRegionDrag, onRowDrag])

  function handlePointPointerDown(
    event: React.PointerEvent<SVGCircleElement>,
    pointId: string,
  ) {
    const point = pointMap.get(pointId)
    const nextPosition = getNormalizedPosition(event)

    if (!point) {
      return
    }

    if (moveAllRegions) {
      dragStateRef.current = {
        kind: 'board',
        lastPosition: nextPosition,
        pointerId: event.pointerId,
      }

      onPointPointerDown?.(pointId)
      return
    }

    if (interactionMode === 'region' && point.regionId) {
      dragStateRef.current = {
        kind: 'region',
        regionId: point.regionId,
        lastPosition: nextPosition,
        pointerId: event.pointerId,
      }

      onPointPointerDown?.(pointId)
      return
    }

    if (interactionMode === 'row' && point.regionId && point.rowId) {
      dragStateRef.current = {
        kind: 'row',
        regionId: point.regionId,
        rowId: point.rowId,
        lastPosition: nextPosition,
        pointerId: event.pointerId,
      }

      onPointPointerDown?.(pointId)
      return
    }

    if (interactionMode === 'column' && point.regionId && point.columnId) {
      dragStateRef.current = {
        kind: 'column',
        regionId: point.regionId,
        columnId: point.columnId,
        lastPosition: nextPosition,
        pointerId: event.pointerId,
      }

      onPointPointerDown?.(pointId)
      return
    }

    dragStateRef.current = {
      kind: 'point',
      pointId,
      lastPosition: nextPosition,
      pointerId: event.pointerId,
    }

    onPointPointerDown?.(pointId)
  }

  function handleRegionPointerDown(
    event: React.PointerEvent<SVGPolygonElement>,
    regionId: string,
  ) {
    dragStateRef.current = {
      kind: moveAllRegions ? 'board' : 'region',
      regionId: moveAllRegions ? undefined : regionId,
      lastPosition: getNormalizedPosition(event),
      pointerId: event.pointerId,
    }

    onRegionPointerDown?.(regionId)
  }

  function handleAnchorPointerDown(
    event: React.PointerEvent<SVGCircleElement>,
    regionId: string,
    anchorKey: AnchorKey,
  ) {
    dragStateRef.current = {
      kind: 'anchor',
      regionId,
      anchorKey,
      lastPosition: getNormalizedPosition(event),
      pointerId: event.pointerId,
    }

    onRegionPointerDown?.(regionId)
  }

  function handleBoardPointerDown(event: React.PointerEvent<SVGRectElement>) {
    if (!moveAllRegions) {
      return
    }

    dragStateRef.current = {
      kind: 'board',
      lastPosition: getNormalizedPosition(event),
      pointerId: event.pointerId,
    }
  }

  return (
    <div ref={containerRef} className="part-canvas" aria-label={`${definition.name} canvas`}>
      {layout ? (
        <div
          className="part-canvas__bounding-box"
          style={{
            width: `${layout.boundingWidth}px`,
            height: `${layout.boundingHeight}px`,
          }}
        >
          <div
            ref={contentRef}
            data-testid="part-canvas-content"
            className={`part-canvas__content${layout.rotationDegrees === 90 || layout.rotationDegrees === 270 ? ' part-canvas__content--rotated' : ''}`}
            style={{
              width: `${layout.contentWidth}px`,
              height: `${layout.contentHeight}px`,
              transform: layout.rotationDegrees === 180
                ? 'rotate(180deg)'
                : layout.rotationDegrees === 90 || layout.rotationDegrees === 270
                  ? `translate(-50%, -50%) rotate(${layout.rotationDegrees}deg)`
                  : undefined,
            }}
          >
            <img
              className="part-canvas__image"
              src={definition.imageSrc}
              alt={definition.name}
              width={definition.imageWidth}
              height={definition.imageHeight}
            />
            <svg
              className="part-canvas__overlay"
              viewBox={`0 0 ${definition.imageWidth} ${definition.imageHeight}`}
              aria-label={`${definition.name} connection points overlay`}
            >
              <rect
                className={moveAllRegions ? 'part-canvas__board-hit part-canvas__board-hit--active' : 'part-canvas__board-hit'}
                width={definition.imageWidth}
                height={definition.imageHeight}
                fill="transparent"
                onPointerDown={handleBoardPointerDown}
              />
              {(definition.metadata.regions ?? []).map((region) => {
                const polygonPoints = getOrderedRegionAnchors(region.anchors)
                  .map((anchor) => `${anchor.x * definition.imageWidth},${anchor.y * definition.imageHeight}`)
                  .join(' ')
                const isSelectedRegion = region.id === selectedRegionId
                const selectedRow = region.rows.find((row) => row.id === selectedRowId)
                const selectedColumn = region.columns.find((column) => column.id === selectedColumnId)
                const rowGuidePoints = selectedRow?.pointIds
                  .map((pointId) => {
                    const point = pointMap.get(pointId)

                    return point ? `${point.x * definition.imageWidth},${point.y * definition.imageHeight}` : undefined
                  })
                  .filter((value): value is string => Boolean(value))
                  .join(' ')
                const columnGuidePoints = selectedColumn?.pointIds
                  .map((pointId) => {
                    const point = pointMap.get(pointId)

                    return point ? `${point.x * definition.imageWidth},${point.y * definition.imageHeight}` : undefined
                  })
                  .filter((value): value is string => Boolean(value))
                  .join(' ')

                return (
                  <g key={region.id} data-region-id={region.id}>
                    <polygon
                      className={`part-canvas__region${isSelectedRegion ? ' part-canvas__region--selected' : ''}`}
                      points={polygonPoints}
                    />
                    <polygon
                      className="part-canvas__region-hit"
                      points={polygonPoints}
                      role="button"
                      tabIndex={0}
                      aria-label={`${region.name} region`}
                      onPointerDown={(event) => handleRegionPointerDown(event, region.id)}
                    />
                    {isSelectedRegion && rowGuidePoints ? (
                      <polyline className="part-canvas__guide part-canvas__guide--row" points={rowGuidePoints} />
                    ) : null}
                    {isSelectedRegion && columnGuidePoints ? (
                      <polyline className="part-canvas__guide part-canvas__guide--column" points={columnGuidePoints} />
                    ) : null}
                    {region.anchors.map((anchor) => (
                      <g key={`${region.id}:${anchor.key}`}>
                        <circle
                          className={`part-canvas__anchor${isSelectedRegion ? ' part-canvas__anchor--selected' : ''}`}
                          cx={anchor.x * definition.imageWidth}
                          cy={anchor.y * definition.imageHeight}
                          r={isSelectedRegion ? 8 : 6}
                        />
                        <circle
                          className="part-canvas__anchor-hit"
                          cx={anchor.x * definition.imageWidth}
                          cy={anchor.y * definition.imageHeight}
                          r={16}
                          role="button"
                          tabIndex={0}
                          aria-label={`${region.name} ${anchor.label} anchor`}
                          onPointerDown={(event) => handleAnchorPointerDown(event, region.id, anchor.key)}
                        />
                      </g>
                    ))}
                  </g>
                )
              })}
              {definition.points.map((point) => {
                const pointX = point.x * definition.imageWidth
                const pointY = point.y * definition.imageHeight
                const isHighlighted = highlightedPointIdSet.has(point.id)
                const isSelected = point.id === selectedPointId
                const isVisible = showPoints || isHighlighted || isSelected
                const pointClassName = [
                  'part-canvas__point',
                  isVisible ? 'part-canvas__point--visible' : '',
                  showPoints ? 'part-canvas__point--debug' : '',
                  isHighlighted ? 'part-canvas__point--highlighted' : '',
                  isSelected ? 'part-canvas__point--selected' : '',
                ].filter(Boolean).join(' ')
                const pointRadius = isSelected ? 5 : isHighlighted ? 4 : 2.5

                return (
                  <g key={point.id} data-point-id={point.id}>
                    <circle
                      className={pointClassName}
                      cx={pointX}
                      cy={pointY}
                      r={pointRadius}
                    />
                    <circle
                      className="part-canvas__point-hit"
                      cx={pointX}
                      cy={pointY}
                      r={12}
                      role="button"
                      tabIndex={0}
                      aria-label={`Connection point ${point.label}`}
                      onPointerDown={(event) => handlePointPointerDown(event, point.id)}
                    />
                    {showLabels ? (
                      <text className="part-canvas__label" x={pointX + 7} y={pointY - 7}>
                        {point.label}
                      </text>
                    ) : null}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      ) : null}
    </div>
  )
}
