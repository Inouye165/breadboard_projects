import type { BreadboardProject } from './breadboardProjectModel'

const PROJECTS_ENDPOINT = '/api/projects'

async function parseResponse<T>(response: Response) {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

export async function listBreadboardProjects(fetchImpl: typeof fetch = fetch) {
  const payload = await parseResponse<{ projects: BreadboardProject[] }>(
    await fetchImpl(PROJECTS_ENDPOINT),
  )

  return payload.projects
}

export async function loadBreadboardProject(projectId: string, fetchImpl: typeof fetch = fetch) {
  const payload = await parseResponse<{ project: BreadboardProject }>(
    await fetchImpl(`${PROJECTS_ENDPOINT}/${encodeURIComponent(projectId)}`),
  )

  return payload.project
}

export async function createBreadboardProjectRecord(
  project: BreadboardProject,
  fetchImpl: typeof fetch = fetch,
) {
  const payload = await parseResponse<{ project: BreadboardProject }>(
    await fetchImpl(PROJECTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }),
  )

  return payload.project
}

export async function updateBreadboardProjectRecord(
  project: BreadboardProject,
  fetchImpl: typeof fetch = fetch,
) {
  const payload = await parseResponse<{ project: BreadboardProject }>(
    await fetchImpl(`${PROJECTS_ENDPOINT}/${encodeURIComponent(project.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }),
  )

  return payload.project
}

export async function deleteBreadboardProjectRecord(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
) {
  await parseResponse<{ success: true }>(
    await fetchImpl(`${PROJECTS_ENDPOINT}/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    }),
  )
}
