import { useEffect, useRef, useState } from 'react'

import type { PartDefinition } from '../lib/parts'

type NormalizedPosition = {
  x: number
  y: number
}

type PartCanvasProps = {
  definition: PartDefinition
  zoom?: number
  showPoints?: boolean
  showLabels?: boolean
  highlightedPointIds?: string[]
  onPointPointerDown?: (pointId: string) => void
  onPointDrag?: (pointId: string, delta: NormalizedPosition) => void
  onCanvasPointerDown?: (position: NormalizedPosition) => void
}

type PartCanvasLayout = {
  boundingWidth: number
  boundingHeight: number
  contentWidth: number
  contentHeight: number
}

export function PartCanvas({
  definition,
  zoom = 1,
  showPoints = true,
  showLabels = false,
  highlightedPointIds = [],
  onPointPointerDown,
  onPointDrag,
  onCanvasPointerDown,
}: PartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | undefined>(undefined)
  const dragStateRef = useRef<{
    pointId: string
    lastPosition: NormalizedPosition
    pointerId: number
  }>()
  const [layout, setLayout] = useState<PartCanvasLayout>()
  const highlightedPointIdSet = new Set(highlightedPointIds)

  function getNormalizedPosition(
    event: Pick<PointerEvent, 'clientX' | 'clientY'> | React.PointerEvent<SVGElement>,
  ) {
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

    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  useEffect(() => {
    function updateLayout() {
      const containerElement = containerRef.current
      const { imageWidth, imageHeight } = definition

      const availableWidth = containerElement?.clientWidth ?? 0
      const availableHeight = containerElement?.clientHeight ?? 0

      if (!availableWidth || !availableHeight) {
        setLayout({
          boundingWidth: imageWidth * zoom,
          boundingHeight: imageHeight * zoom,
          contentWidth: imageWidth * zoom,
          contentHeight: imageHeight * zoom,
        })
        return
      }

      const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight) * zoom

      setLayout({
        boundingWidth: imageWidth * scale,
        boundingHeight: imageHeight * scale,
        contentWidth: imageWidth * scale,
        contentHeight: imageHeight * scale,
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

      onPointDrag?.(dragState.pointId, {
        x: nextPosition.x - dragState.lastPosition.x,
        y: nextPosition.y - dragState.lastPosition.y,
      })

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
  }, [onPointDrag])

  function handlePointPointerDown(
    event: React.PointerEvent<SVGCircleElement>,
    pointId: string,
  ) {
    const nextPosition = getNormalizedPosition(event)

    dragStateRef.current = {
      pointId,
      lastPosition: nextPosition,
      pointerId: event.pointerId,
    }

    onPointPointerDown?.(pointId)
  }

  function handleCanvasPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) {
      return
    }

    onCanvasPointerDown?.(getNormalizedPosition(event))
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
            className="part-canvas__content"
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
              onPointerDown={handleCanvasPointerDown}
            >
              <rect
                width={definition.imageWidth}
                height={definition.imageHeight}
                fill="transparent"
              />
              {definition.points.map((point) => {
                const pointX = point.x * definition.imageWidth
                const pointY = point.y * definition.imageHeight
                const isHighlighted = highlightedPointIdSet.has(point.id)
                const isVisible = showPoints || isHighlighted

                return (
                  <g key={point.id} data-point-id={point.id}>
                    <circle
                      className={`part-canvas__point${isVisible ? ' part-canvas__point--visible' : ''}${isHighlighted ? ' part-canvas__point--selected' : ''}`}
                      cx={pointX}
                      cy={pointY}
                      r={isHighlighted ? 7 : 4.5}
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
                      <text
                        className="part-canvas__label"
                        x={pointX + 7}
                        y={pointY - 7}
                      >
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
