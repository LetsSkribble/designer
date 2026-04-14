export type ProductId = 'tshirt' | 'hoodie'

export type PrintAreaId = 'front'

export type ColorId = string

export type AnglePresetId = 'front' | 'left' | 'right' | 'closeup'

export type WarningType =
  | 'DPI_LOW'
  | 'OUT_OF_BOUNDS'
  | 'SAFE_AREA_RISK'
  | 'LOW_CONTRAST'
  | 'OPAQUE_BG_RISK'
  | 'INK_COVERAGE_HIGH'

export type WarningSeverity = 'info' | 'warning' | 'blocking'

export interface Transform2D {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotationDeg: number
  origin: 'center'
}

export interface DesignElement {
  id: string
  type: 'image'
  assetId: string
  transform: Transform2D
  opacity: number
  visible: boolean
  locked: boolean
}

export interface AssetMetadata {
  id: string
  filename: string
  mimeType: string
  width: number
  height: number
  hasAlpha: boolean
  dominantColor?: string
  opaqueBackgroundRatio: number
  data: string
  uploadedAt: number
}

export interface WarningTargetRef {
  elementId?: string
  colorId?: ColorId
  areaId?: PrintAreaId
}

export interface DesignerWarning {
  id: string
  type: WarningType
  severity: WarningSeverity
  message: string
  targetRef?: WarningTargetRef
  metrics?: Record<string, number | string>
  acknowledged: boolean
  createdAt: number
}

export interface ProductColorVariant {
  id: ColorId
  label: string
  hex: string
}

export interface PrintAreaBounds {
  x: number
  y: number
  width: number
  height: number
  safeMargin: number
}

export interface ProductTemplate {
  id: ProductId
  label: string
  colors: ProductColorVariant[]
  printAreas: Record<PrintAreaId, PrintAreaBounds>
  templateImageUrl: string
  mockupSize: {
    width: number
    height: number
  }
}

export interface AnglePreset {
  id: AnglePresetId
  label: string
  zoomDefault: number
}

export interface ExportConfig {
  formats: Array<'png' | 'jpg'>
  defaultWidth: number
  defaultHeight: number
  filenameTemplate: string
}

export interface HistoryConfig {
  maxDepth: number
  groupTransformMs: number
}

export interface WarningConfig {
  enableLowContrast: boolean
  enablePatchRisk: boolean
  enableInkCoverage: boolean
}

export interface AutosaveConfig {
  enabled: boolean
  debounceMs: number
  keyPrefix: string
}

export interface DpiConfig {
  target: number
  warning: number
  blocking: number
}

export interface PerformanceConfig {
  previewThrottleMs: number
  maxConcurrentRenders: number
}

export interface FeatureFlags {
  multiLayer: boolean
  textTool: boolean
  backPrintArea: boolean
}

export interface DesignerConfig {
  products: ProductTemplate[]
  anglePresets: AnglePreset[]
  export: ExportConfig
  history: HistoryConfig
  warnings: WarningConfig
  autosave: AutosaveConfig
  dpi: DpiConfig
  performance: PerformanceConfig
  featureFlags: FeatureFlags
}

export interface ExportProgress {
  total: number
  completed: number
  failed: number
}

export interface ExportItem {
  productId: ProductId
  colorId: ColorId
  angleId: AnglePresetId
  width: number
  height: number
  format: 'png' | 'jpg'
}

export interface ExportState {
  status: 'idle' | 'planning' | 'running' | 'completed' | 'failed' | 'canceled'
  progress: ExportProgress
  currentItem?: ExportItem
  outputFiles: string[]
  manifestPath?: string
}

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
}

export interface ProjectState {
  projectId: string
  schemaVersion: string
  productId: ProductId
  selectedColorIds: ColorId[]
  activePrintAreaId: PrintAreaId
  elements: DesignElement[]
  assets: Record<string, AssetMetadata>
  selection: { elementId?: string }
  view: { zoom: number; panX: number; panY: number }
  warnings: DesignerWarning[]
  history: HistoryState
  export: ExportState
  meta: {
    createdAt: number
    updatedAt: number
    userAcknowledgments: string[]
  }
}

export interface ExportVerificationItem {
  filename: string
  angleId: string
  colorId: string
  width: number
  height: number
  sha256: string
}

export interface ExportVerificationDesignInput {
  elementId: string
  assetId: string
  filename: string
  mimeType: string
  width: number
  height: number
  data: string
  transform: Transform2D
  opacity: number
  visible: boolean
  locked: boolean
}

export interface ExportPreviewPlacementCalibration {
  offsetX: number
  offsetY: number
  scale: number
  rotationDeg: number
}

export interface ExportVerificationPayload {
  projectId: string
  productId: ProductId
  activePrintAreaId: PrintAreaId
  printArea: PrintAreaBounds
  nonce: string
  generatedAt: number
  itemCount: number
  combinedSha256: string
  items: ExportVerificationItem[]
  designInputs: ExportVerificationDesignInput[]
  previewPlacementByAngle: Record<string, ExportPreviewPlacementCalibration>
}

export interface ExportVerificationToken {
  token: string
  keyId?: string
  expiresAt?: number
}

export type InteractionMode = 'select' | 'pan' | 'transform'

export interface DesignerAppProps {
  initialConfig: DesignerConfig
  initialProject?: ProjectState
  className?: string
  onProjectChange?: (project: ProjectState) => void
  onEvent?: (event: DesignerDomainEvent) => void
  requestExportVerification?: (
    payload: ExportVerificationPayload,
  ) => Promise<ExportVerificationToken>
}

export type DesignerDomainEventName =
  | 'DESIGNER_LOADED'
  | 'PRODUCT_CHANGED'
  | 'COLOR_SELECTION_CHANGED'
  | 'ASSET_UPLOADED'
  | 'TRANSFORM_CHANGED'
  | 'DPI_WARNING_RAISED'
  | 'OPAQUE_BG_WARNING_RAISED'
  | 'LOW_CONTRAST_WARNING_RAISED'
  | 'WARNING_RESOLVED'
  | 'EXPORT_STARTED'
  | 'EXPORT_ITEM_RENDERED'
  | 'EXPORT_COMPLETED'
  | 'EXPORT_FAILED'
  | 'UNDO_PERFORMED'
  | 'REDO_PERFORMED'

export interface DesignerDomainEvent {
  name: DesignerDomainEventName
  projectId: string
  timestamp: number
  actor: 'user' | 'system'
  context?: {
    productId?: ProductId
    colorId?: ColorId
    areaId?: PrintAreaId
  }
  metrics?: Record<string, number | string>
}