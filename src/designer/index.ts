export { Designer } from './Designer'
export {
  DEFAULT_DESIGNER_CONFIG,
  DEFAULT_PRODUCTS,
  createInitialProjectState,
} from './defaults'
export { DESIGNER_ACTIONS, DESIGNER_EVENT_NAMES } from './events'
export {
  UploadValidator,
  type ValidationError,
  type ValidationSuccess,
} from './services/uploadService'
export {
  CanvasRenderer,
  type RenderConfig,
} from './services/canvasRenderer'
export { WarningEngine } from './services/warningService'
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
  ExportState,
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