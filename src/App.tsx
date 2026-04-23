import { useEffect, useRef, useState } from 'react'
import './App.css'
import { BreadboardCanvas } from './components/BreadboardCanvas'
import {
  canReadBreadboardLibrary,
  getStoredBreadboardLibraryName,
  loadSavedBreadboards,
  persistBreadboardLibraryHandle,
  restoreBreadboardLibraryHandle,
  saveBreadboardImageToFolder,
  type SavedBreadboard,
} from './lib/breadboardLibrary'

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite'
    startIn?: 'downloads'
  }) => Promise<FileSystemDirectoryHandle>
}

function App() {
  const [savedBreadboards, setSavedBreadboards] = useState<SavedBreadboard[]>([])
  const [currentBreadboardName, setCurrentBreadboardName] = useState<string>()
  const [temporaryImage, setTemporaryImage] = useState<{ name: string; url: string }>()
  const [libraryFolderName, setLibraryFolderName] = useState(getStoredBreadboardLibraryName())
  const [libraryStatus, setLibraryStatus] = useState(
    'Choose a folder to save breadboard images for reuse.',
  )
  const directoryHandleRef = useRef<FileSystemDirectoryHandle | null>(null)
  const savedUrlsRef = useRef<string[]>([])

  const selectedBreadboard = savedBreadboards.find(
    (breadboard) => breadboard.name === currentBreadboardName,
  )
  const imageSrc = temporaryImage?.url ?? selectedBreadboard?.url
  const imageName = temporaryImage?.name ?? selectedBreadboard?.name

  function replaceSavedBreadboards(nextBreadboards: SavedBreadboard[]) {
    const previousUrls = savedUrlsRef.current

    savedUrlsRef.current = nextBreadboards.map((breadboard) => breadboard.url)
    setSavedBreadboards(nextBreadboards)
    previousUrls.forEach((url) => {
      URL.revokeObjectURL(url)
    })
  }

  function clearTemporaryImage() {
    setTemporaryImage((currentTemporaryImage) => {
      if (currentTemporaryImage) {
        URL.revokeObjectURL(currentTemporaryImage.url)
      }

      return undefined
    })
  }

  useEffect(() => {
    return () => {
      if (temporaryImage) {
        URL.revokeObjectURL(temporaryImage.url)
      }

      savedUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url)
      })
    }
  }, [temporaryImage])

  useEffect(() => {
    async function restoreSavedLibrary() {
      try {
        const storedHandle = await restoreBreadboardLibraryHandle()

        if (!storedHandle) {
          return
        }

        directoryHandleRef.current = storedHandle
        setLibraryFolderName(storedHandle.name)

        const hasPermission = await canReadBreadboardLibrary(storedHandle)

        if (!hasPermission) {
          setLibraryStatus(`Reconnect ${storedHandle.name} to load saved breadboards.`)
          return
        }

        const nextBreadboards = await loadSavedBreadboards(storedHandle)

        replaceSavedBreadboards(nextBreadboards)
        setCurrentBreadboardName(nextBreadboards[0]?.name)
        if (nextBreadboards.length > 0) {
          setLibraryStatus(`Loaded ${nextBreadboards.length} saved breadboard image${nextBreadboards.length === 1 ? '' : 's'}.`)
        }
      } catch {
        setLibraryStatus('Unable to reopen the saved folder automatically. Choose it again to restore the library.')
      }
    }

    void restoreSavedLibrary()
  }, [])

  async function chooseLibraryFolder() {
    const pickerWindow = window as DirectoryPickerWindow

    if (!pickerWindow.showDirectoryPicker) {
      setLibraryStatus('Folder-backed saving requires a Chromium browser with local file access support.')
      return null
    }

    try {
      const directoryHandle = await pickerWindow.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads',
      })

      directoryHandleRef.current = directoryHandle
      setLibraryFolderName(directoryHandle.name)
      await persistBreadboardLibraryHandle(directoryHandle)

      const nextBreadboards = await loadSavedBreadboards(directoryHandle)

      replaceSavedBreadboards(nextBreadboards)
      setLibraryStatus(`Saving breadboard images into ${directoryHandle.name}.`)

      if (nextBreadboards.length > 0) {
        clearTemporaryImage()
        setCurrentBreadboardName((currentName) => currentName ?? nextBreadboards[0].name)
      }

      return directoryHandle
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null
      }

      setLibraryStatus('Could not open the folder you selected.')
      return null
    }
  }

  async function refreshBreadboardLibrary(
    directoryHandle: FileSystemDirectoryHandle,
    preferredBreadboardName?: string,
  ) {
    const nextBreadboards = await loadSavedBreadboards(directoryHandle)

    replaceSavedBreadboards(nextBreadboards)
    clearTemporaryImage()

    const nextSelectedBreadboard =
      nextBreadboards.find((breadboard) => breadboard.name === preferredBreadboardName) ??
      nextBreadboards.find((breadboard) => breadboard.name === currentBreadboardName) ??
      nextBreadboards[0]

    setCurrentBreadboardName(nextSelectedBreadboard?.name)

    return nextBreadboards
  }

  async function handleImageSelected(file: File) {
    const directoryHandle = directoryHandleRef.current ?? (await chooseLibraryFolder())

    if (!directoryHandle) {
      clearTemporaryImage()
      setTemporaryImage({
        name: file.name,
        url: URL.createObjectURL(file),
      })
      setCurrentBreadboardName(undefined)
      setLibraryStatus('Image loaded for this tab only. Choose a folder to keep reusable copies.')
      return
    }

    try {
      const savedFileName = await saveBreadboardImageToFolder(directoryHandle, file)
      const nextBreadboards = await refreshBreadboardLibrary(directoryHandle, savedFileName)

      setLibraryStatus(
        `Saved ${savedFileName} to ${directoryHandle.name}${nextBreadboards.length > 1 ? ` with ${nextBreadboards.length} boards available.` : '.'}`,
      )
    } catch {
      clearTemporaryImage()
      setTemporaryImage({
        name: file.name,
        url: URL.createObjectURL(file),
      })
      setCurrentBreadboardName(undefined)
      setLibraryStatus('The folder could not be written to. The image is loaded temporarily in this tab.')
    }
  }

  function handleSavedBreadboardSelected(breadboardName: string) {
    clearTemporaryImage()
    setCurrentBreadboardName(breadboardName)
  }

  const savedBreadboardCountLabel = `${savedBreadboards.length} saved`

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Project workspace">
        <section className="workspace-top">
          <section className="sidebar-intro workspace-copy">
            <p className="eyebrow">Breadboard Projects</p>
            <h1>Diagram your hardware project with a clean visual workspace.</h1>
            <p className="header-copy">
              Save breadboard screenshots into a reusable local library, then swap
              between them as you work on different builds.
            </p>
          </section>

          <section className="workspace-panel workspace-panel--secondary">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Inspector</p>
                <h2>Project details</h2>
              </div>
            </div>
            <div className="inspector-card">
              <p className="inspector-label">Current image</p>
              <p className="inspector-value">{imageName ?? 'No breadboard selected yet'}</p>
              <p className="inspector-label">Library folder</p>
              <p className="inspector-value">{libraryFolderName ?? 'Not connected'}</p>
            </div>
          </section>

          <section className="workspace-panel workspace-panel--secondary">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Library</p>
                <h2>Saved boards</h2>
              </div>
              <span className="panel-status">{savedBreadboardCountLabel}</span>
            </div>
            <div className="library-panel">
              <button type="button" className="action-button" onClick={() => void chooseLibraryFolder()}>
                {libraryFolderName ? 'Change folder' : 'Choose folder'}
              </button>
              <p className="library-status">{libraryStatus}</p>
              {savedBreadboards.length > 0 ? (
                <div className="saved-board-list" aria-label="Saved breadboard library">
                  {savedBreadboards.map((breadboard) => (
                    <button
                      key={breadboard.name}
                      type="button"
                      className={`saved-board-card${breadboard.name === currentBreadboardName ? ' saved-board-card--active' : ''}`}
                      onClick={() => handleSavedBreadboardSelected(breadboard.name)}
                    >
                      <img
                        className="saved-board-thumbnail"
                        src={breadboard.url}
                        alt={`Saved breadboard ${breadboard.name}`}
                      />
                      <span className="saved-board-name">{breadboard.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="blank-state blank-state--library">
                  <p>No saved breadboards yet. The next uploaded image will be copied into your chosen folder.</p>
                </div>
              )}
            </div>
          </section>
        </section>

        <section className="workspace-panel workspace-panel--primary workspace-panel--breadboard">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Breadboard View</p>
              <h2>Main board</h2>
              <span className="panel-status panel-status--board">
                {imageSrc ? imageName ?? 'Image loaded' : 'Select an image'}
              </span>
            </div>
          </div>
          <BreadboardCanvas imageSrc={imageSrc} onImageSelected={handleImageSelected} />
        </section>
      </section>
    </main>
  )
}

export default App
