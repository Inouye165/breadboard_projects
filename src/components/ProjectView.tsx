import { useMemo } from 'react'

import type { BreadboardDefinition, ConnectionPoint } from '../lib/breadboardDefinitionModel'
import type {
  BreadboardProject,
  ProjectComponent,
  ProjectModuleInstance,
  Wire,
} from '../lib/breadboardProjectModel'
import { estimatePixelsPerMm } from '../lib/breadboardScale'
import {
  computeAlignedBreadboardPinIds,
  computeCoveredBreadboardPinIds,
} from '../lib/modulePinAlignment'
import type { LibraryPartDefinition } from '../lib/partLibraryModel'

type ProjectViewProps = {
  project: BreadboardProject
  breadboard: BreadboardDefinition
  libraryParts?: LibraryPartDefinition[]
  status: string
  onBack: () => void
  onEdit?: () => void
}

function findPoint(points: ConnectionPoint[], pointId: string) {
  return points.find((point) => point.id === pointId)
}

function buildWirePoints(wire: Wire, fromPoint: ConnectionPoint, toPoint: ConnectionPoint) {
  const waypoints = wire.waypoints ?? []
  const vertices = [
    { x: fromPoint.x, y: fromPoint.y },
    ...waypoints.map((waypoint) => ({ x: waypoint.x, y: waypoint.y })),
    { x: toPoint.x, y: toPoint.y },
  ]

  return vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' ')
}

function describeComponent(component: ProjectComponent) {
  return component.description?.trim()
    ? `${component.label} - ${component.description}`
    : component.label
}

export function ProjectView({ project, breadboard, libraryParts = [], status, onBack, onEdit }: ProjectViewProps) {
  const safeWidth = breadboard.imageWidth > 0 ? breadboard.imageWidth : 1
  const safeHeight = breadboard.imageHeight > 0 ? breadboard.imageHeight : 1
  const pixelsPerMm = useMemo(() => estimatePixelsPerMm(breadboard), [breadboard])
  const libraryPartIndex = useMemo(() => {
    const map = new Map<string, LibraryPartDefinition>()
    for (const part of libraryParts) {
      map.set(part.id, part)
    }
    return map
  }, [libraryParts])
  const modules: ProjectModuleInstance[] = useMemo(() => project.modules ?? [], [project.modules])

  const wireRows = useMemo(() => {
    return project.wires.map((wire) => {
      const fromPoint = findPoint(breadboard.points, wire.fromPointId)
      const toPoint = findPoint(breadboard.points, wire.toPointId)

      return {
        wire,
        fromPoint,
        toPoint,
        fromLabel: fromPoint?.label ?? '?',
        toLabel: toPoint?.label ?? '?',
      }
    })
  }, [project.wires, breadboard.points])

  const renderableSegments = wireRows.filter(
    (row): row is { wire: Wire; fromPoint: ConnectionPoint; toPoint: ConnectionPoint; fromLabel: string; toLabel: string } =>
      Boolean(row.fromPoint && row.toPoint),
  )

  const components = useMemo(() => project.components ?? [], [project.components])
  const componentsByKind = useMemo(() => {
    const groups = new Map<string, ProjectComponent[]>()

    for (const component of components) {
      const existing = groups.get(component.kind) ?? []
      existing.push(component)
      groups.set(component.kind, existing)
    }

    return Array.from(groups.entries()).sort(([leftKind], [rightKind]) =>
      leftKind.localeCompare(rightKind),
    )
  }, [components])

  const radius = Math.max(3, Math.min(safeWidth, safeHeight) * 0.004)
  const alignedRadius = radius * 2
  const strokeWidth = Math.max(3, radius * 0.6)
  const alignedPinIds = useMemo(
    () => computeAlignedBreadboardPinIds(modules, libraryPartIndex, breadboard.points, pixelsPerMm),
    [modules, libraryPartIndex, breadboard.points, pixelsPerMm],
  )
  const coveredPinIds = useMemo(
    () => computeCoveredBreadboardPinIds(modules, libraryPartIndex, breadboard.points, pixelsPerMm),
    [modules, libraryPartIndex, breadboard.points, pixelsPerMm],
  )

  return (
    <section className="project-view" aria-label="Project view">
      <header className="pin-editor__header">
        <div className="pin-editor__title-block">
          <p className="image-workspace__eyebrow">Project view (read only)</p>
          <h1 className="project-view__title">{project.name || 'Untitled project'}</h1>
          <p className="image-workspace__status">{status}</p>
        </div>
        <div className="pin-editor__actions">
          <button type="button" className="action-button action-button--ghost" onClick={onBack}>
            Back to projects
          </button>
          {onEdit ? (
            <button type="button" className="action-button" onClick={onEdit}>
              Edit project
            </button>
          ) : null}
        </div>
      </header>

      <section className="project-view__layout">
        <div className="project-view__stage">
          <div className="image-stage" aria-label="Project preview">
            <svg
              className="image-stage__svg pin-editor__svg wire-editor__svg"
              viewBox={`0 0 ${safeWidth} ${safeHeight}`}
              role="img"
              aria-label={`Read-only preview of ${project.name} on ${breadboard.name}`}
            >
              <image
                href={breadboard.imagePath}
                width={safeWidth}
                height={safeHeight}
                preserveAspectRatio="none"
              />
              {modules.map((instance) => {
                const part = libraryPartIndex.get(instance.libraryPartId)

                if (!part) {
                  return null
                }

                const view =
                  part.imageViews.find((entry) => entry.id === instance.viewId) ??
                  part.imageViews[0]
                const widthPx = part.dimensions.widthMm * pixelsPerMm
                const heightPx = part.dimensions.heightMm * pixelsPerMm

                if (widthPx <= 0 || heightPx <= 0) {
                  return null
                }

                return (
                  <g
                    key={instance.id}
                    className="project-view__module"
                    transform={`rotate(${instance.rotationDeg} ${instance.centerX} ${instance.centerY})`}
                    aria-label={`Module ${part.name}`}
                  >
                    {view ? (
                      <image
                        href={view.imagePath}
                        x={instance.centerX - widthPx / 2}
                        y={instance.centerY - heightPx / 2}
                        width={widthPx}
                        height={heightPx}
                        preserveAspectRatio="none"
                      />
                    ) : null}
                    <rect
                      x={instance.centerX - widthPx / 2}
                      y={instance.centerY - heightPx / 2}
                      width={widthPx}
                      height={heightPx}
                      fill="transparent"
                      stroke="#444"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  </g>
                )
              })}
              {renderableSegments.map(({ wire, fromPoint, toPoint, fromLabel, toLabel }) => (
                <polyline
                  key={wire.id}
                  className="wire-editor__wire project-view__wire"
                  points={buildWirePoints(wire, fromPoint, toPoint)}
                  fill="none"
                  stroke={wire.color ?? '#222'}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-label={`Wire from ${fromLabel} to ${toLabel}`}
                />
              ))}
              {breadboard.points.map((point) => {
                const isAligned = alignedPinIds.has(point.id)
                const isCovered = coveredPinIds.has(point.id)
                if (isCovered && !isAligned) {
                  return null
                }
                return (
                  <circle
                    key={point.id}
                    className={`pin-editor__pin project-view__pin${isAligned ? ' project-view__pin--aligned' : ''}`}
                    cx={point.x}
                    cy={point.y}
                    r={isAligned ? alignedRadius : radius}
                    fill={isAligned ? '#facc15' : undefined}
                    stroke={isAligned ? '#a16207' : undefined}
                    aria-label={`Pin hole ${point.label}${isAligned ? ' (module pin aligned)' : ''}`}
                  />
                )
              })}
            </svg>
          </div>
        </div>

        <aside className="project-view__details" aria-label="Project bill of materials">
          <section className="project-view__section" aria-label="Modules used">
            <h2 className="project-view__section-title">Modules used</h2>
            <ul className="project-view__module-list">
              <li className="project-view__module-item">
                <span className="project-view__module-name">{breadboard.name}</span>
                <span className="project-view__module-meta">
                  {breadboard.points.length} pin hole{breadboard.points.length === 1 ? '' : 's'}
                </span>
              </li>
            </ul>
          </section>

          <section className="project-view__section" aria-label="Wires needed">
            <h2 className="project-view__section-title">
              Wires needed ({project.wires.length})
            </h2>
            {project.wires.length === 0 ? (
              <p className="project-view__empty">No wires placed yet.</p>
            ) : (
              <ol className="project-view__wire-list">
                {wireRows.map(({ wire, fromLabel, toLabel }, index) => {
                  const waypointCount = wire.waypoints?.length ?? 0

                  return (
                    <li
                      key={wire.id}
                      className="project-view__wire-item"
                      aria-label={`Wire ${index + 1}: ${fromLabel} to ${toLabel}`}
                    >
                      <span
                        className="project-view__wire-swatch"
                        style={{ backgroundColor: wire.color ?? '#222' }}
                        aria-hidden="true"
                      />
                      <span className="project-view__wire-label">
                        <strong>#{index + 1}</strong> {fromLabel} <span aria-hidden="true">→</span>{' '}
                        {toLabel}
                      </span>
                      {waypointCount > 0 ? (
                        <span className="project-view__wire-meta">
                          {waypointCount} routing point{waypointCount === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <section className="project-view__section" aria-label="Components">
            <h2 className="project-view__section-title">
              Components ({components.length})
            </h2>
            {components.length === 0 ? (
              <p className="project-view__empty">
                No components tracked yet. Open the editor to add resistors, LEDs, and other parts.
              </p>
            ) : (
              <div className="project-view__component-groups">
                {componentsByKind.map(([kind, kindComponents]) => (
                  <section
                    key={kind}
                    className="project-view__component-group"
                    aria-label={`${kind} components`}
                  >
                    <h3 className="project-view__component-kind">
                      {kind.charAt(0).toUpperCase() + kind.slice(1)} ({kindComponents.length})
                    </h3>
                    <ul className="project-view__component-list">
                      {kindComponents.map((component) => (
                        <li key={component.id} className="project-view__component-item">
                          {describeComponent(component)}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </section>
        </aside>
      </section>
    </section>
  )
}
