# Skribble Designer

Production-oriented React designer package with:

- headless state/actions and rendering core
- React bindings and hooks
- debug playground panel
- export verification + multipart payload builder

## Package Goals

The package is structured internally as:

- `designer/core` for logic/services/types
- `designer/react` for React-facing hooks/components
- `designer/debug` for a full debug UI/playground panel

But consumers import from one public package entry (the current `src/designer/index.ts` export surface).

## Public API (Single Entry)

Main exports include:

- `Designer` (full editor shell)
- `DebugDesignerPanel` (debug/playground panel)
- core defaults and reducer tools (`DEFAULT_DESIGNER_CONFIG`, `designerReducer`, etc.)
- renderer/services (`CanvasRenderer`, `UploadValidator`, `WarningEngine`)
- React hooks (`useDesignerState`, `usePreviewRenderer`, `useExportPipeline`, `useMultipartExport`, etc.)
- all shared types (`ProjectState`, `DesignerConfig`, export verification types)

You can also access namespaced internal groups from the same entry:

- `import { core, react, debug } from '.../designer'`

## Quick Start

```tsx
import {
  Designer,
  DEFAULT_DESIGNER_CONFIG,
  createInitialProjectState,
} from './src/designer'

export function MyPage() {
  return (
    <Designer
      initialConfig={DEFAULT_DESIGNER_CONFIG}
      initialProject={createInitialProjectState(DEFAULT_DESIGNER_CONFIG)}
    />
  )
}
```

## Production Integration Pattern

For productized usage, prefer wiring your own UI around hooks instead of using the full shell.

Recommended flow:

1. `useDesignerState` for source of truth
2. custom action buttons for `Undo`, `Redo`, `Save`, `Export`
3. `useCanvasRenderer` for editor canvas
4. `usePreviewRenderer` for angle/color previews
5. `useExportPipeline` for generated exports + verification manifest
6. `useMultipartExport` for final API payload submission

## Export + Multipart Payload

`useMultipartExport` builds a complete multipart payload for backend ingestion.

Includes:

- rendered preview/export files (`renders`)
- original uploaded assets (`assets`)
- metadata JSON with:
  - project/product/print area info
  - transforms/position/rotation/scale per element
  - per-angle preview placement calibration
- optional verification manifest/token fields

Example:

```ts
const multipart = useMultipartExport({
  state,
  product,
  previewPlacementByAngle,
  verification,
})

const formData = multipart.toFormData(exportArtifacts)
await fetch('/api/shop/uploads', {
  method: 'POST',
  body: formData,
})
```

## Verification Model

`useExportPipeline` computes export hashes and can request a signed verification token through `requestExportVerification`.

When provided, verification payload includes:

- per-render SHA-256
- combined hash
- nonce
- design input metadata (assets + transforms)
- per-angle placement calibration

This enables backend trust checks before accepting production shop jobs.

## Debug Playground and GitHub Pages

- Use `DebugDesignerPanel` for local debugging and calibration sessions.
- Keep this panel in a separate playground app/page for GitHub Pages demos.
- Suggested: publish a lightweight static app that imports `debug` exports only.

## Styling Strategy

Current debug/full shell uses utility classes for speed, but package consumers should not rely on those styles.

For production library mode:

- treat shell as debug-only
- wire headless hooks/components in your own design system
- avoid coupling app CSS to package internals

## Internal Implementation Notes

Renderer reliability hardening already includes:

- preview debounce + cancellation
- cache pruning / invalidation
- high-resolution print-area preview rendering
- guardrails for huge assets

Preview calibration supports per-angle:

- offset X/Y
- scale
- rotation

These calibrations are used in both preview composition and export metadata.

## LLM / Agent Instructions

Use this section when instructing an AI coding agent to integrate the package.

### Agent Task Checklist

1. Import from one entry (`designer/index` export surface).
2. Prefer hooks and headless integration for production UI.
3. Wire button actions to state/command hooks:
   - undo/redo
   - upload
   - save/restore
   - export start
4. Generate previews with `usePreviewRenderer`.
5. Build verified export artifacts with `useExportPipeline`.
6. Build multipart upload using `useMultipartExport`.
7. Send `FormData` to backend and validate server response.

### Agent Do / Don’t

Do:

- preserve `ProjectState` as source of truth
- include all assets and transforms in backend payloads
- pass verification token/manifest when available

Don’t:

- re-encode or strip original uploaded assets before multipart submission
- drop calibration metadata for angle-based preview production
- hardcode package internals instead of consuming exported APIs

### Minimal Agent Example Plan

- create `DesignerProvider` wrapper in host app
- render custom toolbar with host buttons
- mount editor canvas + preview panel
- add export button calling:
  1. `start()` from export pipeline
  2. `toFormData()` from multipart hook
  3. backend POST

## Development Commands

- `npm run dev`
- `npm run test`
- `npm run build`

## Current Scope

This repository contains implementation and docs for the unified package surface and debug-first app setup.

## Release Process (First-Time Setup)

This package publishes as `@skribble/designer` from GitHub repo `LetsSkribble/designer` using GitHub Actions.

### 1) Create GitHub repository and connect local repo

1. Create the repo in GitHub org: `LetsSkribble/designer`.
2. In this local project, set the remote and push:

```bash
git remote add origin https://github.com/LetsSkribble/designer.git
git branch -M main
git push -u origin main
```

If `origin` already exists, use:

```bash
git remote set-url origin https://github.com/LetsSkribble/designer.git
git push -u origin main
```

### 2) Configure npm org/package access

1. Ensure npm org `@skribble` exists and your npm user has publish rights.
2. Sign in locally and verify org access:

```bash
npm login
npm org ls skribble
```

3. (Optional) Verify package name availability:

```bash
npm view @skribble/designer version
```

If that command returns `E404`, the package has not been published yet (expected for first release).

### 3) Configure npm trusted publishing

1. In npm, open the `@skribble` org settings and configure a Trusted Publisher for this repo/workflow.
2. Provider: GitHub Actions.
3. Repository: `LetsSkribble/designer`.
4. Workflow: `.github/workflows/publish.yml`.
5. Package/scope: `@skribble/designer`.

If npm UI blocks trusted publisher setup before first package publish in your org, do a one-time manual publish, then return and enable trusted publishing for all future releases.

### 4) Prepare first release commit

1. Choose initial version:

```bash
npm version 0.1.0
```

2. Push commit + tag:

```bash
git push
git push --tags
```

### 5) Publish via GitHub Release

1. In GitHub, create a Release from the version tag (for example `v0.1.0`).
2. Publishing the release triggers `.github/workflows/publish.yml`.
3. Workflow runs: install, test, build library, then `npm publish`.

### 6) Verify publish

After workflow succeeds:

```bash
npm view @skribble/designer version
```

### Ongoing release flow

For each release:

1. `npm version patch` (or `minor` / `major`)
2. `git push && git push --tags`
3. Create GitHub Release for that tag
4. Confirm publish on npm
