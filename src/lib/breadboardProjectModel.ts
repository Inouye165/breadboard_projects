export type WireWaypoint = {
  x: number
  y: number
}

export type Wire = {
  id: string
  fromPointId: string
  toPointId: string
  color?: string
  waypoints?: WireWaypoint[]
}

export const PROJECT_COMPONENT_KINDS = [
  'resistor',
  'led',
  'capacitor',
  'transistor',
  'diode',
  'ic',
  'switch',
  'sensor',
  'other',
] as const

export type ProjectComponentKind = (typeof PROJECT_COMPONENT_KINDS)[number]

export type ProjectComponent = {
  id: string
  kind: ProjectComponentKind
  label: string
  description?: string
}

/**
 * A library module (sensor, microcontroller, etc.) placed on the breadboard.
 *
 * Position is stored in the breadboard's pixel coordinate space. Rotation is
 * applied around (`centerX`, `centerY`). The displayed size is derived at
 * render time from the referenced library part's `dimensions` (in mm) and the
 * breadboard's pixels-per-millimeter scale, so every placed module shares a
 * consistent physical scale with the base breadboard.
 */
export type ProjectModuleInstance = {
  id: string
  libraryPartId: string
  /** Optional `PartImageView.id` to render. Defaults to the first view. */
  viewId?: string
  centerX: number
  centerY: number
  rotationDeg: number
  /**
   * Multiplicative scale override (default 1.0). Use to fine-tune the
   * rendered size so module pins line up with the breadboard holes.
   */
  scaleFactor?: number
  /**
   * For generated passive parts placed between two breadboard pins, the
   * actual centre-to-centre distance (mm) between those two pins. The
   * renderer keeps the body at its native length and stretches/shrinks the
   * leads to fill `passiveSpanMm`, mirroring how real flexible leads are
   * cut to fit the chosen holes.
   */
  passiveSpanMm?: number
}

export type BreadboardProject = {
  id: string
  name: string
  breadboardDefinitionId: string
  wires: Wire[]
  components?: ProjectComponent[]
  modules?: ProjectModuleInstance[]
  createdAt: string
  updatedAt: string
}

type BreadboardProjectDraft = Partial<
  Omit<BreadboardProject, 'wires' | 'components' | 'modules'>
> & {
  wires?: Wire[]
  components?: ProjectComponent[]
  modules?: ProjectModuleInstance[]
}

function createProjectId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `breadboard-project-${Date.now()}`
}

export function createWireId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `wire-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

export function createProjectComponentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `component-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

export function createProjectModuleInstanceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `module-instance-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

export function cloneWire(wire: Wire): Wire {
  return {
    ...wire,
    waypoints: wire.waypoints ? wire.waypoints.map((waypoint) => ({ ...waypoint })) : undefined,
  }
}

export function cloneProjectComponent(component: ProjectComponent): ProjectComponent {
  return { ...component }
}

export function cloneProjectModuleInstance(
  module: ProjectModuleInstance,
): ProjectModuleInstance {
  return { ...module }
}

export function cloneBreadboardProject(project: BreadboardProject): BreadboardProject {
  return {
    ...project,
    wires: project.wires.map(cloneWire),
    components: project.components ? project.components.map(cloneProjectComponent) : undefined,
    modules: project.modules ? project.modules.map(cloneProjectModuleInstance) : undefined,
  }
}

export function createEmptyBreadboardProject(
  project: BreadboardProjectDraft = {},
): BreadboardProject {
  const timestamp = project.createdAt ?? project.updatedAt ?? new Date().toISOString()

  return {
    id: project.id ?? createProjectId(),
    name: project.name ?? 'Untitled project',
    breadboardDefinitionId: project.breadboardDefinitionId ?? '',
    wires: project.wires?.map(cloneWire) ?? [],
    components: project.components ? project.components.map(cloneProjectComponent) : undefined,
    modules: project.modules ? project.modules.map(cloneProjectModuleInstance) : undefined,
    createdAt: project.createdAt ?? timestamp,
    updatedAt: project.updatedAt ?? timestamp,
  }
}
