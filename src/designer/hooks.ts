import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createInitialProjectState,
  DEFAULT_DESIGNER_CONFIG,
} from './defaults'
import { DESIGNER_ACTIONS } from './events'
import { designerReducer, type DesignerAction } from './reducer'
import {
  UploadValidator,
  type AssetMetadata,
  type ValidationSuccess,
  type ValidationError,
} from './services/uploadService'
import {
  CanvasRenderer,
  DEFAULT_LIGHTING_STRENGTH,
  DEFAULT_REALISM_STRENGTH,
  type RenderConfig,
} from './services/canvasRenderer'
import { WarningEngine } from './services/warningService'
import {
  createExportManifestDataUrl,
  createExportVerificationPayload,
  type ExportVerificationManifest,
} from './services/exportVerification'
import type {
  DesignerConfig,
  DesignerWarning,
  ExportPreviewPlacementCalibration,
  ExportVerificationDesignInput,
  ExportVerificationPayload,
  ExportVerificationToken,
  PrintAreaBounds,
  ProductTemplate,
  ProjectState,
} from './types'

export interface PreviewFrame {
  id: string
  angleId: string
  angleLabel: string
  colorId: string
  colorLabel: string
  variant: 'mockup' | 'print-area'
  dataUrl: string
  width: number
  height: number
}

export interface PreviewAngleCalibration {
  offsetX: number
  offsetY: number
  scale: number
  rotationDeg: number
}

const DEFAULT_PREVIEW_ANGLE_CALIBRATION: PreviewAngleCalibration = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotationDeg: 0,
}

const applyAngleCalibrationToState = (
  state: ProjectState,
  printArea: PrintAreaBounds,
  calibration?: PreviewAngleCalibration,
): ProjectState => {
  if (!calibration) {
    return state
  }

  const centerX = printArea.x + printArea.width / 2
  const centerY = printArea.y + printArea.height / 2

  return {
    ...state,
    elements: state.elements.map((element) => {
      const dx = element.transform.x - centerX
      const dy = element.transform.y - centerY

      return {
        ...element,
        transform: {
          ...element.transform,
          x: centerX + dx * calibration.scale + calibration.offsetX,
          y: centerY + dy * calibration.scale + calibration.offsetY,
          scaleX: element.transform.scaleX * calibration.scale,
          scaleY: element.transform.scaleY * calibration.scale,
          rotationDeg: element.transform.rotationDeg + calibration.rotationDeg,
        },
      }
    }),
  }
}

const PRINT_BLEED_PX = 18
const PRINT_EXTRA_PADDING_PX = 12
const PRINT_PREVIEW_RESOLUTION_SCALE = 2

const loadImageFromSrc = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image source'))
    img.src = src
  })
}

const createPrintAreaPreview = async (
  state: ProjectState,
  printArea: PrintAreaBounds,
  colorHex: string,
): Promise<{ dataUrl: string; width: number; height: number }> => {
  const bleed = PRINT_BLEED_PX
  const padding = PRINT_EXTRA_PADDING_PX
  const width = printArea.width + bleed * 2 + padding * 2
  const height = printArea.height + bleed * 2 + padding * 2
  const renderScale = PRINT_PREVIEW_RESOLUTION_SCALE

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * renderScale))
  canvas.height = Math.max(1, Math.round(height * renderScale))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
  }

  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.fillStyle = colorHex
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const originX = padding + bleed - printArea.x
  const originY = padding + bleed - printArea.y

  for (const element of state.elements) {
    if (!element.visible || element.type !== 'image') continue
    const asset = state.assets[element.assetId]
    if (!asset) continue

    try {
      const image = await loadImageFromSrc(asset.data)
      const { transform } = element
      ctx.save()
      ctx.translate(originX + transform.x, originY + transform.y)
      ctx.rotate((transform.rotationDeg * Math.PI) / 180)
      ctx.scale(transform.scaleX, transform.scaleY)
      ctx.globalAlpha = element.opacity
      ctx.drawImage(image, -image.width / 2, -image.height / 2, image.width, image.height)
      ctx.restore()
    } catch {
      // Ignore failed asset draw for print preview composition.
    }
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  }
}

export interface ExportArtifact {
  filename: string
  dataUrl: string
  angleId: string
  angleLabel: string
  colorId: string
  colorLabel: string
  width: number
  height: number
}

export interface ExportVerificationState {
  status: 'idle' | 'verifying' | 'verified' | 'unverified' | 'failed'
  token?: ExportVerificationToken
  manifestDataUrl?: string
}

export interface InteractionHud {
  mode: 'resize' | 'rotate'
  point: { x: number; y: number }
  width: number
  height: number
  scaleX: number
  scaleY: number
  rotationDeg: number
}

export const useDesignerState = (
  initialProject?: ProjectState,
  initialConfig: DesignerConfig = DEFAULT_DESIGNER_CONFIG,
) => {
  const [state, setState] = useState<ProjectState>(
    initialProject ?? createInitialProjectState(initialConfig),
  )
  const stateRef = useRef(state)
  const undoStackRef = useRef<ProjectState[]>([])
  const redoStackRef = useRef<ProjectState[]>([])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const cloneProject = useCallback((project: ProjectState): ProjectState => {
    return structuredClone(project)
  }, [])

  const shouldTrackHistory = useCallback((action: DesignerAction): boolean => {
    switch (action.type) {
      case DESIGNER_ACTIONS.PRODUCT_SET:
      case DESIGNER_ACTIONS.COLORS_SET:
      case DESIGNER_ACTIONS.PRINT_AREA_SET:
      case DESIGNER_ACTIONS.ASSET_UPLOAD_SUCCESS:
      case DESIGNER_ACTIONS.ELEMENT_ADD:
      case DESIGNER_ACTIONS.ELEMENT_REMOVE:
      case DESIGNER_ACTIONS.ELEMENT_TRANSFORM_UPDATE:
      case DESIGNER_ACTIONS.ELEMENT_RESET_TRANSFORM:
      case DESIGNER_ACTIONS.AUTOSAVE_RESTORE:
        return true
      default:
        return false
    }
  }, [])

  const withHistoryState = useCallback((project: ProjectState): ProjectState => {
    return {
      ...project,
      history: {
        canUndo: undoStackRef.current.length > 0,
        canRedo: redoStackRef.current.length > 0,
      },
    }
  }, [])

  const performAction = useCallback(
    (action: DesignerAction) => {
      if (action.type === DESIGNER_ACTIONS.HISTORY_UNDO) {
        if (undoStackRef.current.length === 0) return

        const current = stateRef.current
        const previous = undoStackRef.current.pop()
        if (!previous) return

        redoStackRef.current.push(cloneProject(current))
        const resolved = withHistoryState(previous)
        stateRef.current = resolved
        setState(resolved)
        return
      }

      if (action.type === DESIGNER_ACTIONS.HISTORY_REDO) {
        if (redoStackRef.current.length === 0) return

        const current = stateRef.current
        const next = redoStackRef.current.pop()
        if (!next) return

        undoStackRef.current.push(cloneProject(current))
        const resolved = withHistoryState(next)
        stateRef.current = resolved
        setState(resolved)
        return
      }

      const current = stateRef.current
      const next = designerReducer(current, action)

      if (next === current) {
        return
      }

      if (shouldTrackHistory(action) && action.type !== DESIGNER_ACTIONS.AUTOSAVE_RESTORE) {
        undoStackRef.current.push(cloneProject(current))
        if (undoStackRef.current.length > initialConfig.history.maxDepth) {
          undoStackRef.current.shift()
        }
        redoStackRef.current = []
      }

      if (action.type === DESIGNER_ACTIONS.AUTOSAVE_RESTORE) {
        undoStackRef.current = []
        redoStackRef.current = []
      }

      const resolved = withHistoryState(next)
      stateRef.current = resolved
      setState(resolved)
    },
    [cloneProject, initialConfig.history.maxDepth, shouldTrackHistory, withHistoryState],
  )

  return {
    state,
    dispatch: performAction,
    selectors: {
      selectedElement: state.elements.find(
        (element) => element.id === state.selection.elementId,
      ),
      selectedColors: state.selectedColorIds,
    },
  }
}

export const useHistory = (
  state: ProjectState,
  dispatch: (action: DesignerAction) => void,
) => {
  const undo = useCallback(() => {
    dispatch({ type: DESIGNER_ACTIONS.HISTORY_UNDO })
  }, [dispatch])

  const redo = useCallback(() => {
    dispatch({ type: DESIGNER_ACTIONS.HISTORY_REDO })
  }, [dispatch])

  return {
    canUndo: state.history.canUndo,
    canRedo: state.history.canRedo,
    undo,
    redo,
  }
}

export const useWarnings = (
  state: ProjectState,
  config: DesignerConfig = DEFAULT_DESIGNER_CONFIG,
  product: any,
  assetMetadata?: AssetMetadata,
): { warnings: DesignerWarning[]; acknowledge: (id: string) => void; recompute: () => undefined } => {
  const engineRef = useRef(new WarningEngine(config))

  const warnings = useMemo(() => {
    if (!product) return []
    return engineRef.current.evaluate(state, product, assetMetadata)
  }, [state, product, assetMetadata, config])

  return {
    warnings,
    acknowledge: useCallback(
      (_id: string) => {
        // Mark warning as acknowledged - wired to reducer
      },
      [],
    ),
    recompute: () => undefined,
  }
}

export const usePreviewRenderer = (
  state: ProjectState,
  config: DesignerConfig = DEFAULT_DESIGNER_CONFIG,
  product: ProductTemplate,
  tuning: { realismStrength: number; lightingStrength: number } = {
    realismStrength: DEFAULT_REALISM_STRENGTH,
    lightingStrength: DEFAULT_LIGHTING_STRENGTH,
  },
  angleCalibrations: Record<string, PreviewAngleCalibration> = {},
) => {
  const [isRendering, setIsRendering] = useState(false)
  const [frames, setFrames] = useState<PreviewFrame[]>([])
  const renderTokenRef = useRef(0)
  const debounceTimerRef = useRef<number | null>(null)

  const renderPreviews = useCallback(async () => {
    const renderToken = ++renderTokenRef.current

    if (!product) {
      setFrames([])
      return
    }

    setIsRendering(true)
    try {
      const printArea = product.printAreas[state.activePrintAreaId]
      if (!printArea) {
        setFrames([])
        return
      }

      const selectedColors = state.selectedColorIds.length
        ? state.selectedColorIds
        : product.colors.slice(0, 1).map((color) => color.id)

      const nextFrames: PreviewFrame[] = []

      for (const colorId of selectedColors) {
        const color = product.colors.find((item) => item.id === colorId)
        if (!color) continue

        const previewState: ProjectState = {
          ...state,
          selectedColorIds: [colorId],
        }

        for (const angle of config.anglePresets) {
          const canvas = document.createElement('canvas')
          const renderer = new CanvasRenderer(canvas)

          const calibratedState = applyAngleCalibrationToState(
            previewState,
            printArea,
            angleCalibrations[angle.id] ?? DEFAULT_PREVIEW_ANGLE_CALIBRATION,
          )
          await renderer.render(calibratedState, product, {
            showSafeArea: false,
            showPrintBounds: false,
            showSelection: false,
            clipToPrintArea: true,
            printAreaCalibration: angleCalibrations[angle.id] ?? DEFAULT_PREVIEW_ANGLE_CALIBRATION,
            quality: 'preview',
            scale: Math.max(0.5, angle.zoomDefault),
            renderMode: 'realistic',
            realismStrength: tuning.realismStrength,
            lightingStrength: tuning.lightingStrength,
          })

          if (renderTokenRef.current !== renderToken) {
            return
          }

          nextFrames.push({
            id: `${angle.id}-${colorId}-${previewState.projectId}`,
            angleId: angle.id,
            angleLabel: angle.label,
            colorId,
            colorLabel: color.label,
            variant: 'mockup',
            dataUrl: renderer.getDataURL('png'),
            width: canvas.width,
            height: canvas.height,
          })
        }

        const printAreaPreview = await createPrintAreaPreview(
          {
            ...state,
            selectedColorIds: [colorId],
          },
          printArea,
          color.hex,
        )

        nextFrames.push({
          id: `print-${colorId}-${state.projectId}`,
          angleId: 'print-area',
          angleLabel: 'Print Area',
          colorId,
          colorLabel: color.label,
          variant: 'print-area',
          dataUrl: printAreaPreview.dataUrl,
          width: printAreaPreview.width,
          height: printAreaPreview.height,
        })
      }

      if (renderTokenRef.current === renderToken) {
        setFrames(nextFrames)
      }
    } finally {
      if (renderTokenRef.current === renderToken) {
        setIsRendering(false)
      }
    }
  }, [angleCalibrations, config.anglePresets, product, state, tuning.lightingStrength, tuning.realismStrength])

  useEffect(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = window.setTimeout(() => {
      void renderPreviews()
    }, Math.max(0, config.performance.previewThrottleMs))

    return () => {
      renderTokenRef.current += 1
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current)
      }
    }
  }, [config.performance.previewThrottleMs, renderPreviews])

  return {
    isRendering,
    previews: frames,
    renderPreviews,
    getPreview: (angleId: string, colorId: string) =>
      frames.find((frame) => frame.angleId === angleId && frame.colorId === colorId) ?? null,
  }
}

export const useExportPipeline = (
  previews: PreviewFrame[],
  options: {
    projectId: string
    productId: ProductTemplate['id']
    state: ProjectState
    product: ProductTemplate
    previewPlacementByAngle: Record<string, ExportPreviewPlacementCalibration>
    requestExportVerification?: (payload: ExportVerificationPayload) => Promise<ExportVerificationToken>
  },
) => {
  const [progress, setProgress] = useState({ total: 0, completed: 0, failed: 0 })
  const [result, setResult] = useState<ExportArtifact[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [verification, setVerification] = useState<ExportVerificationState>({ status: 'idle' })

  const start = useCallback(async () => {
    setIsRunning(true)
    setErrors([])
    setResult(null)
    setVerification({ status: 'idle' })
    setProgress({ total: previews.length, completed: 0, failed: 0 })

    const exports: ExportArtifact[] = []
    let completed = 0
    let failed = 0

    for (const preview of previews) {
      try {
        exports.push({
          filename: `export-${preview.angleId}-${preview.colorId}.png`,
          dataUrl: preview.dataUrl,
          angleId: preview.angleId,
          angleLabel: preview.angleLabel,
          colorId: preview.colorId,
          colorLabel: preview.colorLabel,
          width: preview.width,
          height: preview.height,
        })
        completed += 1
      } catch (error) {
        failed += 1
        setErrors((current) => [
          ...current,
          error instanceof Error ? error.message : 'Export failed',
        ])
      }

      setProgress({ total: previews.length, completed, failed })
    }

    setResult(exports)

    if (exports.length > 0) {
      setVerification({ status: 'verifying' })

      try {
        const designInputs: ExportVerificationDesignInput[] = options.state.elements
          .map((element) => {
            const asset = options.state.assets[element.assetId]
            if (!asset) return null
            return {
              elementId: element.id,
              assetId: element.assetId,
              filename: asset.filename,
              mimeType: asset.mimeType,
              width: asset.width,
              height: asset.height,
              data: asset.data,
              transform: element.transform,
              opacity: element.opacity,
              visible: element.visible,
              locked: element.locked,
            }
          })
          .filter((value): value is ExportVerificationDesignInput => Boolean(value))

        const printArea = options.product.printAreas[options.state.activePrintAreaId]
        if (!printArea) {
          throw new Error('Missing active print area for export verification')
        }

        const payload = await createExportVerificationPayload(
          options.projectId,
          options.productId,
          options.state.activePrintAreaId,
          printArea,
          designInputs,
          options.previewPlacementByAngle,
          exports,
        )

        let token: ExportVerificationToken | undefined
        let status: ExportVerificationState['status'] = 'unverified'

        if (options.requestExportVerification) {
          token = await options.requestExportVerification(payload)
          status = 'verified'
        }

        const manifest: ExportVerificationManifest = {
          payload,
          token,
        }

        setVerification({
          status,
          token,
          manifestDataUrl: createExportManifestDataUrl(manifest),
        })
      } catch (error) {
        setVerification({ status: 'failed' })
        setErrors((current) => [
          ...current,
          error instanceof Error ? error.message : 'Failed to build export verification manifest',
        ])
      }
    }

    setIsRunning(false)
  }, [options.previewPlacementByAngle, options.product, options.productId, options.projectId, options.requestExportVerification, options.state, previews])

  const cancel = useCallback(() => {
    setIsRunning(false)
  }, [])

  return {
    progress,
    result,
    errors,
    isRunning,
    verification,
    start,
    cancel,
  }
}

export const useAutosave = (
  state: ProjectState,
  dispatch: (action: DesignerAction) => void,
  config: DesignerConfig = DEFAULT_DESIGNER_CONFIG,
) => {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'restored'>('idle')
  const hasRestoredRef = useRef(false)
  const saveTimeoutRef = useRef<number | null>(null)
  const storageKey = `${config.autosave.keyPrefix}:${state.projectId}`

  useEffect(() => {
    if (!config.autosave.enabled || hasRestoredRef.current) return
    hasRestoredRef.current = true

    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return

      const parsed = JSON.parse(raw) as ProjectState
      dispatch({
        type: DESIGNER_ACTIONS.AUTOSAVE_RESTORE,
        payload: { project: parsed },
      })
      setSaveStatus('restored')
    } catch {
      setSaveStatus('error')
    }
  }, [config.autosave.enabled, dispatch, storageKey])

  useEffect(() => {
    if (!config.autosave.enabled) return

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current)
    }

    setSaveStatus((current) => (current === 'restored' ? 'restored' : 'saving'))
    saveTimeoutRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state))
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, config.autosave.debounceMs)

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [config.autosave.debounceMs, config.autosave.enabled, state, storageKey])

  return {
    saveStatus,
    restore: () => {
      try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return
        const parsed = JSON.parse(raw) as ProjectState
        dispatch({
          type: DESIGNER_ACTIONS.AUTOSAVE_RESTORE,
          payload: { project: parsed },
        })
        setSaveStatus('restored')
      } catch {
        setSaveStatus('error')
      }
    },
    clearDraft: () => {
      localStorage.removeItem(storageKey)
      setSaveStatus('idle')
    },
  }
}

export const useAssetUpload = () => {
  const validatorRef = useRef(new UploadValidator())
  const [isValidating, setIsValidating] = useState(false)

  return {
    upload: useCallback(
      async (file: File): Promise<ValidationSuccess | ValidationError> => {
        setIsValidating(true)
        try {
          return await validatorRef.current.validate(file)
        } finally {
          setIsValidating(false)
        }
      },
      [],
    ),
    isValidating,
  }
}

export const useCanvasRenderer = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  state: ProjectState,
  product: any,
  _config: DesignerConfig = DEFAULT_DESIGNER_CONFIG,
) => {
  const rendererRef = useRef<CanvasRenderer | null>(null)

  return {
    render: useCallback(
      (renderConfig: Partial<RenderConfig> = {}) => {
        if (!canvasRef.current) return
        if (!rendererRef.current) {
          rendererRef.current = new CanvasRenderer(canvasRef.current)
        }
        const finalConfig: RenderConfig = {
          showSafeArea: true,
          showPrintBounds: true,
          showSelection: true,
          clipToPrintArea: true,
          printAreaCalibration: undefined,
          quality: 'preview',
          scale: 1,
          renderMode: 'flat',
          realismStrength: DEFAULT_REALISM_STRENGTH,
          lightingStrength: DEFAULT_LIGHTING_STRENGTH,
          ...renderConfig,
        }
        rendererRef.current.render(state, product, finalConfig)
      },
      [state, product, canvasRef],
    ),
    exportImage: useCallback(
      (format: 'png' | 'jpg' = 'png') => {
        if (!rendererRef.current) return null
        return rendererRef.current.getDataURL(format)
      },
      [],
    ),
  }
}

export const useCanvasInteraction = (
  dispatch: (action: DesignerAction) => void,
  project: ProjectState,
  _config: DesignerConfig = DEFAULT_DESIGNER_CONFIG,
) => {
  const [cursor, setCursor] = useState<string>('default')
  const [hud, setHud] = useState<InteractionHud | null>(null)
  const minScale = 0.001
  const rotationSnapDeg = 15

  const dragStateRef = useRef<{
    mode: 'idle' | 'move' | 'resize' | 'rotate'
    handle: 'nw' | 'ne' | 'sw' | 'se' | 'rotate' | null
    elementId: string
    startPoint: { x: number; y: number }
    startTransform: { x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number }
    startVector?: { x: number; y: number }
  }>({
    mode: 'idle',
    handle: null,
    elementId: '',
    startPoint: { x: 0, y: 0 },
    startTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 },
  })

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const scaleX = event.currentTarget.width / rect.width
    const scaleY = event.currentTarget.height / rect.height

    // Canvas is scaled 2x for high DPI, so divide by 2 to get logical coordinates
    return {
      x: ((event.clientX - rect.left) * scaleX) / 2,
      y: ((event.clientY - rect.top) * scaleY) / 2,
    }
  }, [])

  const hitTestElement = useCallback(
    (x: number, y: number) => {
      const selected = project.elements.find(
        (element) => element.id === project.selection.elementId,
      )

      const candidates = selected
        ? [selected, ...project.elements.filter((element) => element.id !== selected.id)]
        : project.elements

      return candidates.find((element) => {
        const asset = project.assets[element.assetId]
        const halfWidth = ((asset?.width ?? 100) * element.transform.scaleX) / 2
        const halfHeight = ((asset?.height ?? 100) * element.transform.scaleY) / 2

        return (
          x >= element.transform.x - halfWidth &&
          x <= element.transform.x + halfWidth &&
          y >= element.transform.y - halfHeight &&
          y <= element.transform.y + halfHeight
        )
      })
    },
    [project.assets, project.elements, project.selection.elementId],
  )

  const getElementMetrics = useCallback(
    (elementId: string) => {
      const element = project.elements.find((item) => item.id === elementId)
      if (!element) return null

      const asset = project.assets[element.assetId]
      const width = (asset?.width ?? 100) * element.transform.scaleX
      const height = (asset?.height ?? 100) * element.transform.scaleY

      return {
        element,
        asset,
        width,
        height,
        halfWidth: width / 2,
        halfHeight: height / 2,
      }
    },
    [project.assets, project.elements],
  )

  const worldToLocal = useCallback(
    (point: { x: number; y: number }, elementId: string) => {
      const metrics = getElementMetrics(elementId)
      if (!metrics) return null

      const { element, halfWidth, halfHeight } = metrics
      const transform = element.transform
      const dx = point.x - transform.x
      const dy = point.y - transform.y
      const angle = (-transform.rotationDeg * Math.PI) / 180
      const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle)
      const rotatedY = dx * Math.sin(angle) + dy * Math.cos(angle)

      return {
        x: rotatedX,
        y: rotatedY,
        width: halfWidth * 2,
        height: halfHeight * 2,
      }
    },
    [getElementMetrics],
  )

  const hitTestHandle = useCallback(
    (point: { x: number; y: number }, elementId: string) => {
      const local = worldToLocal(point, elementId)
      if (!local) return null

      const metrics = getElementMetrics(elementId)
      if (!metrics) return null

      const { halfWidth, halfHeight } = metrics
      const handleRadius = 14
      const rotateHandleY = -halfHeight - 24

      const handlePoints = [
        { name: 'nw' as const, x: -halfWidth, y: -halfHeight },
        { name: 'ne' as const, x: halfWidth, y: -halfHeight },
        { name: 'sw' as const, x: -halfWidth, y: halfHeight },
        { name: 'se' as const, x: halfWidth, y: halfHeight },
        { name: 'rotate' as const, x: 0, y: rotateHandleY },
      ]

      return handlePoints.find((handle) => {
        const distance = Math.hypot(local.x - handle.x, local.y - handle.y)
        return distance <= handleRadius
      })?.name ?? null
    },
    [getElementMetrics, worldToLocal],
  )

  const getResizeCursor = useCallback((handle: 'nw' | 'ne' | 'sw' | 'se' | 'rotate' | null) => {
    if (handle === 'nw' || handle === 'se') return 'nwse-resize'
    if (handle === 'ne' || handle === 'sw') return 'nesw-resize'
    if (handle === 'rotate') return 'grab'
    return 'default'
  }, [])

  return {
    cursor,
    onPointerDown: useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const point = getCanvasPoint(e)

        const selectedElement = project.elements.find(
          (element) => element.id === project.selection.elementId,
        )

        if (selectedElement) {
          const handle = hitTestHandle(point, selectedElement.id)
          if (handle) {
            const metrics = getElementMetrics(selectedElement.id)
            if (!metrics) return

            dragStateRef.current.mode = handle === 'rotate' ? 'rotate' : 'resize'
            dragStateRef.current.handle = handle
            dragStateRef.current.elementId = selectedElement.id
            dragStateRef.current.startPoint = point
            dragStateRef.current.startTransform = { ...selectedElement.transform }
            dragStateRef.current.startVector = {
              x: point.x - selectedElement.transform.x,
              y: point.y - selectedElement.transform.y,
            }
            setCursor(handle === 'rotate' ? 'grabbing' : getResizeCursor(handle))

            e.currentTarget.setPointerCapture(e.pointerId)
            return
          }
        }

        const hit = hitTestElement(point.x, point.y)

        if (!hit) {
          dispatch({
            type: DESIGNER_ACTIONS.ELEMENT_SELECT,
            payload: { elementId: undefined },
          })
          setCursor('default')
          return
        }

        dragStateRef.current.mode = 'move'
        dragStateRef.current.handle = null
        dragStateRef.current.elementId = hit.id
        dragStateRef.current.startPoint = point
        dragStateRef.current.startTransform = { ...hit.transform }
        dragStateRef.current.startVector = undefined
        setCursor('grabbing')

        dispatch({
          type: DESIGNER_ACTIONS.ELEMENT_SELECT,
          payload: { elementId: hit.id },
        })

        e.currentTarget.setPointerCapture(e.pointerId)
      },
      [dispatch, getCanvasPoint, getElementMetrics, hitTestElement, hitTestHandle, project.elements, project.selection.elementId],
    ),
    onPointerMove: useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const point = getCanvasPoint(e)

        if (dragStateRef.current.mode === 'idle') {
          setHud(null)
          const selectedElement = project.elements.find(
            (element) => element.id === project.selection.elementId,
          )

          if (selectedElement) {
            const handle = hitTestHandle(point, selectedElement.id)
            if (handle) {
              setCursor(getResizeCursor(handle))
              return
            }
          }

          const hit = hitTestElement(point.x, point.y)
          setCursor(hit ? 'move' : 'default')
          return
        }

        const metrics = getElementMetrics(dragStateRef.current.elementId)
        if (!metrics) return

        const dx = point.x - dragStateRef.current.startPoint.x
        const dy = point.y - dragStateRef.current.startPoint.y

        if (dragStateRef.current.mode === 'move') {
          setHud(null)
          setCursor('grabbing')
          dispatch({
            type: DESIGNER_ACTIONS.ELEMENT_TRANSFORM_UPDATE,
            payload: {
              elementId: dragStateRef.current.elementId,
              x: dragStateRef.current.startTransform.x + dx,
              y: dragStateRef.current.startTransform.y + dy,
              scaleX: dragStateRef.current.startTransform.scaleX,
              scaleY: dragStateRef.current.startTransform.scaleY,
              rotationDeg: dragStateRef.current.startTransform.rotationDeg,
            },
          })
          return
        }

        if (dragStateRef.current.mode === 'rotate') {
          setCursor('grabbing')
          const startAngle = Math.atan2(
            dragStateRef.current.startPoint.y - dragStateRef.current.startTransform.y,
            dragStateRef.current.startPoint.x - dragStateRef.current.startTransform.x,
          )
          const currentAngle = Math.atan2(
            point.y - dragStateRef.current.startTransform.y,
            point.x - dragStateRef.current.startTransform.x,
          )
          const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI
          const rawRotation = dragStateRef.current.startTransform.rotationDeg + deltaDeg
          const snappedRotation = Math.round(rawRotation / rotationSnapDeg) * rotationSnapDeg

          setHud({
            mode: 'rotate',
            point,
            width: metrics.width,
            height: metrics.height,
            scaleX: dragStateRef.current.startTransform.scaleX,
            scaleY: dragStateRef.current.startTransform.scaleY,
            rotationDeg: snappedRotation,
          })

          dispatch({
            type: DESIGNER_ACTIONS.ELEMENT_TRANSFORM_UPDATE,
            payload: {
              elementId: dragStateRef.current.elementId,
              x: dragStateRef.current.startTransform.x,
              y: dragStateRef.current.startTransform.y,
              scaleX: dragStateRef.current.startTransform.scaleX,
              scaleY: dragStateRef.current.startTransform.scaleY,
              rotationDeg: snappedRotation,
            },
          })
          return
        }

        if (dragStateRef.current.mode === 'resize') {
          setCursor(getResizeCursor(dragStateRef.current.handle))
          const { startTransform, elementId } = dragStateRef.current
          const localPoint = worldToLocal(point, elementId)
          const assetWidth = metrics.asset?.width ?? 100
          const assetHeight = metrics.asset?.height ?? 100
          const baseHalfWidth = Math.max(1, assetWidth / 2)
          const baseHalfHeight = Math.max(1, assetHeight / 2)

          if (!localPoint) return

          const rawScaleX = Math.abs(localPoint.x) / baseHalfWidth
          const rawScaleY = Math.abs(localPoint.y) / baseHalfHeight

          let nextScaleX = Math.max(minScale, rawScaleX)
          let nextScaleY = Math.max(minScale, rawScaleY)

          if (e.shiftKey) {
            const locked = Math.max(minScale, (nextScaleX + nextScaleY) / 2)
            nextScaleX = locked
            nextScaleY = locked
          }

          setHud({
            mode: 'resize',
            point,
            width: assetWidth * nextScaleX,
            height: assetHeight * nextScaleY,
            scaleX: nextScaleX,
            scaleY: nextScaleY,
            rotationDeg: startTransform.rotationDeg,
          })

          dispatch({
            type: DESIGNER_ACTIONS.ELEMENT_TRANSFORM_UPDATE,
            payload: {
              elementId: dragStateRef.current.elementId,
              x: startTransform.x,
              y: startTransform.y,
              scaleX: nextScaleX,
              scaleY: nextScaleY,
              rotationDeg: startTransform.rotationDeg,
            },
          })
        }
      },
      [dispatch, getCanvasPoint, getElementMetrics, getResizeCursor, hitTestElement, hitTestHandle, minScale, project.elements, project.selection.elementId, rotationSnapDeg, worldToLocal],
    ),
    onPointerUp: useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      dragStateRef.current.mode = 'idle'
      dragStateRef.current.handle = null
      dragStateRef.current.elementId = ''
      dragStateRef.current.startVector = undefined
      setHud(null)
      setCursor('default')
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // noop
      }
    }, []),
    onPointerLeave: useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragStateRef.current.mode !== 'idle') {
        dragStateRef.current.mode = 'idle'
        dragStateRef.current.handle = null
        dragStateRef.current.elementId = ''
        dragStateRef.current.startVector = undefined
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // noop
        }
      }
      setHud(null)
      setCursor('default')
    }, []),
    hud,
  }
}

export const useTelemetry = () => {
  return {
    emit: (_name: string, _payload?: Record<string, unknown>) => undefined,
  }
}