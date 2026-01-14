# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the extension source: `popup.tsx` (popup UI), `content.tsx` (content script), and feature modules under `src/features/` (e.g., `count-button.tsx`).
- `src/style.css` holds global styles; Tailwind utilities are used in JSX class names.
- `assets/` stores static assets for the extension.
- `build/` is the Plasmo output directory created by `pnpm build` or `pnpm dev` (e.g., `build/chrome-mv3-dev`).

## Build, Test, and Development Commands
- `pnpm dev`: start the Plasmo dev server and build a live-reload extension bundle for local testing.
- `pnpm build`: create a production build for store submission.
- `pnpm package`: package the production build into a distributable archive.

## Coding Style & Naming Conventions
- TypeScript + React with functional components; JSX files use `.tsx`.
- Indentation is 2 spaces and semicolons are omitted (match existing style).
- Component names use `PascalCase` (e.g., `CountButton`), file names are `kebab-case` (e.g., `count-button.tsx`).
- Prettier is available with `@ianvs/prettier-plugin-sort-imports`; keep imports grouped and sorted.

## Testing Guidelines
- No test framework is currently configured. If you add tests, document the runner and add a `test` script in `package.json`.
- Prefer colocating tests near features (e.g., `src/features/__tests__/feature.test.tsx`) and use clear, behavior-driven names.

## Commit & Pull Request Guidelines
- Git history is minimal and does not establish a commit message convention; use concise, imperative messages (e.g., "Add options page").
- Pull requests should include a short summary, testing steps (manual or automated), and screenshots or screen recordings for UI changes.

## Security & Configuration Tips
- Extension permissions live in the `manifest` field within `package.json`; keep host permissions as narrow as possible.
- When adding new pages (options, content, background), follow Plasmo conventions so builds pick them up automatically.
