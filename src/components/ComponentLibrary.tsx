import { useState } from 'react'

import {
  COMPONENT_CATALOG,
  type CatalogCategoryId,
} from '../lib/componentCatalog'
import type { BreadboardDefinition } from '../lib/breadboardDefinitionModel'

type ComponentLibraryTabId = 'breadboards' | CatalogCategoryId

type ComponentLibraryProps = {
  definitions: BreadboardDefinition[]
  isBusy: boolean
  isDefinitionBusy: boolean
  onAddBreadboard: () => void
  onOpenDefinition: (definitionId: string) => void
}

const TABS: Array<{ id: ComponentLibraryTabId; label: string }> = [
  { id: 'breadboards', label: 'Breadboards' },
  { id: 'microcontrollers', label: 'Microcontrollers' },
  { id: 'sbc', label: 'Single-Board Computers' },
  { id: 'modules', label: 'Modules' },
  { id: 'passives', label: 'Passives' },
  { id: 'leds', label: 'LEDs & Indicators' },
  { id: 'sensors', label: 'Sensors' },
]

export function ComponentLibrary({
  definitions,
  isBusy,
  isDefinitionBusy,
  onAddBreadboard,
  onOpenDefinition,
}: ComponentLibraryProps) {
  const [activeTab, setActiveTab] = useState<ComponentLibraryTabId>('breadboards')

  const activeCategory =
    activeTab === 'breadboards'
      ? null
      : COMPONENT_CATALOG.find((category) => category.id === activeTab) ?? null

  return (
    <div className="component-library">
      <nav
        className="component-library__tabs"
        role="tablist"
        aria-label="Component categories"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`component-library__tab${
              activeTab === tab.id ? ' component-library__tab--active' : ''
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'breadboards' ? (
        <section className="component-library__panel" aria-label="Breadboards">
          <header className="component-library__panel-header">
            <div>
              <h2 className="component-library__panel-title">Breadboards</h2>
              <p className="component-library__panel-blurb">
                The base of every project. Add a photo of your breadboard, mark its pin
                holes once, and reuse it across projects.
              </p>
            </div>
            <button
              type="button"
              className="action-button"
              onClick={onAddBreadboard}
              disabled={isBusy}
            >
              Add breadboard
            </button>
          </header>
          {definitions.length === 0 ? (
            <div className="home-screen__empty">
              <h2>No breadboards yet.</h2>
              <p>
                Click <strong>Add breadboard</strong> to upload an image, align it, and
                mark each pin hole. The breadboard becomes a single saved object you can
                wire up later.
              </p>
            </div>
          ) : (
            <ul
              className="home-screen__list"
              aria-label="Saved breadboard list"
            >
              {definitions.map((definition) => (
                <li key={definition.id} className="home-screen__card">
                  <div className="home-screen__card-body">
                    <h3 className="home-screen__card-title">{definition.name}</h3>
                    <p className="home-screen__card-meta">
                      {definition.points.length} pin hole
                      {definition.points.length === 1 ? '' : 's'}
                      {' \u00b7 '}
                      {definition.imageName}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="action-button action-button--ghost"
                    onClick={() => onOpenDefinition(definition.id)}
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

      {activeCategory ? (
        <section className="component-library__panel" aria-label={activeCategory.label}>
          <header className="component-library__panel-header">
            <div>
              <h2 className="component-library__panel-title">{activeCategory.label}</h2>
              <p className="component-library__panel-blurb">{activeCategory.blurb}</p>
            </div>
          </header>
          <ul
            className="component-library__catalog"
            aria-label={`${activeCategory.label} catalog`}
          >
            {activeCategory.items.map((item) => (
              <li key={item.id} className="component-library__catalog-card">
                <div className="component-library__catalog-body">
                  <h3 className="component-library__catalog-title">{item.name}</h3>
                  <p className="component-library__catalog-description">
                    {item.description}
                  </p>
                  <div className="component-library__catalog-meta">
                    {typeof item.pinCount === 'number' ? (
                      <span className="component-library__pill">
                        {item.pinCount} pin{item.pinCount === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {item.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="component-library__pill component-library__pill--tag"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="action-button action-button--ghost"
                  disabled
                  title="Coming soon - placement on breadboards is in development."
                >
                  Coming soon
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
