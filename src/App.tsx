import { useEffect, useRef, useState } from 'react'

import './App.css'
import { ImageWorkspace } from './components/ImageWorkspace'
import {
  calculateHorizontalAlignmentRotation,
  createDefaultAlignment,
  type AlignmentPoint,
  type SavedWorkspace,
} from './lib/imageAlignment'
import { ensureLandscapeFile } from './lib/imageOrientation'
import { loadSavedWorkspace, saveWorkspace, uploadWorkspaceImage } from './lib/imageWorkspaceApi'

function alignmentsMatch(left: SavedWorkspace['alignment'], right: SavedWorkspace['alignment']) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const normalizedImagePathsRef = useRef<Set<string>>(new Set())
  const [workspace, setWorkspace] = useState<SavedWorkspace | null>(null)
  const [draftAlignment, setDraftAlignment] = useState(createDefaultAlignment())
  const [pendingPoints, setPendingPoints] = useState<AlignmentPoint[]>([])
  const [isAlignmentMode, setIsAlignmentMode] = useState(false)
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
            ? 'Saved image loaded. Click Align horizontally to set the reference line.'
            : 'Saved image and alignment loaded from local repo storage.',
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
    setIsAlignmentMode(false)
    setPendingPoints([])

    try {
      const nextWorkspace = await uploadWorkspaceImage(file, fetch, ensureLandscapeFile)

      normalizedImagePathsRef.current.add(nextWorkspace.imagePath)
      setWorkspace(nextWorkspace)
      setDraftAlignment(nextWorkspace.alignment)
      setStatus('Image saved locally. Click Align horizontally to pick two reference points.')
    } catch {
      setStatus('Could not save the selected image into local repo storage.')
    } finally {
      setIsBusy(false)
    }
  }

  function handleEnterAlignmentMode() {
    if (!workspace) {
      return
    }

    setPendingPoints([])
    setIsAlignmentMode(true)
    setStatus('Click two points on the image that should land on the same horizontal line.')
  }

  function handleStagePointSelect(point: AlignmentPoint) {
    if (!isAlignmentMode) {
      return
    }

    setPendingPoints((currentPoints) => {
      if (currentPoints.length === 0) {
        setStatus('First point selected. Click the second point to preview the horizontal rotation.')
        return [point]
      }

      const referencePoints: [AlignmentPoint, AlignmentPoint] = [currentPoints[0], point]
      const rotationAdjustment = calculateHorizontalAlignmentRotation(
        referencePoints[0],
        referencePoints[1],
      )

      setDraftAlignment((currentAlignment) => ({
        rotationDegrees: currentAlignment.rotationDegrees + rotationAdjustment,
        referencePoints,
      }))
      setIsAlignmentMode(false)
      setStatus('Alignment preview updated. Save alignment to keep this rotation for future launches.')

      return []
    })
  }

  function handleResetAlignment() {
    setDraftAlignment(createDefaultAlignment())
    setPendingPoints([])
    setIsAlignmentMode(false)
    setStatus('Alignment reset. You can re-enter alignment mode and choose two new points.')
  }

  async function handleSaveAlignment() {
    if (!workspace) {
      return
    }

    setIsBusy(true)

    try {
      const savedWorkspace = await saveWorkspace({
        ...workspace,
        alignment: draftAlignment,
      })

      setWorkspace(savedWorkspace)
      setDraftAlignment(savedWorkspace.alignment)
      setStatus('Alignment saved locally and will be restored automatically on the next app launch.')
    } catch {
      setStatus('Could not save the alignment metadata.')
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
        pendingPoints={pendingPoints}
        isAlignmentMode={isAlignmentMode}
        isBusy={isBusy}
        isSaveDisabled={!hasUnsavedAlignment}
        status={status}
        onUploadRequest={handleUploadRequest}
        onEnterAlignmentMode={handleEnterAlignmentMode}
        onResetAlignment={handleResetAlignment}
        onSaveAlignment={handleSaveAlignment}
        onStagePointSelect={handleStagePointSelect}
      />
    </main>
  )
}

export default App