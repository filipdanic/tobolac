# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains library source code.
- `src/cache/` holds cache orchestration (`createCache`, settings resolution, layer read/write flow).
- `src/layer1/` contains Layer 1 in-memory cache logic.
- `src/layer2/` contains Layer 2 SQLite adapters and runtime-specific wrappers (`adapter/`, `driver/`).
- `test/` contains Vitest suites; shared helpers live in `test/helpers/`.

## Build, Test, and Development Commands

Via bun (primary):
- `bun test` unit tests
- `bun run test:integration` black-box integration tests
- `bun run typecheck` runs strict TypeScript checks with no emit
- `bun run build` builds distributable output with `tsup` into `dist/`.

Via node:
- `npm run test` runs the same tests in Node for runtime parity
- `npm run test:integration` runs black-box integration tests against real SQLite

## Coding Style & Naming Conventions

- Language: TypeScript (ESM), strict typing enabled.
- Keep modules focused and small; prefer clear boundaries (`cache`, `layer1`, `layer2`).
- Use existing terminology consistently: `namespace`, `layer1`, `layer2`.
- Follow repository filename patterns (kebab-case module files).
- Avoid introducing runtime-specific behavior without isolating it in `src/layer2/adapter/` or `src/layer2/driver/` boundaries.

## Testing Guidelines

- Framework: Vitest (`test/*.test.ts`).
- Add tests for behavior changes and edge cases, not only happy paths.
- For cache changes, validate both:
  - namespace isolation and layer behavior
  - Node/Bun compatibility (`npm run test` and `bun test`)

## Runtime Notes

- Node Layer 2 uses `better-sqlite3`.
- Bun Layer 2 uses Bun SQLite adapter behavior; keep parameter/SQL compatibility in mind when modifying adapters.
- By default, internal SQLite Layer 2 is wrapped in a write-behind driver; passing a custom `driver` bypasses that wrapper.
