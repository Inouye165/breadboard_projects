import { useCallback, useEffect, useRef, useState } from 'react'

import './App.css'
import { ImageWorkspace } from './components/ImageWorkspace'
import { PinPointEditor } from './components/PinPointEditor'
import {
  createBreadboardDefinitionRecord,
  listBreadboardDefinitions,
  loadBreadboardDefinition,
  updateBreadboardDefinitionRecord,
} from './lib/breadboardDefinitionApi'
import { createEmptyBreadboardDefinition, type BreadboardDefinition } from './lib/breadboardDefinitionModel'
import { createDefaultAlignment, type SavedWorkspace } from './lib/imageAlignment'
import { ensureLandscapeFile, rotateImageFile } from './lib/imageOrientation'
import { loadSavedWorkspace, saveWorkspace, uploadWorkspaceImage } from './lib/imageWorkspaceApi'

const GUIDE_LINE_MIN = 0
const GUIDE_LINE_MAX = 100
const DEFAULT_GUIDE_LINE_STEP = 0.5
const DEFAULT_ROTATION_STEP = 0.25

type WizardStep = 'home' | 'align' | 'points'

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

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const normalizedImagePathsRef = useRef<Set<string>>(new Set())
  const [step, setStep] = useState<WizardStep>('home')
  const [workspace, setWorkspace] = useState<SavedWorkspace | null>(null)
  const [definitions, setDefinitions] = useState<BreadboardDefinition[]>([])
  const [currentDefinition, setCurrentDefinition] = useState<BreadboardDefinition | null>(null)
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
        const savedDefinitions = await listBreadboardDefinitions()

        if (!isActive) {
          return
        }

        setDefinitions(savedDefinitions)
        setStatus(
          savedDefinitions.length === 0
            ? 'No breadboards saved yet. Add one to get started.'
            : `${savedDefinitions.length} saved breadboard${savedDefinitions.length === 1 ? '' : 's'}.`,
        )
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
    setStatus(
      definitions.length === 0
        ? 'No breadboards saved yet. Add one to get started.'
        : `${definitions.length} saved breadboard${definitions.length === 1 ? '' : 's'}.`,
    )
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
        <section className="home-screen" aria-label="Saved breadboards">
          <header className="home-screen__header">
            <p className="image-workspace__eyebrow">Breadboard projects</p>
            <h1 className="home-screen__title">Your breadboards</h1>
            <p className="image-workspace__status">{status}</p>
          </header>
          <div className="home-screen__actions">
            <button
              type="button"
              className="action-button"
              onClick={handleAddBreadboard}
              disabled={isBusy}
            >
              Add breadboard
            </button>
          </div>
          {definitions.length === 0 ? (
            <div className="home-screen__empty">
              <h2>No breadboards yet.</h2>
              <p>
                Click <strong>Add breadboard</strong> to upload an image, align it, and mark each pin
                hole. The breadboard becomes a single saved object you can wire up later.
              </p>
            </div>
          ) : (
            <ul className="home-screen__list">
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
                    className="action-button action-button--ghost"
                    onClick={() => void handleOpenDefinition(definition.id)}
                    disabled={isDefinitionBusy}
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
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
    </main>
  )
}

export default App
