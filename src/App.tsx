import { useCallback, useEffect, useRef, useState } from 'react'

import './App.css'
import { ImageWorkspace } from './components/ImageWorkspace'
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

function alignmentsMatch(left: SavedWorkspace['alignment'], right: SavedWorkspace['alignment']) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function clampGuideLinePercent(value: number) {
  return Math.min(GUIDE_LINE_MAX, Math.max(GUIDE_LINE_MIN, value))
}

type ImageDimensions = {
  width: number
  height: number
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
  const [workspace, setWorkspace] = useState<SavedWorkspace | null>(null)
  const [definitions, setDefinitions] = useState<BreadboardDefinition[]>([])
  const [currentDefinition, setCurrentDefinition] = useState<BreadboardDefinition | null>(null)
  const [draftAlignment, setDraftAlignment] = useState(createDefaultAlignment())
  const [workspaceImageDimensions, setWorkspaceImageDimensions] = useState<ImageDimensions | null>(null)
  const [guideLinePercent, setGuideLinePercent] = useState(25)
  const [rotationStep, setRotationStep] = useState(DEFAULT_ROTATION_STEP)
  const [guideLineStep, setGuideLineStep] = useState(DEFAULT_GUIDE_LINE_STEP)
  const [isBusy, setIsBusy] = useState(true)
  const [isDefinitionBusy, setIsDefinitionBusy] = useState(false)
  const [status, setStatus] = useState('Loading saved image workspace...')

  useEffect(() => {
    let isActive = true

    async function restoreWorkspace() {
      try {
        const savedWorkspace = await loadSavedWorkspace()

        if (!isActive) {
          return
        }

        if (!savedWorkspace) {
          setWorkspace(null)
          setWorkspaceImageDimensions(null)
          setCurrentDefinition(null)
          setDraftAlignment(createDefaultAlignment())
          setStatus('Upload a breadboard image to start the alignment workflow.')
          return
        }

        setWorkspaceImageDimensions(null)
        setWorkspace(savedWorkspace)
        setDraftAlignment(savedWorkspace.alignment)
        setStatus(
          savedWorkspace.alignment.rotationDegrees === 0
            ? 'Saved image loaded. Click the stage, drag the guide, or use arrow keys to align it in real time.'
            : 'Saved image loaded with a preview rotation. Fine tune it live, then save to bake it into the image.',
        )
      } catch {
        if (isActive) {
          setStatus('Could not load the saved image workspace.')
        }
      } finally {
        if (isActive) {
          setIsBusy(false)
        }
      }
    }

    void restoreWorkspace()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    void (async () => {
      try {
        const savedDefinitions = await listBreadboardDefinitions()

        if (isActive) {
          setDefinitions(savedDefinitions)
        }
      } catch {
        if (isActive) {
          setStatus('Saved image loaded. Could not load the saved definition library yet.')
        }
      }
    })()

    return () => {
      isActive = false
    }
  }, [])

  const hasUnsavedAlignment = workspace ? !alignmentsMatch(workspace.alignment, draftAlignment) : false
  const isDefinitionSaveDisabled = !currentDefinition || !workspace || !workspaceImageDimensions

  useEffect(() => {
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
        setStatus('Saved image was rotated so the long side runs horizontally.')
      } catch {
        // Leave the original image in place; UI still works.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [workspace])

  function handleUploadRequest() {
    fileInputRef.current?.click()
  }

  const handleImageDimensionsChange = useCallback((nextDimensions: ImageDimensions) => {
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
  }, [workspace])

  function handleDefinitionNameChange(name: string) {
    setCurrentDefinition((existingDefinition) => {
      if (!existingDefinition) {
        if (!workspace || !workspaceImageDimensions) {
          return existingDefinition
        }

        return createDefinitionDraft(workspace, workspaceImageDimensions, name)
      }

      return {
        ...existingDefinition,
        name,
      }
    })
  }

  async function handleDefinitionSelected(definitionId: string) {
    if (!definitionId) {
      return
    }

    setIsDefinitionBusy(true)

    try {
      const definition = await loadBreadboardDefinition(definitionId)

      setCurrentDefinition(definition)
      setStatus(`Loaded saved definition ${definition.name}.`)
    } catch {
      setStatus('Could not load the selected breadboard definition.')
    } finally {
      setIsDefinitionBusy(false)
    }
  }

  function handleCreateDefinition() {
    if (!workspace || !workspaceImageDimensions) {
      return
    }

    const nextDefinition = createDefinitionDraft(workspace, workspaceImageDimensions)

    setCurrentDefinition(nextDefinition)
    setStatus('Created a new unsaved breadboard definition for the current image.')
  }

  async function handleSaveDefinition() {
    if (!currentDefinition || !workspace || !workspaceImageDimensions) {
      return
    }

    setIsDefinitionBusy(true)

    try {
      const definitionToSave = {
        ...currentDefinition,
        imageName: workspace.imageName,
        imagePath: workspace.imagePath,
        imageWidth: workspaceImageDimensions.width,
        imageHeight: workspaceImageDimensions.height,
      }
      const existingDefinition = definitions.find((definition) => definition.id === definitionToSave.id)
      const savedDefinition = existingDefinition
        ? await updateBreadboardDefinitionRecord(definitionToSave)
        : await createBreadboardDefinitionRecord(definitionToSave)

      setDefinitions((existingDefinitions) => mergeDefinitionLibrary(existingDefinitions, savedDefinition))
      setCurrentDefinition(savedDefinition)
      setStatus(`Saved definition ${savedDefinition.name}. Points remain editable in a later phase.`)
    } catch {
      setStatus('Could not save the breadboard definition.')
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
      setStatus('Image saved locally. Click the stage, drag the guide, or use arrow keys to align it in real time.')
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
    setStatus('Rotation preview updated live. Save alignment to bake this rotation into the stored image.')
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
    setStatus('Guide line moved. Keep aligning live, then save when the image matches the guide.')
  }

  function handleResetAlignment() {
    setDraftAlignment(createDefaultAlignment())
    setStatus('Rotation preview reset to the saved image orientation.')
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
        setStatus('No preview rotation was pending, so the saved image is already current.')
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
      setStatus('Rotation saved into the image. Future app loads use the newly rotated file directly.')
    } catch {
      setStatus('Could not save the rotated image into local repo storage.')
    } finally {
      setIsBusy(false)
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
      <ImageWorkspace
        currentDefinitionName={currentDefinition?.name ?? ''}
        definitionOptions={definitions.map((definition) => ({
          id: definition.id,
          name: definition.name,
        }))}
        imageName={workspace?.imageName}
        imagePath={workspace?.imagePath}
        rotationDegrees={draftAlignment.rotationDegrees}
        guideLinePercent={guideLinePercent}
        rotationStep={rotationStep}
        guideLineStep={guideLineStep}
        isBusy={isBusy}
        isDefinitionBusy={isDefinitionBusy}
        isDefinitionSaveDisabled={Boolean(isDefinitionSaveDisabled)}
        isSaveDisabled={!hasUnsavedAlignment}
        status={status}
        onCreateDefinition={handleCreateDefinition}
        onCurrentDefinitionNameChange={handleDefinitionNameChange}
        onDefinitionSelected={handleDefinitionSelected}
        onImageDimensionsChange={handleImageDimensionsChange}
        onUploadRequest={handleUploadRequest}
        onGuideLineChange={handleGuideLineChange}
        onRotationStepChange={setRotationStep}
        onGuideLineStepChange={setGuideLineStep}
        onRotateLeft={handleRotateLeft}
        onRotateRight={handleRotateRight}
        onNudgeGuideLine={handleNudgeGuideLine}
        onResetAlignment={handleResetAlignment}
        onSaveDefinition={handleSaveDefinition}
        onSaveAlignment={handleSaveAlignment}
      />
    </main>
  )
}

export default App
