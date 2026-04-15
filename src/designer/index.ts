export * as core from './core'
export * as react from './react'
export * as debug from './debug'

export {
  Designer,
  PreviewPanel,
  type PreviewPanelProps,
  type PreviewPanelPreviewItem,
} from './Designer'
export { DebugDesignerPanel, type DebugDesignerPanelProps } from './debug'
export {
  DEFAULT_DESIGNER_CONFIG,
  DEFAULT_PRODUCTS,
  createInitialProjectState,
} from './defaults'
export { DESIGNER_ACTIONS, DESIGNER_EVENT_NAMES } from './events'
export {
  useAssetUpload,
  useAutosave,
  useCanvasInteraction,
  useCanvasRenderer,
  useDesignerState,
  useExportPipeline,
  useHistory,
  useMultipartExport,
  usePreviewRenderer,
  useTelemetry,
  useWarnings,
  type ExportArtifact,
  type ExportVerificationState,
  type InteractionHud,
  type PreviewAngleCalibration,
  type PreviewFrame,
} from './hooks'
export {
  UploadValidator,
  type ValidationError,
  type ValidationSuccess,
} from './services/uploadService'
export {
  CanvasRenderer,
  DEFAULT_LIGHTING_STRENGTH,
  DEFAULT_REALISM_STRENGTH,
  type RenderConfig,
} from './services/canvasRenderer'
export { WarningEngine } from './services/warningService'
export {
  createExportManifestDataUrl,
  createExportVerificationPayload,
  type ExportVerificationManifest,
} from './services/exportVerification'
export {
  buildMultipartExportPayload,
  dataUrlToBlob,
  type MultipartExportBuildInput,
  type MultipartExportPayload,
} from './services/multipartExport'
export {
  CommandStack,
  designerReducer,
  type DesignerAction,
  type DesignerCommand,
} from './reducer'
export type {
  AnglePreset,
  AnglePresetId,
  AssetMetadata,
  ColorId,
  DesignerAppProps,
  DesignerConfig,
  DesignerDomainEvent,
  DesignerDomainEventName,
  DesignerWarning,
  DesignElement,
  ExportConfig,
  ExportItem,
  ExportPreviewPlacementCalibration,
  ExportState,
  ExportVerificationDesignInput,
  ExportVerificationItem,
  ExportVerificationPayload,
  ExportVerificationToken,
  FeatureFlags,
  InteractionMode,
  PrintAreaBounds,
  PrintAreaId,
  ProductColorVariant,
  ProductId,
  ProductTemplate,
  ProjectState,
  Transform2D,
  WarningSeverity,
  WarningType,
} from './types'