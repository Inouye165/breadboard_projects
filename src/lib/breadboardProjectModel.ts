export type Wire = {
  id: string
  fromPointId: string
  toPointId: string
  color?: string
}

export type BreadboardProject = {
  id: string
  name: string
  breadboardDefinitionId: string
  wires: Wire[]
  createdAt: string
  updatedAt: string
}

type BreadboardProjectDraft = Partial<Omit<BreadboardProject, 'wires'>> & {
  wires?: Wire[]
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

export function cloneWire(wire: Wire): Wire {
  return { ...wire }
}

export function cloneBreadboardProject(project: BreadboardProject): BreadboardProject {
  return {
    ...project,
    wires: project.wires.map(cloneWire),
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
    createdAt: project.createdAt ?? timestamp,
    updatedAt: project.updatedAt ?? timestamp,
  }
}
