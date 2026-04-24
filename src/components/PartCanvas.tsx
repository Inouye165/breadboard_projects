import { useCallback, useEffect, useRef, useState } from 'react'

import type { PartDefinition } from '../lib/parts'

type NormalizedPosition = {
  x: number
  y: number
}

type AnchorKey = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

type PartCanvasProps = {
  definition: PartDefinition
  zoom?: number
  showPoints?: boolean
  showLabels?: boolean
  highlightedPointIds?: string[]
  selectedRegionId?: string
  selectedRowId?: string
  selectedColumnId?: string
  selectedPointId?: string
  onPointPointerDown?: (pointId: string) => void
  onPointDrag?: (pointId: string, delta: NormalizedPosition) => void
  onRegionPointerDown?: (regionId: string) => void
  onRegionDrag?: (regionId: string, delta: NormalizedPosition) => void
  onAnchorDrag?: (regionId: string, anchorKey: AnchorKey, delta: NormalizedPosition) => void
}

type PartCanvasLayout = {
  boundingWidth: number
  boundingHeight: number
  contentWidth: number
  contentHeight: number
  isRotated: boolean
}

export function PartCanvas({
  definition,
  zoom = 1,
  showPoints = true,
  showLabels = false,
  highlightedPointIds = [],
  selectedRegionId,
  selectedRowId,
  selectedColumnId,
  selectedPointId,
  onPointPointerDown,
  onPointDrag,
  onRegionPointerDown,
  onRegionDrag,
  onAnchorDrag,
}: PartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | undefined>(undefined)
  const dragStateRef = useRef<{
    kind: 'point' | 'region' | 'anchor'
    pointId?: string
    regionId?: string
    anchorKey?: AnchorKey
    lastPosition: NormalizedPosition
    pointerId: number
  }>()
  const [layout, setLayout] = useState<PartCanvasLayout>()
  const highlightedPointIdSet = new Set(highlightedPointIds)
  const pointMap = new Map(definition.points.map((point) => [point.id, point]))

  const getNormalizedPosition = useCallback((
    event: Pick<PointerEvent, 'clientX' | 'clientY'> | React.PointerEvent<SVGElement>,
  ) => {
    const containerElement = containerRef.current

    if (!containerElement) {
      return {
        x: 0,
        y: 0,
      }
    }

    const bounds = containerElement.getBoundingClientRect()

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

    if (layout?.isRotated) {
      return {
        x: normalizedDisplayPosition.y,
        y: 1 - normalizedDisplayPosition.x,
      }
    }

    return {
      x: normalizedDisplayPosition.x,
      y: normalizedDisplayPosition.y,
    }
  }, [layout?.isRotated])

  useEffect(() => {
    function updateLayout() {
      const containerElement = containerRef.current
      const { imageWidth, imageHeight } = definition
      const isRotated = imageHeight > imageWidth
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
          isRotated,
        })
        return
      }

      const scale = Math.min(availableWidth / displayWidth, availableHeight / displayHeight) * zoom

      setLayout({
        boundingWidth: displayWidth * scale,
        boundingHeight: displayHeight * scale,
        contentWidth: imageWidth * scale,
        contentHeight: imageHeight * scale,
        isRotated,
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

      if (dragState.kind === 'region' && dragState.regionId) {
        onRegionDrag?.(dragState.regionId, delta)
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

      dragStateRef.current = undefined
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', handleWindowPointerUp)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp)
    }
  }, [getNormalizedPosition, onAnchorDrag, onPointDrag, onRegionDrag])

  function handlePointPointerDown(
    event: React.PointerEvent<SVGCircleElement>,
    pointId: string,
  ) {
    dragStateRef.current = {
      kind: 'point',
      pointId,
      lastPosition: getNormalizedPosition(event),
      pointerId: event.pointerId,
    }

    onPointPointerDown?.(pointId)
  }

  function handleRegionPointerDown(
    event: React.PointerEvent<SVGPolygonElement>,
    regionId: string,
  ) {
    dragStateRef.current = {
      kind: 'region',
      regionId,
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
            className={`part-canvas__content${layout.isRotated ? ' part-canvas__content--rotated' : ''}`}
            style={{
              width: `${layout.contentWidth}px`,
              height: `${layout.contentHeight}px`,
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
              <rect width={definition.imageWidth} height={definition.imageHeight} fill="transparent" />
              {(definition.metadata.regions ?? []).map((region) => {
                const polygonPoints = region.anchors
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

                return (
                  <g key={point.id} data-point-id={point.id}>
                    <circle
                      className={`part-canvas__point${isVisible ? ' part-canvas__point--visible' : ''}${isHighlighted || isSelected ? ' part-canvas__point--selected' : ''}`}
                      cx={pointX}
                      cy={pointY}
                      r={isHighlighted || isSelected ? 7 : 5}
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
