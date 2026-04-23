# breadboard_projects

Breadboard Projects is a React app for diagramming ESP32, Arduino, and Raspberry Pi breadboard builds. This first phase delivers a polished workspace shell with a dedicated breadboard view on the left and two reserved panels on the right for future project metadata and component tooling.

## Phase 1 scope

- Render the main breadboard workspace.
- Prompt the user to supply a screenshot when no breadboard image is available.
- Keep the right-side panels present but intentionally blank.
- Include regression-oriented UI tests with Vitest and Testing Library.

## Scripts

- `npm run dev` starts the Vite development server.
- `npm run build` creates a production build.
- `npm run lint` runs ESLint.
- `npm run test` starts Vitest in watch mode.
- `npm run test:run` runs the test suite once.

## GitHub remote

Use the repository remote below once local git is initialized:

`https://github.com/Inouye165/breadboard_projects.git`

## Next phase ideas

- Accept uploaded breadboard screenshots.
- Layer pin, wire, and component overlays on top of the board image.
- Store reusable project layouts for different hardware platforms.
