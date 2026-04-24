import { useEffect, useRef, useState } from 'react'

import './App.css'
import { ImageWorkspace } from './components/ImageWorkspace'
import { createDefaultAlignment, type SavedWorkspace } from './lib/imageAlignment'
import { ensureLandscapeFile, rotateImageFile } from './lib/imageOrientation'
import { loadSavedWorkspace, saveWorkspace, uploadWorkspaceImage } from './lib/imageWorkspaceApi'

const GUIDE_LINE_MIN = 0
const GUIDE_LINE_MAX = 100
const GUIDE_LINE_STEP = 0.5

function alignmentsMatch(left: SavedWorkspace['alignment'], right: SavedWorkspace['alignment']) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function clampGuideLinePercent(value: number) {
  return Math.min(GUIDE_LINE_MAX, Math.max(GUIDE_LINE_MIN, value))
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const normalizedImagePathsRef = useRef<Set<string>>(new Set())
  const [workspace, setWorkspace] = useState<SavedWorkspace | null>(null)
  const [draftAlignment, setDraftAlignment] = useState(createDefaultAlignment())
  const [guideLinePercent, setGuideLinePercent] = useState(25)
  const [rotationInput, setRotationInput] = useState('0.25')
  const [isBusy, setIsBusy] = useState(true)
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
          setDraftAlignment(createDefaultAlignment())
          setStatus('Upload a breadboard image to start the alignment workflow.')
          return
        }

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

  const hasUnsavedAlignment = workspace ? !alignmentsMatch(workspace.alignment, draftAlignment) : false

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
      setWorkspace(nextWorkspace)
      setDraftAlignment(nextWorkspace.alignment)
      setStatus('Image saved locally. Click the stage, drag the guide, or use arrow keys to align it in real time.')
    } catch {
      setStatus('Could not save the selected image into local repo storage.')
    } finally {
      setIsBusy(false)
    }
  }

  function getRotationStep() {
    const rotationStep = Number.parseFloat(rotationInput)

    return Number.isFinite(rotationStep) && rotationStep > 0 ? rotationStep : null
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
    const rotationStep = getRotationStep()

    if (!rotationStep) {
      setStatus('Enter a positive rotation step in degrees before rotating the preview.')
      return
    }

    updatePreviewRotation(-rotationStep * multiplier)
  }

  function handleRotateRight(multiplier = 1) {
    const rotationStep = getRotationStep()

    if (!rotationStep) {
      setStatus('Enter a positive rotation step in degrees before rotating the preview.')
      return
    }

    updatePreviewRotation(rotationStep * multiplier)
  }

  function handleGuideLineChange(nextPercent: number) {
    setGuideLinePercent(clampGuideLinePercent(nextPercent))
  }

  function handleNudgeGuideLine(direction: -1 | 1, multiplier = 1) {
    setGuideLinePercent((currentValue) =>
      clampGuideLinePercent(currentValue + direction * GUIDE_LINE_STEP * multiplier),
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
        imageName={workspace?.imageName}
        imagePath={workspace?.imagePath}
        rotationDegrees={draftAlignment.rotationDegrees}
        guideLinePercent={guideLinePercent}
        rotationInput={rotationInput}
        isBusy={isBusy}
        isSaveDisabled={!hasUnsavedAlignment}
        status={status}
        onUploadRequest={handleUploadRequest}
        onGuideLineChange={handleGuideLineChange}
        onRotationInputChange={setRotationInput}
        onRotateLeft={handleRotateLeft}
        onRotateRight={handleRotateRight}
        onNudgeGuideLine={handleNudgeGuideLine}
        onResetAlignment={handleResetAlignment}
        onSaveAlignment={handleSaveAlignment}
      />
    </main>
  )
}

export default App
