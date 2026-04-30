import { useCallback, useEffect, useRef, useState } from 'react'

import './App.css'
import { ComponentLibrary } from './components/ComponentLibrary'
import { GeneratedPassiveEditor } from './components/GeneratedPassiveEditor'
import { ImageWorkspace } from './components/ImageWorkspace'
import { ModuleWorkspace } from './components/ModuleWorkspace'
import { PinPointEditor } from './components/PinPointEditor'
import { ProjectView } from './components/ProjectView'
import { WireEditor } from './components/WireEditor'
import {
  createBreadboardDefinitionRecord,
  listBreadboardDefinitions,
  loadBreadboardDefinition,
  updateBreadboardDefinitionRecord,
} from './lib/breadboardDefinitionApi'
import { createEmptyBreadboardDefinition, type BreadboardDefinition } from './lib/breadboardDefinitionModel'
import {
  createBreadboardProjectRecord,
  listBreadboardProjects,
  loadBreadboardProject,
  updateBreadboardProjectRecord,
} from './lib/breadboardProjectApi'
import { createEmptyBreadboardProject, type BreadboardProject } from './lib/breadboardProjectModel'
import { createDefaultAlignment, type SavedWorkspace } from './lib/imageAlignment'
import { ensureLandscapeFile, rotateImageFile } from './lib/imageOrientation'
import { loadSavedWorkspace, saveWorkspace, uploadWorkspaceImage } from './lib/imageWorkspaceApi'
import {
  createLibraryPartRecord,
  listLibraryParts,
  loadLibraryPart,
  updateLibraryPartRecord,
} from './lib/partLibraryApi'
import { createEmptyLibraryPart, type LibraryPartDefinition } from './lib/partLibraryModel'

const GUIDE_LINE_MIN = 0
const GUIDE_LINE_MAX = 100
const DEFAULT_GUIDE_LINE_STEP = 0.5
const DEFAULT_ROTATION_STEP = 0.25

type WizardStep =
  | 'home'
  | 'align'
  | 'points'
  | 'select-breadboard'
  | 'wire'
  | 'view-project'
  | 'edit-library-part'
  | 'edit-generated-passive'

type HomeTab = 'projects' | 'components' | 'library-parts'

type ImageDimensions = {
  width: number
  height: number
}

function alignmentsMatch(left: SavedWorkspace['alignment'], right: SavedWorkspace['alignment']) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function clampGuideLinePercent(value: number) {
  return Math.min(GUIDE_LINE_MAX, Math.max(GUIDE_LINE_MIN, value))
}

function mergeDefinitionLibrary(
  definitions: BreadboardDefinition[],
  nextDefinition: BreadboardDefinition,
) {
  const remainingDefinitions = definitions.filter((definition) => definition.id !== nextDefinition.id)

  return [nextDefinition, ...remainingDefinitions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function mergeProjectLibrary(
  projects: BreadboardProject[],
  nextProject: BreadboardProject,
) {
  const remainingProjects = projects.filter((project) => project.id !== nextProject.id)

  return [nextProject, ...remainingProjects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function mergeLibraryPartLibrary(
  parts: LibraryPartDefinition[],
  nextPart: LibraryPartDefinition,
) {
  const remaining = parts.filter((part) => part.id !== nextPart.id)

  return [nextPart, ...remaining].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function createDefinitionDraft(
  workspace: SavedWorkspace,
  imageDimensions: ImageDimensions,
  name = workspace.imageName.replace(/\.[^.]+$/, '') || 'Breadboard definition',
) {
  return createEmptyBreadboardDefinition({
    name,
    imageName: workspace.imageName,
    imagePath: workspace.imagePath,
    imageWidth: imageDimensions.width,
    imageHeight: imageDimensions.height,
  })
}

function homeStatus(definitionCount: number, projectCount: number) {
  if (definitionCount === 0 && projectCount === 0) {
    return 'No breadboards or projects yet. Add a breadboard to get started.'
  }

  return `${definitionCount} saved breadboard${definitionCount === 1 ? '' : 's'} and ${projectCount} project${projectCount === 1 ? '' : 's'}.`
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [homeTab, setHomeTab] = useState<HomeTab>('projects')
  const normalizedImagePathsRef = useRef<Set<string>>(new Set())
  const [step, setStep] = useState<WizardStep>('home')
  const [workspace, setWorkspace] = useState<SavedWorkspace | null>(null)
  const [definitions, setDefinitions] = useState<BreadboardDefinition[]>([])
  const [currentDefinition, setCurrentDefinition] = useState<BreadboardDefinition | null>(null)
  const [projects, setProjects] = useState<BreadboardProject[]>([])
  const [currentProject, setCurrentProject] = useState<BreadboardProject | null>(null)
  const [currentProjectBreadboard, setCurrentProjectBreadboard] = useState<BreadboardDefinition | null>(null)
  const [isProjectBusy, setIsProjectBusy] = useState(false)
  const [libraryParts, setLibraryParts] = useState<LibraryPartDefinition[]>([])
  const [currentLibraryPart, setCurrentLibraryPart] = useState<LibraryPartDefinition | null>(null)
  const [isLibraryPartBusy, setIsLibraryPartBusy] = useState(false)
  const [passiveReturnStep, setPassiveReturnStep] = useState<WizardStep | null>(null)
  const [draftAlignment, setDraftAlignment] = useState(createDefaultAlignment())
  const [workspaceImageDimensions, setWorkspaceImageDimensions] = useState<ImageDimensions | null>(null)
  const [guideLinePercent, setGuideLinePercent] = useState(25)
  const [rotationStep, setRotationStep] = useState(DEFAULT_ROTATION_STEP)
  const [guideLineStep, setGuideLineStep] = useState(DEFAULT_GUIDE_LINE_STEP)
  const [isBusy, setIsBusy] = useState(false)
  const [isDefinitionBusy, setIsDefinitionBusy] = useState(false)
  const [status, setStatus] = useState('Loading saved breadboards...')

  // Load saved definitions on mount.
  useEffect(() => {
    let isActive = true

    void (async () => {
      try {
        const [savedDefinitions, savedProjects, savedLibraryParts] = await Promise.all([
          listBreadboardDefinitions(),
          listBreadboardProjects().catch(() => [] as BreadboardProject[]),
          listLibraryParts().catch(() => [] as LibraryPartDefinition[]),
        ])

        if (!isActive) {
          return
        }

        setDefinitions(savedDefinitions)
        setProjects(savedProjects)
        setLibraryParts(savedLibraryParts)
        setStatus(homeStatus(savedDefinitions.length, savedProjects.length))
      } catch {
        if (isActive) {
          setStatus('Could not load the saved breadboard library.')
        }
      }
    })()

    return () => {
      isActive = false
    }
  }, [])

  // Touch the workspace endpoint on boot to keep parity with prior behavior.
  useEffect(() => {
    void (async () => {
      try {
        await loadSavedWorkspace()
      } catch {
        // Ignore.
      }
    })()
  }, [])

  const hasUnsavedAlignment = workspace ? !alignmentsMatch(workspace.alignment, draftAlignment) : false

  // Auto-normalize portrait images to landscape when entering align step.
  useEffect(() => {
    if (step !== 'align') {
      return
    }

    const imagePath = workspace?.imagePath

    if (!imagePath || normalizedImagePathsRef.current.has(imagePath)) {
      return
    }

    normalizedImagePathsRef.current.add(imagePath)

    const currentWorkspace = workspace
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch(imagePath)

        if (!response.ok) {
          return
        }

        const blob = await response.blob()
        const fileType = blob.type || 'image/jpeg'
        const sourceFile = new File([blob], currentWorkspace.imageName, { type: fileType })
        const normalizedFile = await ensureLandscapeFile(sourceFile)

        if (cancelled || normalizedFile === sourceFile) {
          return
        }

        const reuploaded = await uploadWorkspaceImage(normalizedFile, fetch, async (file) => file)

        if (cancelled) {
          return
        }

        normalizedImagePathsRef.current.add(reuploaded.imagePath)

        const restored = await saveWorkspace({
          ...reuploaded,
          alignment: currentWorkspace.alignment,
        })

        if (cancelled) {
          return
        }

        setWorkspaceImageDimensions(null)
        setWorkspace(restored)
        setDraftAlignment(restored.alignment)
        setStatus('Image was rotated so the long side runs horizontally.')
      } catch {
        // Leave the original image in place.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [step, workspace])

  const handleImageDimensionsChange = useCallback(
    (nextDimensions: ImageDimensions) => {
      setWorkspaceImageDimensions(nextDimensions)

      if (!workspace) {
        return
      }

      setCurrentDefinition((existingDefinition) => {
        if (!existingDefinition) {
          return createDefinitionDraft(workspace, nextDimensions)
        }

        if (
          existingDefinition.imagePath === workspace.imagePath &&
          existingDefinition.imageWidth === nextDimensions.width &&
          existingDefinition.imageHeight === nextDimensions.height &&
          existingDefinition.imageName === workspace.imageName
        ) {
          return existingDefinition
        }

        return {
          ...existingDefinition,
          imageName: workspace.imageName,
          imagePath: workspace.imagePath,
          imageWidth: nextDimensions.width,
          imageHeight: nextDimensions.height,
        }
      })
    },
    [workspace],
  )

  function handleAddBreadboard() {
    fileInputRef.current?.click()
  }

  function handleBackToHome() {
    setStep('home')
    setCurrentProject(null)
    setCurrentProjectBreadboard(null)
    setCurrentLibraryPart(null)
    setStatus(homeStatus(definitions.length, projects.length))
  }

  function handleNewLibraryPart() {
    const newPart = createEmptyLibraryPart({ name: 'New module' })
    setCurrentLibraryPart(newPart)
    setStep('edit-library-part')
    setStatus('New module. Upload a top image, calibrate corners, then place pins.')
  }

  function handleNewGeneratedPassive() {
    setCurrentLibraryPart(null)
    setStep('edit-generated-passive')
    setStatus('Pick a part type, set its options, and save.')
  }

  function handleNewGeneratedPassiveFromWire() {
    setPassiveReturnStep('wire')
    handleNewGeneratedPassive()
  }

  function handleOpenGeneratedPassive(part: LibraryPartDefinition) {
    setCurrentLibraryPart(part)
    setStep('edit-generated-passive')
    setStatus(`Editing generated part ${part.name}.`)
  }

  async function handleSaveGeneratedPassive(part: LibraryPartDefinition) {
    setIsLibraryPartBusy(true)
    try {
      const isExisting = libraryParts.some((existing) => existing.id === part.id)
      const saved = isExisting
        ? await updateLibraryPartRecord(part)
        : await createLibraryPartRecord(part)
      setLibraryParts((existing) => mergeLibraryPartLibrary(existing, saved))
      setCurrentLibraryPart(saved)
      setStatus(`Saved generated part: ${saved.name}.`)
      const nextStep = passiveReturnStep ?? 'home'
      setPassiveReturnStep(null)
      setStep(nextStep)
    } catch {
      setStatus('Could not save the generated part.')
    } finally {
      setIsLibraryPartBusy(false)
    }
  }

  function handleCancelGeneratedPassive() {
    const nextStep = passiveReturnStep ?? 'home'
    setPassiveReturnStep(null)
    setStep(nextStep)
  }

  async function handleOpenLibraryPart(partId: string) {
    setIsLibraryPartBusy(true)
    try {
      const part = await loadLibraryPart(partId)
      setCurrentLibraryPart(part)
      setStep('edit-library-part')
      setStatus(`Editing ${part.name}.`)
    } catch {
      setStatus('Could not load that library part.')
    } finally {
      setIsLibraryPartBusy(false)
    }
  }

  function handleLibraryPartChange(nextPart: LibraryPartDefinition) {
    setCurrentLibraryPart(nextPart)
  }

  async function handleSaveLibraryPart() {
    if (!currentLibraryPart) {
      return
    }

    setIsLibraryPartBusy(true)
    try {
      const partToSave: LibraryPartDefinition = {
        ...currentLibraryPart,
        name: currentLibraryPart.name.trim() || 'Untitled part',
      }
      const isExisting = libraryParts.some((part) => part.id === partToSave.id)
      const saved = isExisting
        ? await updateLibraryPartRecord(partToSave)
        : await createLibraryPartRecord(partToSave)

      setLibraryParts((existing) => mergeLibraryPartLibrary(existing, saved))
      setCurrentLibraryPart(saved)
      setStatus(`Saved library part: ${saved.name}.`)
    } catch {
      setStatus('Could not save the library part.')
    } finally {
      setIsLibraryPartBusy(false)
    }
  }

  function handleStartProject() {
    if (definitions.length === 0) {
      setStatus('Add a breadboard first - projects need a saved breadboard to wire.')
      return
    }

    setStep('select-breadboard')
    setStatus('Pick a breadboard for your new project.')
  }

  async function handleSelectBreadboardForProject(definitionId: string) {
    setIsProjectBusy(true)

    try {
      const breadboard = await loadBreadboardDefinition(definitionId)
      const newProject = createEmptyBreadboardProject({
        name: `${breadboard.name} project`,
        breadboardDefinitionId: breadboard.id,
      })

      setCurrentProject(newProject)
      setCurrentProjectBreadboard(breadboard)
      setStep('wire')
      setStatus(`New project on ${breadboard.name}. Click two pin holes to add a wire.`)
    } catch {
      setStatus('Could not load that breadboard for wiring.')
    } finally {
      setIsProjectBusy(false)
    }
  }

  async function handleOpenProject(projectId: string) {
    setIsProjectBusy(true)

    try {
      const project = await loadBreadboardProject(projectId)
      const breadboard = await loadBreadboardDefinition(project.breadboardDefinitionId)

      setCurrentProject(project)
      setCurrentProjectBreadboard(breadboard)
      setStep('wire')
      setStatus(
        project.wires.length === 0
          ? `Editing ${project.name}. Click two pin holes to add a wire.`
          : `Editing ${project.name}. ${project.wires.length} wire${project.wires.length === 1 ? '' : 's'} placed.`,
      )
    } catch {
      setStatus('Could not load that project.')
    } finally {
      setIsProjectBusy(false)
    }
  }

  async function handleViewProject(projectId: string) {
    setIsProjectBusy(true)

    try {
      const project = await loadBreadboardProject(projectId)
      const breadboard = await loadBreadboardDefinition(project.breadboardDefinitionId)

      setCurrentProject(project)
      setCurrentProjectBreadboard(breadboard)
      setStep('view-project')
      const componentCount = project.components?.length ?? 0
      setStatus(
        `Viewing ${project.name}: ${project.wires.length} wire${project.wires.length === 1 ? '' : 's'}, ${componentCount} component${componentCount === 1 ? '' : 's'}.`,
      )
    } catch {
      setStatus('Could not load that project for viewing.')
    } finally {
      setIsProjectBusy(false)
    }
  }

  function handleSwitchViewToEdit() {
    if (!currentProject) {
      return
    }

    setStep('wire')
    setStatus(
      currentProject.wires.length === 0
        ? `Editing ${currentProject.name}. Click two pin holes to add a wire.`
        : `Editing ${currentProject.name}. ${currentProject.wires.length} wire${currentProject.wires.length === 1 ? '' : 's'} placed.`,
    )
  }

  async function handleProjectChange(nextProject: BreadboardProject) {
    setCurrentProject(nextProject)

    setIsProjectBusy(true)

    try {
      const isExisting = projects.some((project) => project.id === nextProject.id)
      const savedProject = isExisting
        ? await updateBreadboardProjectRecord(nextProject)
        : await createBreadboardProjectRecord(nextProject)

      setProjects((existingProjects) => mergeProjectLibrary(existingProjects, savedProject))
      setCurrentProject(savedProject)
      setStatus(
        `Saved ${savedProject.name}. ${savedProject.wires.length} wire${savedProject.wires.length === 1 ? '' : 's'} placed.`,
      )
    } catch {
      setStatus('Could not save the project.')
    } finally {
      setIsProjectBusy(false)
    }
  }

  async function handleOpenDefinition(definitionId: string) {
    setIsDefinitionBusy(true)

    try {
      const definition = await loadBreadboardDefinition(definitionId)

      setCurrentDefinition(definition)
      setWorkspace({
        imageName: definition.imageName,
        imagePath: definition.imagePath,
        alignment: createDefaultAlignment(),
      })
      setDraftAlignment(createDefaultAlignment())
      setWorkspaceImageDimensions({
        width: definition.imageWidth,
        height: definition.imageHeight,
      })
      setStep('points')
      setStatus(
        definition.points.length === 0
          ? `Editing ${definition.name}. Click the image to add pin holes.`
          : `Editing ${definition.name}. ${definition.points.length} pin holes saved.`,
      )
    } catch {
      setStatus('Could not load that breadboard definition.')
    } finally {
      setIsDefinitionBusy(false)
    }
  }

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const [file] = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (!file) {
      return
    }

    setIsBusy(true)

    try {
      const nextWorkspace = await uploadWorkspaceImage(file, fetch, ensureLandscapeFile)

      normalizedImagePathsRef.current.add(nextWorkspace.imagePath)
      setWorkspaceImageDimensions(null)
      setWorkspace(nextWorkspace)
      setDraftAlignment(nextWorkspace.alignment)
      setCurrentDefinition(null)
      setStep('align')
      setStatus(
        'Step 1 of 2 - Align the image. Use arrow keys, the rotation buttons, or drag the guide line.',
      )
    } catch {
      setStatus('Could not save the selected image into local repo storage.')
    } finally {
      setIsBusy(false)
    }
  }

  function updatePreviewRotation(delta: number) {
    if (!workspace || delta === 0) {
      return
    }

    setDraftAlignment((currentAlignment) => ({
      rotationDegrees: currentAlignment.rotationDegrees + delta,
      referencePoints: null,
    }))
    setStatus('Rotation preview updated. Save alignment when the image looks level.')
  }

  function handleRotateLeft(multiplier = 1) {
    updatePreviewRotation(-rotationStep * multiplier)
  }

  function handleRotateRight(multiplier = 1) {
    updatePreviewRotation(rotationStep * multiplier)
  }

  function handleGuideLineChange(nextPercent: number) {
    setGuideLinePercent(clampGuideLinePercent(nextPercent))
  }

  function handleNudgeGuideLine(direction: -1 | 1, multiplier = 1) {
    setGuideLinePercent((currentValue) =>
      clampGuideLinePercent(currentValue + direction * guideLineStep * multiplier),
    )
    setStatus('Guide line moved. Keep aligning, then save when the image matches the guide.')
  }

  function handleResetAlignment() {
    setDraftAlignment(createDefaultAlignment())
    setStatus('Rotation preview reset.')
  }

  async function handleSaveAlignment() {
    if (!workspace) {
      return
    }

    setIsBusy(true)

    try {
      if (Math.abs(draftAlignment.rotationDegrees) < 0.0001) {
        const savedWorkspace = await saveWorkspace({
          ...workspace,
          alignment: createDefaultAlignment(),
        })

        setWorkspace(savedWorkspace)
        setDraftAlignment(savedWorkspace.alignment)
        setStatus('No preview rotation was pending. Image is already aligned.')
        return
      }

      const response = await fetch(workspace.imagePath)

      if (!response.ok) {
        throw new Error('Could not load the current image for rotation.')
      }

      const blob = await response.blob()
      const sourceFile = new File([blob], workspace.imageName, { type: blob.type || 'image/jpeg' })
      const rotatedFile = await rotateImageFile(sourceFile, draftAlignment.rotationDegrees)
      const uploadedWorkspace = await uploadWorkspaceImage(rotatedFile, fetch, async (file) => file)

      normalizedImagePathsRef.current.add(uploadedWorkspace.imagePath)
      setWorkspaceImageDimensions(null)
      setWorkspace(uploadedWorkspace)
      setDraftAlignment(createDefaultAlignment())
      setStatus('Rotation baked into the image. Continue to add pin holes.')
    } catch {
      setStatus('Could not save the rotated image.')
    } finally {
      setIsBusy(false)
    }
  }

  function handleContinueToPoints() {
    if (!workspace || !workspaceImageDimensions) {
      setStatus('Wait for the image to finish loading before continuing.')
      return
    }

    setCurrentDefinition((existingDefinition) =>
      existingDefinition
        ? {
            ...existingDefinition,
            imageName: workspace.imageName,
            imagePath: workspace.imagePath,
            imageWidth: workspaceImageDimensions.width,
            imageHeight: workspaceImageDimensions.height,
          }
        : createDefinitionDraft(workspace, workspaceImageDimensions),
    )
    setStep('points')
    setStatus('Step 2 of 2 - Click the image to drop pin holes for each connection point.')
  }

  function handlePinDefinitionChange(nextDefinition: BreadboardDefinition) {
    setCurrentDefinition(nextDefinition)
  }

  async function handleSaveBreadboard() {
    if (!currentDefinition) {
      return
    }

    setIsDefinitionBusy(true)

    try {
      const definitionToSave: BreadboardDefinition = {
        ...currentDefinition,
        name: currentDefinition.name.trim() || 'Untitled breadboard',
      }
      const existingDefinition = definitions.find((definition) => definition.id === definitionToSave.id)
      const savedDefinition = existingDefinition
        ? await updateBreadboardDefinitionRecord(definitionToSave)
        : await createBreadboardDefinitionRecord(definitionToSave)

      const nextDefinitions = mergeDefinitionLibrary(definitions, savedDefinition)
      setDefinitions(nextDefinitions)
      setCurrentDefinition(null)
      setWorkspace(null)
      setWorkspaceImageDimensions(null)
      setDraftAlignment(createDefaultAlignment())
      setStep('home')
      setStatus(
        `Saved ${savedDefinition.name} with ${savedDefinition.points.length} pin hole${savedDefinition.points.length === 1 ? '' : 's'}.`,
      )
    } catch {
      setStatus('Could not save the breadboard definition.')
    } finally {
      setIsDefinitionBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Upload breadboard image"
        onChange={handleFileSelection}
      />
      {step === 'home' ? (
        <section className="home-screen" aria-label="Breadboard projects home">
          <header className="home-screen__header">
            <p className="image-workspace__eyebrow">Breadboard projects</p>
            <h1 className="home-screen__title">Workbench</h1>
            <p className="image-workspace__status">{status}</p>
          </header>
          <nav
            className="home-tabs"
            role="tablist"
            aria-label="Workbench sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={homeTab === 'projects'}
              className={`home-tabs__tab${homeTab === 'projects' ? ' home-tabs__tab--active' : ''}`}
              onClick={() => setHomeTab('projects')}
            >
              Projects
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={homeTab === 'components'}
              className={`home-tabs__tab${homeTab === 'components' ? ' home-tabs__tab--active' : ''}`}
              onClick={() => setHomeTab('components')}
            >
              Components
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={homeTab === 'library-parts'}
              className={`home-tabs__tab${homeTab === 'library-parts' ? ' home-tabs__tab--active' : ''}`}
              onClick={() => setHomeTab('library-parts')}
            >
              Modules &amp; sensors
            </button>
          </nav>

          {homeTab === 'projects' ? (
            <div className="home-tabs__panel">
              <div className="home-screen__actions">
                <button
                  type="button"
                  className="action-button"
                  onClick={handleStartProject}
                  disabled={isProjectBusy || definitions.length === 0}
                  title={definitions.length === 0 ? 'Add a breadboard in Components first' : undefined}
                >
                  Start project
                </button>
                {definitions.length === 0 ? (
                  <button
                    type="button"
                    className="action-button action-button--ghost"
                    onClick={() => setHomeTab('components')}
                  >
                    Go to Components
                  </button>
                ) : null}
              </div>
              <section className="home-screen__section" aria-label="Saved projects">
                <h2 className="home-screen__section-title">Projects</h2>
                {projects.length === 0 ? (
                  <p className="home-screen__section-empty">
                    No projects yet. Click <strong>Start project</strong> to pick a breadboard
                    and add wires.
                  </p>
                ) : (
                  <ul className="home-screen__list" aria-label="Saved project list">
                    {projects.map((project) => {
                      const breadboardName =
                        definitions.find(
                          (definition) => definition.id === project.breadboardDefinitionId,
                        )?.name ?? 'Unknown breadboard'

                      return (
                        <li key={project.id} className="home-screen__card">
                          <div className="home-screen__card-body">
                            <h3 className="home-screen__card-title">{project.name}</h3>
                            <p className="home-screen__card-meta">
                              {project.wires.length} wire{project.wires.length === 1 ? '' : 's'}
                              {' \u00b7 '}
                              {breadboardName}
                            </p>
                          </div>
                          <div className="home-screen__card-actions">
                            <button
                              type="button"
                              className="action-button action-button--ghost"
                              onClick={() => void handleViewProject(project.id)}
                              disabled={isProjectBusy}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="action-button action-button--ghost"
                              onClick={() => void handleOpenProject(project.id)}
                              disabled={isProjectBusy}
                            >
                              Open project
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          ) : homeTab === 'components' ? (
            <div className="home-tabs__panel">
              <ComponentLibrary
                definitions={definitions}
                isBusy={isBusy}
                isDefinitionBusy={isDefinitionBusy}
                onAddBreadboard={handleAddBreadboard}
                onOpenDefinition={(definitionId) => void handleOpenDefinition(definitionId)}
              />
            </div>
          ) : (
            <div className="home-tabs__panel">
              <section className="home-screen__section" aria-label="Modules and sensors">
                <div className="home-screen__actions" style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="action-button"
                    onClick={handleNewLibraryPart}
                    disabled={isLibraryPartBusy}
                  >
                    Add module/sensor
                  </button>
                  <button
                    type="button"
                    className="action-button"
                    onClick={handleNewGeneratedPassive}
                    disabled={isLibraryPartBusy}
                  >
                    Add generated part
                  </button>
                </div>
                <h2 className="home-screen__section-title">Calibrated modules &amp; sensors</h2>
                <p className="home-screen__section-empty">
                  Real-world sensors, breakout boards, modules, displays, and microcontrollers calibrated
                  in millimeters so they snap to a breadboard at true physical scale.
                </p>
                {libraryParts.length === 0 ? (
                  <p className="home-screen__section-empty">
                    No modules yet. Click <strong>Add module/sensor</strong> to add one.
                  </p>
                ) : (
                  <ul className="home-screen__list" aria-label="Saved modules and sensors">
                    {libraryParts.map((part) => (
                      <li key={part.id} className="home-screen__card">
                        <div className="home-screen__card-body">
                          <h3 className="home-screen__card-title">{part.name}</h3>
                          <p className="home-screen__card-meta">
                            {part.category}
                            {' \u00b7 '}
                            {part.logicalPins.length} pin{part.logicalPins.length === 1 ? '' : 's'}
                            {' \u00b7 '}
                            {part.physicalPoints.length} point{part.physicalPoints.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="action-button action-button--ghost"
                          onClick={() =>
                            part.kind === 'generated-passive'
                              ? handleOpenGeneratedPassive(part)
                              : void handleOpenLibraryPart(part.id)
                          }
                          disabled={isLibraryPartBusy}
                        >
                          Open
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </section>
      ) : null}
      {step === 'select-breadboard' ? (
        <section className="home-screen" aria-label="Select a breadboard">
          <header className="home-screen__header">
            <p className="image-workspace__eyebrow">Project mode - step 1 of 2</p>
            <h1 className="home-screen__title">Pick a breadboard</h1>
            <p className="image-workspace__status">{status}</p>
          </header>
          <div className="home-screen__actions">
            <button
              type="button"
              className="action-button action-button--ghost"
              onClick={handleBackToHome}
              disabled={isProjectBusy}
            >
              Cancel
            </button>
          </div>
          <ul className="home-screen__list" aria-label="Breadboards available for wiring">
            {definitions.map((definition) => (
              <li key={definition.id} className="home-screen__card">
                <div className="home-screen__card-body">
                  <h3 className="home-screen__card-title">{definition.name}</h3>
                  <p className="home-screen__card-meta">
                    {definition.points.length} pin hole{definition.points.length === 1 ? '' : 's'}
                    {' \u00b7 '}
                    {definition.imageName}
                  </p>
                </div>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => void handleSelectBreadboardForProject(definition.id)}
                  disabled={isProjectBusy || definition.points.length < 2}
                  title={definition.points.length < 2 ? 'Add at least two pin holes to wire this breadboard' : undefined}
                >
                  Use this breadboard
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {step === 'align' ? (
        <ImageWorkspace
          imageName={workspace?.imageName}
          imagePath={workspace?.imagePath}
          rotationDegrees={draftAlignment.rotationDegrees}
          guideLinePercent={guideLinePercent}
          rotationStep={rotationStep}
          guideLineStep={guideLineStep}
          isBusy={isBusy}
          isSaveDisabled={!hasUnsavedAlignment}
          showDefinitionPanel={false}
          canContinueToPoints={Boolean(workspace) && !hasUnsavedAlignment && !isBusy}
          status={status}
          onImageDimensionsChange={handleImageDimensionsChange}
          onUploadRequest={handleAddBreadboard}
          onGuideLineChange={handleGuideLineChange}
          onRotationStepChange={setRotationStep}
          onGuideLineStepChange={setGuideLineStep}
          onRotateLeft={handleRotateLeft}
          onRotateRight={handleRotateRight}
          onNudgeGuideLine={handleNudgeGuideLine}
          onResetAlignment={handleResetAlignment}
          onSaveAlignment={handleSaveAlignment}
          onBackToHome={handleBackToHome}
          onContinueToPoints={handleContinueToPoints}
        />
      ) : null}
      {step === 'points' && currentDefinition && workspace && workspaceImageDimensions ? (
        <PinPointEditor
          definition={currentDefinition}
          imagePath={workspace.imagePath}
          imageWidth={workspaceImageDimensions.width}
          imageHeight={workspaceImageDimensions.height}
          isBusy={isDefinitionBusy}
          status={status}
          onBack={() => {
            setStep('align')
            setStatus('Back to alignment. Save again to bake any new rotation into the image.')
          }}
          onChange={handlePinDefinitionChange}
          onSaveAndFinish={handleSaveBreadboard}
        />
      ) : null}
      {step === 'points' && (!currentDefinition || !workspace || !workspaceImageDimensions) ? (
        <section className="pin-editor" aria-label="Loading breadboard">
          <p className="image-workspace__status">Loading breadboard image...</p>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={handleBackToHome}
          >
            Back to home
          </button>
        </section>
      ) : null}
      {step === 'wire' && currentProject && currentProjectBreadboard ? (
        <WireEditor
          project={currentProject}
          breadboard={currentProjectBreadboard}
          libraryParts={libraryParts}
          isBusy={isProjectBusy}
          status={status}
          onBack={handleBackToHome}
          onChange={(nextProject) => void handleProjectChange(nextProject)}
          onCreatePassive={handleNewGeneratedPassiveFromWire}
        />
      ) : null}
      {step === 'wire' && (!currentProject || !currentProjectBreadboard) ? (
        <section className="pin-editor" aria-label="Loading project">
          <p className="image-workspace__status">Loading project...</p>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={handleBackToHome}
          >
            Back to projects
          </button>
        </section>
      ) : null}
      {step === 'view-project' && currentProject && currentProjectBreadboard ? (
        <ProjectView
          project={currentProject}
          breadboard={currentProjectBreadboard}
          libraryParts={libraryParts}
          status={status}
          onBack={handleBackToHome}
          onEdit={handleSwitchViewToEdit}
        />
      ) : null}
      {step === 'view-project' && (!currentProject || !currentProjectBreadboard) ? (
        <section className="pin-editor" aria-label="Loading project view">
          <p className="image-workspace__status">Loading project view...</p>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={handleBackToHome}
          >
            Back to projects
          </button>
        </section>
      ) : null}
      {step === 'edit-library-part' && currentLibraryPart ? (
        <ModuleWorkspace
          part={currentLibraryPart}
          isBusy={isLibraryPartBusy}
          status={status}
          onBack={handleBackToHome}
          onChange={handleLibraryPartChange}
          onSave={() => void handleSaveLibraryPart()}
        />
      ) : null}
      {step === 'edit-generated-passive' ? (
        <GeneratedPassiveEditor
          initialPart={currentLibraryPart}
          isBusy={isLibraryPartBusy}
          status={status}
          onCancel={handleCancelGeneratedPassive}
          onSave={(part) => void handleSaveGeneratedPassive(part)}
        />
      ) : null}
    </main>
  )
}

export default App
