# Contributing to Sunset Drift

Thanks for taking the time to contribute. The project is intentionally small:
vanilla ES modules, procedural assets and no runtime dependencies. Keep it that
way unless there is a clear reason not to.

## Before you start

- Search existing [issues](https://github.com/ybenbrai/cars/issues) and pull
  requests to avoid duplicate work.
- For large features, open an issue first so the design can be discussed.
- Report security problems privately — see [SECURITY.md](SECURITY.md).

## Local setup

```bash
git clone git@github.com:ybenbrai/cars.git
cd cars
npm install        # creates the lockfile; there are no runtime dependencies
npm start          # http://localhost:5173
```

Node.js 18 or newer is required. Node 20 is used in CI.

## Quality gates

Run these before opening a pull request:

```bash
npm run check      # syntax, JSON, local references, asset presence
npm test           # unit tests for the server and car data
npm run build      # produces dist/ and verifies the deployable bundle
```

A pull request should also include a short manual test note covering the
screens or mechanics you touched. See [docs/TESTING.md](docs/TESTING.md) for the
full test matrix.

## Code style

- Use ES modules and the existing two-space indentation.
- Keep the runtime dependency-free. Three.js is loaded through the import map.
- Never edit generated artifacts in `dist/`; change the source and rebuild.
- Preserve the fixed-timestep physics loop (`1 / 120`) and frame-time clamp.
- Prefer procedural geometry and canvas-generated textures over binary assets.
- Dispose of geometries and materials when replacing cars or scene objects.
- Match the existing naming style: `camelCase` for functions and variables,
  `PascalCase` for classes, `SCREAMING_SNAKE_CASE` for module constants.
- Keep DOM access inside `ui.js`, `hud.js` or `main.js`; gameplay modules should
  stay renderer/DOM-light.
- Add a unit test when changing data normalization, server behavior or another
  pure function.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add reverse-layout circuit variant
fix: keep drift bank when crossing the finish line
docs: document nitro pickups
perf: cache minimap path geometry
```

## Adding a car

1. Add an entry to `CARS` in `js/data/cars.js` with unique `id`, stats, pros,
   cons, physics modifiers and body dimensions.
2. Give it a default paint and a sensible default spoiler.
3. Check the garage turntable, stat bars, plate and all customization options.
4. Race a full lap and verify the car does not clip the track walls.
5. Update the car table in [README.md](README.md) and
   [docs/GAMEPLAY.md](docs/GAMEPLAY.md).

## Adding a cosmetic option

1. Add the option to the relevant palette in `js/data/cars.js`.
2. Handle the new value in `normalizeLook` validation.
3. Apply it in `js/carModel.js` (or the relevant sub-builder).
4. Make sure old saved profiles still load and invalid values fall back.
5. Verify the option appears in the customization UI automatically.
6. Add or update a test in `tests/cars.test.mjs`.

## Pull request checklist

- [ ] The change is focused and described clearly.
- [ ] `npm run check`, `npm test` and `npm run build` pass.
- [ ] I tested the affected flow in a browser.
- [ ] I updated documentation and the changelog when relevant.
- [ ] I did not commit `dist/`, `node_modules/` or local screenshots.
- [ ] I did not introduce a runtime dependency without prior discussion.

## License

By contributing, you agree that your contribution is licensed under the
project's [MIT License](LICENSE).
