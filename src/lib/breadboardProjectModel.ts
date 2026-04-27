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

export type BreadboardProject = {
  id: string
  name: string
  breadboardDefinitionId: string
  wires: Wire[]
  components?: ProjectComponent[]
  createdAt: string
  updatedAt: string
}

type BreadboardProjectDraft = Partial<Omit<BreadboardProject, 'wires' | 'components'>> & {
  wires?: Wire[]
  components?: ProjectComponent[]
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

export function cloneWire(wire: Wire): Wire {
  return {
    ...wire,
    waypoints: wire.waypoints ? wire.waypoints.map((waypoint) => ({ ...waypoint })) : undefined,
  }
}

export function cloneProjectComponent(component: ProjectComponent): ProjectComponent {
  return { ...component }
}

export function cloneBreadboardProject(project: BreadboardProject): BreadboardProject {
  return {
    ...project,
    wires: project.wires.map(cloneWire),
    components: project.components ? project.components.map(cloneProjectComponent) : undefined,
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
    createdAt: project.createdAt ?? timestamp,
    updatedAt: project.updatedAt ?? timestamp,
  }
}
