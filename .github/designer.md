# Designer PRD + Architecture (React)
**Product:** Print-on-demand Designer (T-shirt + Hoodie)  
**Date:** 2026-04-12  
**Status:** Spec Lock v1 (implementation-ready)  
**Primary stack:** React + TypeScript + Canvas API + Tailwind CSS

---

## 1) Product Objective

Build a web-based designer where users can:
1. Upload artwork.
2. Place/scale/rotate it in print areas.
3. Preview on realistic T-shirt/Hoodie mockups and multiple angles.
4. Receive print-risk warnings (DPI, color/contrast, opaque background patch risk, out-of-bounds).
5. Export both:
   - Rendered product assets (marketplace images).
   - Print manifest with exact transform metadata for production.

---

## 2) Core Principles

1. **Print Reality First**
   - Default preview is print-realistic (not idealized compositing).
   - White-on-white, black-on-black, and all similar-tone combinations handled.

2. **Single Source of Truth**
   - One canonical project state.
   - All previews/exports derived from that state.

3. **Event-Driven Warnings**
   - Warning engine runs on upload, transform, product/color changes, export preparation.

4. **Deterministic Export**
   - Same inputs always produce identical outputs + metadata.

5. **SOLID-friendly Architecture**
   - Separate responsibilities across UI, domain services, renderer, and adapters.

---

## 3) In Scope (v1)

- Product types: `tshirt`, `hoodie`
- Product color selection (single + multi-color preview/export)
- Upload image (`png`, `jpg`, `jpeg`, `webp`)
- Canvas transforms: move, scale, rotate
- Safe area + print bounds visualization
- Undo/Redo
- Multi-angle preview (live front + throttled secondary)
- Zoom in preview panes
- Warning center (DPI + print risks)
- Export matrix (product x colors x angles) with progress
- Export metadata manifest with transform and quality flags
- Autosave local project + restore

## Out of Scope (v1)

- Full 3D simulation
- Real-time collaboration
- Checkout/cart/payment
- AI-generated designs

---

## 4) User Roles

1. **Creator/Seller (primary)**
   - Needs quick, accurate previews and export assets.
2. **Production Ops (secondary consumer of metadata)**
   - Needs transform fidelity and risk flags.

---

## 5) User Flows

### Flow A: Create and Export
1. Select product type.
2. Select garment color(s).
3. Upload artwork.
4. Edit placement in print area.
5. Inspect print-reality previews and warnings.
6. Resolve/acknowledge warnings.
7. Export all required angles/colors + manifest.

### Flow B: Quality Check
1. Change color to similar tone (e.g., white on white).
2. System raises visibility/background patch warnings.
3. User toggles print-reality zoom preview.
4. User accepts risk or changes asset.

---

## 6) Functional Features

## 6.1 Product & Variant
- Product selector: T-shirt/Hoodie.
- Color swatches per product template.
- Multi-select colors for batch preview/export.
- Preserve placement consistency per print area across color changes.

## 6.2 Editor
- Single image layer in v1 (data model supports future multi-layer).
- Transform controls:
  - Drag position
  - Scale (uniform default, optional unlock)
  - Rotate
- Snap-to-center guides.
- Print area and safe margin overlays.
- Reset transform.

## 6.3 Preview
- Live front preview at edit-rate.
- Secondary angles (left, right, close-up) update throttled.
- Zoom per preview tile.
- Print-reality rendering mode by default.

## 6.4 Warning Engine
- Effective DPI warning.
- Opaque/white background patch risk (any color pairing).
- Low contrast/visibility risk.
- Out-of-bounds and safe-area overlap.
- Heavy ink coverage info warning (optional v1 but recommended).

## 6.5 History
- Undo/Redo stack with grouped drag actions.
- Max depth configurable.
- History includes transform and relevant configuration changes.

## 6.6 Export
- Single export and batch export.
- Matrix: product x selected colors x selected angles.
- PNG (required), JPG (optional), transparent PNG where valid.
- File naming preset and deterministic ordering.
- Manifest file includes transform + quality + acknowledgments.

## 6.7 Persistence
- Autosave local draft.
- Restore on reload.
- Manual save version label (optional v1.1).

---

## 7) Non-Functional Requirements

- Responsive editing: target near 60 FPS on modern desktop.
- Preview consistency: editor vs export parity.
- Crash-safe autosave.
- Accessibility: keyboard controls + ARIA labels + contrast compliance.
- Browser support: Chrome/Edge/Firefox/Safari (latest stable versions).
- Observability: event logs for warnings and export failures.

---

## 8) React Architecture Plan

## 8.1 Layered Modules

1. **Presentation (React components)**
   - Pure UI, minimal business logic.

2. **Application Controllers (hooks/services)**
   - Orchestrate intent, async jobs, history, warnings.

3. **Domain Services**
   - Transform math, validation, risk analysis, export planning.

4. **Infrastructure**
   - Canvas renderer, storage adapter, file adapter, zip/export adapter.

## 8.2 High-Level Component Tree

- `DesignerApp`
  - `TopBar`
    - Product selector
    - Save status
  - `LeftPanel`
    - Upload panel
    - Layer/asset panel
    - Warning center
  - `CenterStage`
    - `EditorCanvas`
    - overlays: print bounds/safe area/guides
  - `RightPanel`
    - Transform controls
    - Color selector (single/multi mode)
    - Angle selector
    - Export controls
  - `PreviewStrip`
    - `PreviewTile[]` (front/left/right/zoom)
  - `FooterStatus`
    - DPI and warnings summary
    - Undo/Redo status

---

## 9) Component Contracts (Props + responsibilities)

### `DesignerApp`
- Owns composition and app-level providers.
- Props:
  - `initialConfig: DesignerConfig`
  - `initialProject?: ProjectState`

### `EditorCanvas`
- Renders editable artwork in print area.
- Props:
  - `project: ProjectState`
  - `activeAreaId: PrintAreaId`
  - `interactionMode: "select" | "pan" | "transform"`
  - `onTransformStart/Change/End`
  - `onSelectionChange`

### `ProductSelector`
- Props:
  - `products: ProductTemplate[]`
  - `selectedProductId: ProductId`
  - `onChange(productId)`

### `ColorSelector`
- Props:
  - `availableColors: ColorVariant[]`
  - `selectedColorIds: ColorId[]`
  - `mode: "single" | "multi"`
  - `onChange(colorIds)`

### `WarningCenter`
- Props:
  - `warnings: Warning[]`
  - `onAcknowledge(warningId)`
  - `onNavigateToIssue(ref)`

### `PreviewTile`
- Props:
  - `angle: AnglePreset`
  - `colorId: ColorId`
  - `renderMode: "print-reality"`
  - `zoom: number`
  - `onZoomChange`
  - `onOpenLargeView`

### `ExportPanel`
- Props:
  - `exportConfig: ExportConfig`
  - `warnings: Warning[]`
  - `onStartExport`
  - `onCancelExport`
  - `canExport: boolean`

---

## 10) Hook Plan (custom hooks)

### `useDesignerState()`
- Manages canonical project state and dispatch.
- Returns:
  - `state`, `dispatch`, selectors.

### `useHistory(state, dispatch, config)`
- Command history stack.
- API:
  - `undo()`, `redo()`, `canUndo`, `canRedo`, `pushCommand(command)`.

### `useWarnings(state, config)`
- Computes/runs warning rules on state changes.
- API:
  - `warnings`, `acknowledge(id)`, `recompute()`.

### `usePreviewRenderer(state, config)`
- Produces preview bitmaps for angles/colors.
- API:
  - `getPreview(angle, colorId)`, `isRendering`, `renderQueueState`.

### `useExportPipeline(state, config)`
- Plans and executes export jobs.
- API:
  - `start(jobConfig)`, `cancel()`, `progress`, `result`, `errors`.

### `useAutosave(state, storageAdapter, config)`
- Debounced local persistence and restore.
- API:
  - `saveStatus`, `restore()`, `clearDraft()`.

### `useAssetUpload(config)`
- Validates uploaded files and extracts metadata.
- API:
  - `upload(file) -> AssetMetadata | ValidationError`.

### `useCanvasInteraction(ref, dispatch)`
- Pointer interactions, snapping, transform gestures.

### `useTelemetry(eventBus)`
- Emits analytics/debug events from domain events.

---

## 11) State Model (Type Definitions - documentation)

- `ProjectState`
  - `projectId: string`
  - `schemaVersion: string`
  - `productId: "tshirt" | "hoodie"`
  - `selectedColorIds: string[]`
  - `activePrintAreaId: string`
  - `elements: DesignElement[]`
  - `selection: { elementId?: string }`
  - `view: { zoom: number, panX: number, panY: number }`
  - `warnings: Warning[]`
  - `history: HistoryState`
  - `export: ExportState`
  - `meta: { createdAt, updatedAt, userAcknowledgments }`

- `DesignElement`
  - `id: string`
  - `type: "image"`
  - `assetId: string`
  - `transform: Transform2D`
  - `opacity: number`
  - `visible: boolean`
  - `locked: boolean`
  - `blendMode: "normal"` (future extensible)

- `Transform2D`
  - `x: number` (px in print area space)
  - `y: number` (px in print area space)
  - `scaleX: number`
  - `scaleY: number`
  - `rotationDeg: number`
  - `origin: "center"`

- `Warning`
  - `id: string`
  - `type: "DPI_LOW" | "OUT_OF_BOUNDS" | "SAFE_AREA_RISK" | "LOW_CONTRAST" | "OPAQUE_BG_RISK" | "INK_COVERAGE_HIGH"`
  - `severity: "info" | "warning" | "blocking"`
  - `message: string`
  - `targetRef?: { elementId?, colorId?, areaId? }`
  - `metrics?: Record<string, number | string>`
  - `acknowledged: boolean`
  - `createdAt: number`

- `ExportState`
  - `status: "idle" | "planning" | "running" | "completed" | "failed" | "canceled"`
  - `progress: { total: number, completed: number, failed: number }`
  - `currentItem?: ExportItem`
  - `outputFiles: string[]`
  - `manifestPath?: string`

---

## 12) Action Catalog (Reducer/Command Intents)

- `PROJECT_INIT`
- `PRODUCT_SET`
- `COLORS_SET`
- `PRINT_AREA_SET`
- `ASSET_UPLOAD_REQUEST`
- `ASSET_UPLOAD_SUCCESS`
- `ASSET_UPLOAD_FAIL`
- `ELEMENT_ADD`
- `ELEMENT_SELECT`
- `ELEMENT_TRANSFORM_START`
- `ELEMENT_TRANSFORM_UPDATE`
- `ELEMENT_TRANSFORM_END`
- `ELEMENT_RESET_TRANSFORM`
- `GUIDES_TOGGLE`
- `WARNING_ACKNOWLEDGE`
- `HISTORY_UNDO`
- `HISTORY_REDO`
- `EXPORT_PLAN`
- `EXPORT_START`
- `EXPORT_PROGRESS`
- `EXPORT_COMPLETE`
- `EXPORT_FAIL`
- `AUTOSAVE_SUCCESS`
- `AUTOSAVE_RESTORE`

---

## 13) Domain Event Catalog

- `DESIGNER_LOADED`
- `PRODUCT_CHANGED`
- `COLOR_SELECTION_CHANGED`
- `ASSET_UPLOADED`
- `TRANSFORM_CHANGED`
- `DPI_WARNING_RAISED`
- `OPAQUE_BG_WARNING_RAISED`
- `LOW_CONTRAST_WARNING_RAISED`
- `WARNING_RESOLVED`
- `EXPORT_STARTED`
- `EXPORT_ITEM_RENDERED`
- `EXPORT_COMPLETED`
- `EXPORT_FAILED`
- `UNDO_PERFORMED`
- `REDO_PERFORMED`

Event payload must include:
- `projectId`, `timestamp`, `actor` (user/system), `context` (product/color/area), and relevant metrics.

---

## 14) Warning Rules (Print Risk Engine)

## 14.1 DPI Rule
- Compute effective DPI based on source pixels vs physical print size mapping.
- Thresholds:
  - `>= targetDPI`: pass
  - `< warningDPI`: warning
  - `< blockingDPI`: optional block (configurable)

## 14.2 Opaque Background / Patch Risk
- Detect alpha presence.
- Border and corner near-solid color analysis.
- Opaque area ratio estimation.
- Raise `OPAQUE_BG_RISK` for all garment colors where patch likely visible/feel-affecting.

## 14.3 Low Contrast Rule
- Compare artwork dominant luminance/chroma against garment color.
- Raise warning when visibility score below threshold.

## 14.4 Bounds Rule
- Any pixel outside print area => `OUT_OF_BOUNDS`.
- In risky margin zone => `SAFE_AREA_RISK`.

## 14.5 Acknowledgment Policy
- Export allowed with warnings by default.
- For configured `blocking` severity, export prevented unless resolved.

---

## 15) Preview Rendering Strategy

- Default mode: `print-reality`.
- Editing:
  - front angle real-time.
  - secondary angles throttled.
- Idle:
  - upgrade previews to higher quality.
- Zoom:
  - per tile (`1x`, `2x`, `4x`) for inspection.
- Color correctness:
  - apply garment overlays/texture/shading before final composite in preview.
- Never hide ink/patch artifacts in preview.

---

## 16) Export Contract

## 16.1 Output Assets
- For each selected `(product, color, angle)` render one image.
- Naming template (configurable):
  - `{project}_{product}_{color}_{angle}_{width}x{height}.png`

## 16.2 Manifest (required)
Include:
- Project metadata (`projectId`, `schemaVersion`, `createdAt`, `exportedAt`)
- Product and selected colors
- Print area definitions
- Source asset metadata
- Final transform parameters in:
  - print-area pixels
  - normalized coordinates (0..1)
- Effective DPI per element/output
- Warning snapshot + acknowledgment state
- Export matrix and generated files checksums (optional)

## 16.3 Transform Contract
- Origin fixed to `center`.
- Rotation in degrees, clockwise.
- Coordinates relative to print area top-left (px) + normalized.

---

## 17) Configuration Schema (DesignerConfig)

- `products: ProductTemplate[]`
- `anglePresets: AnglePreset[]`
- `dpi: { target, warning, blocking }`
- `history: { maxDepth, groupTransformMs }`
- `autosave: { enabled, debounceMs, keyPrefix }`
- `export: { formats, defaultWidth, defaultHeight, filenameTemplate }`
- `warnings: { enableLowContrast, enablePatchRisk, enableInkCoverage }`
- `performance: { previewThrottleMs, maxConcurrentRenders }`
- `featureFlags: { multiLayer, textTool, backPrintArea }`

---

## 18) SOLID Mapping (Implementation Guardrails)

- **S**: Separate modules for Upload, Transform, Preview, Warning, Export.
- **O**: New product templates/angles added via config, no core rewrites.
- **L**: Any `RenderableElement` obeys same transform/render interface.
- **I**: Small interfaces (`Transformable`, `Warnable`, `Exportable`).
- **D**: UI depends on abstract services/adapters, not concrete renderer internals.

---

## 19) Performance Plan

- Throttle secondary preview rendering.
- Offscreen canvas where supported.
- Batched state updates during drag.
- Export queue with bounded concurrency.
- Memory cap checks for large image uploads.
- Progressive quality refinement (interactive vs idle).

---

## 20) Testing Plan

## Unit
- Transform math.
- Warning rule calculations.
- Reducer action handling.
- Export plan matrix generation.

## Integration
- Upload -> edit -> warning -> export flow.
- Undo/Redo correctness across grouped transforms.
- Color switch consistency.

## Visual/Regression
- Snapshot compare for angle previews.
- Print-reality mode validations for known risky assets.

## E2E
- Full product workflow with multi-color batch export.
- Manifest correctness validation.

---

## 21) Telemetry & Observability

Track:
- Upload failures by reason.
- Warning rates by type.
- Export success/failure rate and duration.
- Undo/Redo usage.
- Most selected products/colors/angles.
- Performance metrics (render time, dropped frames indicator).

---

## 22) Milestones & Exit Criteria

## M1: Core Editor
- Product/color switch, upload, transform, front preview.
- Basic export + manifest.

## M2: Quality & Reliability
- Warning engine complete, undo/redo, autosave restore.
- Secondary angle previews.

## M3: Production-Ready Export
- Batch matrix export, robust error handling, deterministic naming.
- Performance hardening + telemetry.

Exit requires:
- Acceptance criteria pass.
- No P1 defects.
- Export parity validated against print pipeline sample.

---

## 23) Acceptance Criteria (Critical)

1. User can design on T-shirt/Hoodie and switch colors without state loss.
2. Preview always reflects print reality (including same-color and opaque-bg risks).
3. Warning engine raises accurate DPI/contrast/patch/bounds warnings.
4. Undo/Redo works for all transform operations.
5. Batch export generates all selected assets and manifest with exact transforms.
6. Manifest is sufficient for downstream print placement without manual correction.
7. Autosave restores last draft after reload.

---

## 24) Open Decisions (to finalize before implementation)

1. Front-only print area in v1, or front+back?
2. Blocking policy for low DPI and severe patch risk.
3. Required marketplace resolution presets.
4. Whether to include ZIP export in v1.
5. Minimum supported device performance baseline.

---