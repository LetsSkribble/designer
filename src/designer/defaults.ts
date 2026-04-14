import type {
  DesignerConfig,
  ProductTemplate,
  ProjectState,
} from './types'

export const DEFAULT_PRODUCTS: ProductTemplate[] = [
  {
    id: 'tshirt',
    label: 'T-shirt',
    colors: [
      { id: 'white', label: 'White', hex: '#ffffff' },
      { id: 'black', label: 'Black', hex: '#111111' },
      { id: 'navy', label: 'Navy', hex: '#1e2a78' },
    ],
    printAreas: {
      front: { x: 90, y: 90, width: 220, height: 260, safeMargin: 14 },
    },
    templateImageUrl: '/templates/tshirt-front-1.png',
    mockupSize: { width: 440, height: 520 },
  },
  {
    id: 'hoodie',
    label: 'Hoodie',
    colors: [
      { id: 'white', label: 'White', hex: '#ffffff' },
      { id: 'black', label: 'Black', hex: '#111111' },
      { id: 'heather', label: 'Heather Gray', hex: '#8a8f98' },
    ],
    printAreas: {
      front: { x: 90, y: 96, width: 220, height: 250, safeMargin: 14 },
    },
    templateImageUrl: '/templates/hoodie-front.svg',
    mockupSize: { width: 440, height: 520 },
  },
]

export const DEFAULT_DESIGNER_CONFIG: DesignerConfig = {
  products: DEFAULT_PRODUCTS,
  anglePresets: [
    { id: 'front', label: 'Front', zoomDefault: 1 },
    { id: 'left', label: 'Left', zoomDefault: 1 },
    { id: 'right', label: 'Right', zoomDefault: 1 },
    { id: 'closeup', label: 'Close-up', zoomDefault: 2 },
  ],
  export: {
    formats: ['png'],
    defaultWidth: 2000,
    defaultHeight: 2000,
    filenameTemplate: '{project}_{product}_{color}_{angle}_{width}x{height}',
  },
  history: {
    maxDepth: 100,
    groupTransformMs: 120,
  },
  warnings: {
    enableLowContrast: true,
    enablePatchRisk: true,
    enableInkCoverage: true,
  },
  autosave: {
    enabled: true,
    debounceMs: 600,
    keyPrefix: 'designer-draft',
  },
  dpi: {
    target: 300,
    warning: 220,
    blocking: 150,
  },
  performance: {
    previewThrottleMs: 120,
    maxConcurrentRenders: 2,
  },
  featureFlags: {
    multiLayer: false,
    textTool: false,
    backPrintArea: false,
  },
}

export const createInitialProjectState = (
  config: DesignerConfig = DEFAULT_DESIGNER_CONFIG,
): ProjectState => {
  const firstProduct = config.products[0]
  const firstColor = firstProduct?.colors[0]

  return {
    projectId: crypto.randomUUID(),
    schemaVersion: '1.0.0',
    productId: firstProduct.id,
    selectedColorIds: firstColor ? [firstColor.id] : [],
    activePrintAreaId: 'front',
    elements: [],
    assets: {},
    selection: {},
    view: { zoom: 1, panX: 0, panY: 0 },
    warnings: [],
    history: { canUndo: false, canRedo: false },
    export: {
      status: 'idle',
      progress: { total: 0, completed: 0, failed: 0 },
      outputFiles: [],
    },
    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userAcknowledgments: [],
    },
  }
}