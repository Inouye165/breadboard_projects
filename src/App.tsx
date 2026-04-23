import './App.css'
import { BreadboardCanvas } from './components/BreadboardCanvas'

function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Breadboard Projects</p>
          <h1>Diagram your hardware project with a clean visual workspace.</h1>
        </div>
        <p className="header-copy">
          Start by supplying a breadboard screenshot. This first phase keeps the
          workspace focused on presenting the board clearly before wiring and
          annotation tools are added.
        </p>
      </header>

      <section className="workspace" aria-label="Project workspace">
        <section className="workspace-panel workspace-panel--primary">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Breadboard View</p>
              <h2>Main board</h2>
            </div>
            <span className="panel-status">Awaiting screenshot</span>
          </div>
          <BreadboardCanvas />
        </section>

        <section className="workspace-sidebar" aria-label="Secondary panels">
          <section className="workspace-panel workspace-panel--secondary">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Inspector</p>
                <h2>Project details</h2>
              </div>
            </div>
            <div className="blank-state" aria-hidden="true"></div>
          </section>

          <section className="workspace-panel workspace-panel--secondary">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Library</p>
                <h2>Components</h2>
              </div>
            </div>
            <div className="blank-state" aria-hidden="true"></div>
          </section>
        </section>
      </section>
    </main>
  )
}

export default App
