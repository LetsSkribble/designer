import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  useAutosave,
  useAssetUpload,
  useDesignerState,
  useExportPipeline,
  useHistory,
  useCanvasRenderer,
  useCanvasInteraction,
  type PreviewAngleCalibration,
  usePreviewRenderer,
  useWarnings,
} from './hooks'
import {
  DEFAULT_LIGHTING_STRENGTH,
  DEFAULT_REALISM_STRENGTH,
} from './services/canvasRenderer'
import { DESIGNER_ACTIONS } from './events'
import type { DesignerAction } from './reducer'
import type {
  DesignerAppProps,
  DesignerWarning,
  InteractionMode,
  PrintAreaBounds,
  ProductTemplate,
  ProjectState,
} from './types'

export const Designer = ({
  initialConfig,
  initialProject,
  className,
  onEvent,
  requestExportVerification,
}: DesignerAppProps) => {
  const { state, dispatch } = useDesignerState(initialProject, initialConfig)
  const { upload, isValidating } = useAssetUpload()
  const [uploadMessage, setUploadMessage] = useState('Choose an image to place on the canvas')
  const [lastAssetName, setLastAssetName] = useState<string | null>(null)
  const [previewRealismStrength, setPreviewRealismStrength] = useState(DEFAULT_REALISM_STRENGTH)
  const [previewLightingStrength, setPreviewLightingStrength] = useState(DEFAULT_LIGHTING_STRENGTH)
  const [activeCalibrationAngleId, setActiveCalibrationAngleId] = useState<string>(
    initialConfig.anglePresets[0]?.id ?? 'front',
  )
  const [previewAngleCalibrations, setPreviewAngleCalibrations] = useState<Record<string, PreviewAngleCalibration>>(() => {
    const entries = initialConfig.anglePresets.map((angle) => [
      angle.id,
      { offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 },
    ] as const)
    return Object.fromEntries(entries)
  })

  const currentProduct =
    initialConfig.products.find((product) => product.id === state.productId) ??
    initialConfig.products[0]
  const selectedElement = state.elements.find((element) => element.id === state.selection.elementId)
  const selectedAssetMetadata = selectedElement ? state.assets[selectedElement.assetId] : undefined

  const { warnings } = useWarnings(state, initialConfig, currentProduct, selectedAssetMetadata)
  const history = useHistory(state, dispatch)
  const preview = usePreviewRenderer(state, initialConfig, currentProduct, {
    realismStrength: previewRealismStrength,
    lightingStrength: previewLightingStrength,
  }, previewAngleCalibrations)
  const exportPipeline = useExportPipeline(preview.previews, {
    projectId: state.projectId,
    productId: state.productId,
    state,
    product: currentProduct,
    previewPlacementByAngle: previewAngleCalibrations,
    requestExportVerification,
  })
  const autosave = useAutosave(state, dispatch, initialConfig)

  const handleDeleteSelected = () => {
    if (!state.selection.elementId) return
    dispatch({
      type: DESIGNER_ACTIONS.ELEMENT_REMOVE,
      payload: { elementId: state.selection.elementId },
    })
  }

  const handleFitToSafeBounds = () => {
    if (!selectedElement) return

    const asset = state.assets[selectedElement.assetId]
    const printArea = currentProduct.printAreas[state.activePrintAreaId]
    if (!asset || !printArea) return

    const safeWidth = Math.max(1, printArea.width - printArea.safeMargin * 2)
    const safeHeight = Math.max(1, printArea.height - printArea.safeMargin * 2)
    const fitScale = Math.min(safeWidth / asset.width, safeHeight / asset.height)

    dispatch({
      type: DESIGNER_ACTIONS.ELEMENT_TRANSFORM_UPDATE,
      payload: {
        elementId: selectedElement.id,
        x: printArea.x + printArea.width / 2,
        y: printArea.y + printArea.height / 2,
        scaleX: fitScale,
        scaleY: fitScale,
        rotationDeg: 0,
      },
    })
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isTypingTarget = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable

      if (isTypingTarget) return

      const key = event.key.toLowerCase()
      const isMetaUndo = (event.ctrlKey || event.metaKey) && key === 'z'
      const isRedo =
        (event.ctrlKey || event.metaKey) && (key === 'y' || (event.shiftKey && key === 'z'))

      if (isMetaUndo) {
        event.preventDefault()
        if (event.shiftKey) {
          history.redo()
        } else {
          history.undo()
        }
        return
      }

      if (isRedo) {
        event.preventDefault()
        history.redo()
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection.elementId) {
        event.preventDefault()
        dispatch({
          type: DESIGNER_ACTIONS.ELEMENT_REMOVE,
          payload: { elementId: state.selection.elementId },
        })
        return
      }

      if (!selectedElement) return

      const moveStep = event.shiftKey ? 10 : 1
      const transform = selectedElement.transform

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()

        const deltaX = event.key === 'ArrowLeft' ? -moveStep : event.key === 'ArrowRight' ? moveStep : 0
        const deltaY = event.key === 'ArrowUp' ? -moveStep : event.key === 'ArrowDown' ? moveStep : 0

        dispatch({
          type: DESIGNER_ACTIONS.ELEMENT_TRANSFORM_UPDATE,
          payload: {
            elementId: selectedElement.id,
            x: transform.x + deltaX,
            y: transform.y + deltaY,
            scaleX: transform.scaleX,
            scaleY: transform.scaleY,
            rotationDeg: transform.rotationDeg,
          },
        })
        return
      }

      if (event.key === '[' || event.key === ']') {
        event.preventDefault()
        const rotationStep = event.key === '[' ? -15 : 15
        dispatch({
          type: DESIGNER_ACTIONS.ELEMENT_TRANSFORM_UPDATE,
          payload: {
            elementId: selectedElement.id,
            x: transform.x,
            y: transform.y,
            scaleX: transform.scaleX,
            scaleY: transform.scaleY,
            rotationDeg: transform.rotationDeg + rotationStep,
          },
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dispatch, history, selectedElement, state.selection.elementId])

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadMessage('Validating image…')
    const result = await upload(file)

    if (!result.ok) {
      setUploadMessage('error' in result ? result.error ?? 'Upload validation failed' : 'Upload validation failed')
      return
    }

    dispatch({
      type: DESIGNER_ACTIONS.ASSET_UPLOAD_SUCCESS,
      payload: { metadata: result.metadata },
    })

    const baseScale = Math.min(
      currentProduct.printAreas[state.activePrintAreaId].width / result.metadata.width,
      currentProduct.printAreas[state.activePrintAreaId].height / result.metadata.height,
    ) * 0.95
    const initialScale = Math.min(6, Math.max(0.1, Number.isFinite(baseScale) ? baseScale : 1))

    dispatch({
      type: DESIGNER_ACTIONS.ELEMENT_ADD,
      payload: {
        assetId: result.metadata.id,
        x: currentProduct.printAreas[state.activePrintAreaId].x + currentProduct.printAreas[state.activePrintAreaId].width / 2,
        y: currentProduct.printAreas[state.activePrintAreaId].y + currentProduct.printAreas[state.activePrintAreaId].height / 2,
        scaleX: initialScale,
        scaleY: initialScale,
      },
    })

    setLastAssetName(result.metadata.filename)
    setUploadMessage(`Placed ${result.metadata.filename} on the canvas`)
    onEvent?.({
      name: 'ASSET_UPLOADED',
      projectId: state.projectId,
      actor: 'user',
      timestamp: Date.now(),
      metrics: {
        width: result.metadata.width,
        height: result.metadata.height,
      },
    })

    event.target.value = ''
  }
  const handleProductChange = (productId: ProductTemplate['id']) => {
    const product = initialConfig.products.find((item) => item.id === productId)
    if (!product) {
      return
    }

    dispatch({
      type: DESIGNER_ACTIONS.PRODUCT_SET,
      payload: { productId },
    })

    onEvent?.({
      name: 'PRODUCT_CHANGED',
      projectId: state.projectId,
      actor: 'user',
      timestamp: Date.now(),
      context: { productId },
    })
  }

  const handleColorToggle = (colorId: string, selected: boolean) => {
    const nextSelected = selected
      ? [...state.selectedColorIds, colorId]
      : state.selectedColorIds.filter((id) => id !== colorId)

    dispatch({
      type: DESIGNER_ACTIONS.COLORS_SET,
      payload: { colorIds: nextSelected },
    })

    onEvent?.({
      name: 'COLOR_SELECTION_CHANGED',
      projectId: state.projectId,
      actor: 'user',
      timestamp: Date.now(),
      context: {
        productId: state.productId,
        colorId,
      },
    })
  }

  const rootClassName = className
    ? `${className}`
    : ''

  return (
    <section className={`w-full box-border p-4 grid gap-3 ${rootClassName}`} aria-label="Print Designer">
      <header className="text-left">
        <h1 className="text-2xl font-semibold m-0">Designer Shell</h1>
        <p className="text-sm text-gray-600 m-1 mt-0">React component scaffold with typed contracts</p>
      </header>

      <div className="grid grid-cols-[260px_minmax(0,1fr)_320px] gap-3 items-start">
        <aside className="grid gap-3">
          <UploadPanel
            isValidating={isValidating}
            status={uploadMessage}
            lastAssetName={lastAssetName}
            onUpload={handleUpload}
          />
          <ProductSelector
            products={initialConfig.products}
            selectedProductId={state.productId}
            onChange={handleProductChange}
          />
          <ColorSelector
            availableColors={currentProduct.colors}
            selectedColorIds={state.selectedColorIds}
            mode="multi"
            onToggle={handleColorToggle}
          />
          <WarningCenter warnings={warnings} />
        </aside>

        <main className="min-w-0">
          <EditorCanvas
            dispatch={dispatch}
            project={state}
            product={currentProduct}
            activeAreaId={state.activePrintAreaId}
            interactionMode={'transform' as InteractionMode}
          />
        </main>

        <aside className="grid gap-3">
          <PreviewPanel
            selectedColorIds={state.selectedColorIds}
            angleLabels={initialConfig.anglePresets.map((angle) => angle.label)}
            angleOptions={initialConfig.anglePresets.map((angle) => ({ id: angle.id, label: angle.label }))}
            activeCalibrationAngleId={activeCalibrationAngleId}
            onActiveCalibrationAngleChange={(angleId) => setActiveCalibrationAngleId(angleId)}
            activeCalibration={previewAngleCalibrations[activeCalibrationAngleId] ?? { offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 }}
            onActiveCalibrationChange={(nextCalibration) => {
              setPreviewAngleCalibrations((current) => ({
                ...current,
                [activeCalibrationAngleId]: nextCalibration,
              }))
            }}
            allCalibrations={previewAngleCalibrations}
            debugPrintArea={currentProduct.printAreas[state.activePrintAreaId]}
            isRendering={preview.isRendering}
            previews={preview.previews}
            realismStrength={previewRealismStrength}
            lightingStrength={previewLightingStrength}
            onRealismStrengthChange={setPreviewRealismStrength}
            onLightingStrengthChange={setPreviewLightingStrength}
          />
          <ExportPanel
            canExport={state.selectedColorIds.length > 0}
            progress={exportPipeline.progress}
            exports={exportPipeline.result}
            isRunning={exportPipeline.isRunning}
            verification={exportPipeline.verification}
            onStart={() => {
              void exportPipeline.start()
            }}
          />
        </aside>
      </div>

      <footer className="flex flex-wrap justify-between items-center gap-2 text-sm">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 border border-gray-300 rounded bg-white disabled:opacity-50"
            onClick={history.undo}
            disabled={!history.canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="px-3 py-1 border border-gray-300 rounded bg-white disabled:opacity-50"
            onClick={history.redo}
            disabled={!history.canRedo}
          >
            Redo
          </button>
          <button
            type="button"
            className="px-3 py-1 border border-red-300 text-red-700 rounded bg-white disabled:opacity-50"
            onClick={handleDeleteSelected}
            disabled={!state.selection.elementId}
          >
            Delete selected
          </button>
          <button
            type="button"
            className="px-3 py-1 border border-gray-300 rounded bg-white disabled:opacity-50"
            onClick={handleFitToSafeBounds}
            disabled={!state.selection.elementId}
          >
            Fit to safe bounds
          </button>
        </div>

        <div className="inline-flex items-center gap-2">
          <span>Autosave: {autosave.saveStatus}</span>
          <button
            type="button"
            className="px-3 py-1 border border-gray-300 rounded bg-white"
            onClick={autosave.restore}
          >
            Restore draft
          </button>
          <button
            type="button"
            className="px-3 py-1 border border-gray-300 rounded bg-white"
            onClick={autosave.clearDraft}
          >
            Clear draft
          </button>
        </div>
      </footer>
    </section>
  )
}

interface UploadPanelProps {
  isValidating: boolean
  status: string
  lastAssetName: string | null
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void
}

const UploadPanel = ({ isValidating, status, lastAssetName, onUpload }: UploadPanelProps) => {
  return (
    <section className="border border-gray-300 rounded-lg p-3 text-left bg-white">
      <h2 className="text-base font-medium m-0 mb-2">Upload image</h2>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onUpload}
        disabled={isValidating}
        className="block w-full text-sm"
      />
      <p className="text-xs text-gray-500 mt-2">PNG, JPG, or WebP up to 10 MB.</p>
      <p className="text-sm mt-2">{status}</p>
      {lastAssetName ? <p className="text-xs text-gray-600 mt-1">Last upload: {lastAssetName}</p> : null}
    </section>
  )
}

interface ProductSelectorProps {
  products: ProductTemplate[]
  selectedProductId: ProductTemplate['id']
  onChange: (productId: ProductTemplate['id']) => void
}

const ProductSelector = ({
  products,
  selectedProductId,
  onChange,
}: ProductSelectorProps) => {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as ProductTemplate['id'])
  }

  return (
    <section className="border border-gray-300 rounded-lg p-3 text-left bg-white">
      <h2 className="text-base font-medium m-0 mb-2">Product</h2>
      <select className="w-full px-2 py-1 border border-gray-300 rounded" value={selectedProductId} onChange={handleChange}>
        {products.map((product) => (
          <option value={product.id} key={product.id}>
            {product.label}
          </option>
        ))}
      </select>
    </section>
  )
}

interface ColorSelectorProps {
  availableColors: ProductTemplate['colors']
  selectedColorIds: string[]
  mode: 'single' | 'multi'
  onToggle: (colorId: string, selected: boolean) => void
}

const ColorSelector = ({
  availableColors,
  selectedColorIds,
  mode,
  onToggle,
}: ColorSelectorProps) => {
  return (
    <section className="border border-gray-300 rounded-lg p-3 text-left bg-white">
      <h2 className="text-base font-medium m-0 mb-2">Colors ({mode})</h2>
      <ul className="list-none m-0 p-0 grid gap-2">
        {availableColors.map((color) => {
          const selected = selectedColorIds.includes(color.id)

          return (
            <li key={color.id}>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => onToggle(color.id, event.target.checked)}
                />
                <span
                  className="w-3.5 h-3.5 border border-gray-600 rounded-full"
                  style={{ backgroundColor: color.hex }}
                  aria-hidden="true"
                />
                {color.label}
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

interface EditorCanvasProps {
  dispatch: (action: DesignerAction) => void
  project: ProjectState
  product: ProductTemplate
  activeAreaId: string
  interactionMode: InteractionMode
}

const EditorCanvas = ({
  dispatch,
  project,
  product,
  activeAreaId,
  interactionMode,
}: EditorCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { render } = useCanvasRenderer(canvasRef, project, product)
  const { cursor, hud, onPointerDown, onPointerMove, onPointerUp, onPointerLeave } = useCanvasInteraction(
    dispatch,
    project,
  )

  const hudPosition = useMemo(() => {
    if (!hud || !canvasRef.current) return null

    const canvas = canvasRef.current
    const logicalWidth = canvas.width / 2
    const logicalHeight = canvas.height / 2
    if (!logicalWidth || !logicalHeight) return null

    return {
      left: hud.point.x * (canvas.clientWidth / logicalWidth),
      top: hud.point.y * (canvas.clientHeight / logicalHeight),
    }
  }, [hud])

  useEffect(() => {
    render({
      showPrintBounds: true,
      showSafeArea: true,
      quality: 'preview',
      scale: 1,
    })
  }, [render, activeAreaId, project, product])

  return (
    <section className="border border-gray-300 rounded-lg p-3 text-left bg-white min-h-96">
      <h2 className="text-base font-medium m-0 mb-2">Editor Canvas</h2>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
          <span>Project ID: {project.projectId}</span>
          <span>Active print area: {activeAreaId}</span>
          <span>Interaction mode: {interactionMode}</span>
          <span>Elements: {project.elements.length}</span>
        </div>
        <div className="overflow-auto rounded-lg border border-gray-200 bg-slate-100 p-3">
          <div className="relative mx-auto w-fit">
            <canvas
              ref={canvasRef}
              className="block mx-auto max-w-full h-auto rounded border border-gray-300 bg-white shadow-sm"
              style={{ cursor }}
              aria-label="Designer canvas preview"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerLeave}
            />

            {hud && hudPosition ? (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[120%] rounded border border-gray-300 bg-white/95 px-2 py-1 text-[11px] leading-tight text-gray-700 shadow"
                style={{ left: hudPosition.left, top: hudPosition.top }}
              >
                {hud.mode === 'resize' ? (
                  <>
                    <div>{Math.round(hud.width)}×{Math.round(hud.height)} px</div>
                    <div>Scale: {hud.scaleX.toFixed(2)} × {hud.scaleY.toFixed(2)}</div>
                  </>
                ) : (
                  <div>Angle: {Math.round(hud.rotationDeg)}°</div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

interface WarningCenterProps {
  warnings: DesignerWarning[]
}

const WarningCenter = ({ warnings }: WarningCenterProps) => {
  return (
    <section className="border border-gray-300 rounded-lg p-3 text-left bg-white">
      <h2 className="text-base font-medium m-0 mb-2">Warnings</h2>
      {warnings.length === 0 ? (
        <p className="text-gray-500 text-sm">No active warnings</p>
      ) : (
        <ul className="list-disc ml-5">
          {warnings.map((warning) => (
            <li key={warning.id} className="text-sm">{warning.message}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface PreviewPanelProps {
  selectedColorIds: string[]
  angleLabels: string[]
  angleOptions: Array<{ id: string; label: string }>
  activeCalibrationAngleId: string
  onActiveCalibrationAngleChange: (angleId: string) => void
  activeCalibration: PreviewAngleCalibration
  onActiveCalibrationChange: (calibration: PreviewAngleCalibration) => void
  allCalibrations: Record<string, PreviewAngleCalibration>
  debugPrintArea: PrintAreaBounds
  isRendering: boolean
  realismStrength: number
  lightingStrength: number
  onRealismStrengthChange: (value: number) => void
  onLightingStrengthChange: (value: number) => void
  previews: Array<{
    id: string
    angleId: string
    angleLabel: string
    colorLabel: string
    variant: 'mockup' | 'print-area'
    dataUrl: string
    width: number
    height: number
  }>
}

const PreviewPanel = ({
  selectedColorIds,
  angleLabels,
  angleOptions,
  activeCalibrationAngleId,
  onActiveCalibrationAngleChange,
  activeCalibration,
  onActiveCalibrationChange,
  allCalibrations,
  debugPrintArea,
  isRendering,
  realismStrength,
  lightingStrength,
  onRealismStrengthChange,
  onLightingStrengthChange,
  previews,
}: PreviewPanelProps) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const handleSliderChange =
    (onChange: (value: number) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      onChange(Number(event.target.value))
    }

  const copyCalibration = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(allCalibrations, null, 2))
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1200)
    } catch {
      setCopyState('failed')
      window.setTimeout(() => setCopyState('idle'), 1200)
    }
  }

  return (
    <section className="border border-gray-300 rounded-lg p-3 text-left bg-white">
      <h2 className="text-base font-medium m-0 mb-2">Preview</h2>
      <p className="text-gray-500 text-sm">Multi-angle print-reality previews</p>
      <p className="text-sm">
        Colors: {selectedColorIds.length} · Angles: {angleLabels.length}
      </p>
      <div className="mt-2 grid gap-2">
        <label className="text-xs text-gray-700 grid gap-1">
          Realism strength: {realismStrength.toFixed(2)}
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={realismStrength}
            onChange={handleSliderChange(onRealismStrengthChange)}
          />
        </label>
        <label className="text-xs text-gray-700 grid gap-1">
          Lighting strength: {lightingStrength.toFixed(2)}
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={lightingStrength}
            onChange={handleSliderChange(onLightingStrengthChange)}
          />
        </label>
        <div className="pt-1 border-t border-gray-200">
          <label className="text-xs text-gray-700 grid gap-1">
            Debug angle placement (handles)
            <select
              className="w-full px-2 py-1 border border-gray-300 rounded"
              value={activeCalibrationAngleId}
              onChange={(event) => onActiveCalibrationAngleChange(event.target.value)}
            >
              {angleOptions.map((angle) => (
                <option key={angle.id} value={angle.id}>{angle.label}</option>
              ))}
            </select>
          </label>
          <div className="mt-2">
            <PreviewCalibrationDebugger
              previews={previews}
              activeAngleId={activeCalibrationAngleId}
              activeCalibration={activeCalibration}
              printArea={debugPrintArea}
              onCalibrationChange={onActiveCalibrationChange}
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 border border-gray-300 rounded bg-white text-xs"
              onClick={copyCalibration}
            >
              Copy calibration JSON
            </button>
            <span className="text-xs text-gray-500">
              {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : ''}
            </span>
          </div>
        </div>
      </div>
      <p className="text-sm">{isRendering ? 'Rendering…' : 'Idle'}</p>
      <div className="mt-3 grid gap-3">
        {previews.length === 0 ? (
          <p className="text-sm text-gray-500">No preview renders yet.</p>
        ) : (
          previews.map((preview) => (
            <figure key={preview.id} className="m-0 rounded border border-gray-200 p-2 bg-slate-50">
              <img
                src={preview.dataUrl}
                alt={`${preview.angleLabel} preview for ${preview.colorLabel}`}
                className="block w-full rounded border border-gray-200 bg-white"
              />
              <figcaption className="mt-2 text-xs text-gray-600">
                {preview.angleLabel}
                {preview.variant === 'print-area' ? ' (Bleed + padding)' : ''}
                {' · '}
                {preview.colorLabel}
                {' · '}
                {preview.width}×{preview.height}
              </figcaption>
            </figure>
          ))
        )}
      </div>
    </section>
  )
}

interface PreviewCalibrationDebuggerProps {
  previews: Array<{
    id: string
    angleId: string
    angleLabel: string
    colorLabel: string
    variant: 'mockup' | 'print-area'
    dataUrl: string
    width: number
    height: number
  }>
  activeAngleId: string
  activeCalibration: PreviewAngleCalibration
  printArea: PrintAreaBounds
  onCalibrationChange: (calibration: PreviewAngleCalibration) => void
}

const PreviewCalibrationDebugger = ({
  previews,
  activeAngleId,
  activeCalibration,
  printArea,
  onCalibrationChange,
}: PreviewCalibrationDebuggerProps) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{
    mode: 'idle' | 'move' | 'scale' | 'rotate'
    startX: number
    startY: number
    startCalibration: PreviewAngleCalibration
    centerX: number
    centerY: number
    startRadius: number
    startAngle: number
  }>({
    mode: 'idle',
    startX: 0,
    startY: 0,
    startCalibration: activeCalibration,
    centerX: 0,
    centerY: 0,
    startRadius: 1,
    startAngle: 0,
  })

  const targetPreview = useMemo(
    () => previews.find((preview) => preview.variant === 'mockup' && preview.angleId === activeAngleId) ?? null,
    [activeAngleId, previews],
  )

  if (!targetPreview) {
    return <p className="text-xs text-gray-500">No preview available for this angle yet.</p>
  }

  const logicalWidth = Math.max(1, targetPreview.width / 2)
  const logicalHeight = Math.max(1, targetPreview.height / 2)
  const centerX = printArea.x + printArea.width / 2 + activeCalibration.offsetX
  const centerY = printArea.y + printArea.height / 2 + activeCalibration.offsetY
  const boxWidth = printArea.width * activeCalibration.scale
  const boxHeight = printArea.height * activeCalibration.scale

  const toLogicalPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) {
      return { x: 0, y: 0 }
    }

    return {
      x: (event.clientX - bounds.left) * (logicalWidth / bounds.width),
      y: (event.clientY - bounds.top) * (logicalHeight / bounds.height),
    }
  }

  const startDrag = (
    mode: 'move' | 'scale' | 'rotate',
    event: ReactPointerEvent<SVGElement>,
  ) => {
    event.preventDefault()
    const pointerEvent = event as unknown as ReactPointerEvent<SVGSVGElement>
    const point = toLogicalPoint(pointerEvent)

    dragRef.current = {
      mode,
      startX: point.x,
      startY: point.y,
      startCalibration: activeCalibration,
      centerX,
      centerY,
      startRadius: Math.max(1, Math.hypot(point.x - centerX, point.y - centerY)),
      startAngle: Math.atan2(point.y - centerY, point.x - centerX),
    }

    if (svgRef.current) {
      svgRef.current.setPointerCapture(event.pointerId)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (drag.mode === 'idle') return

    const point = toLogicalPoint(event)
    const dx = point.x - drag.startX
    const dy = point.y - drag.startY

    if (drag.mode === 'move') {
      onCalibrationChange({
        ...drag.startCalibration,
        offsetX: drag.startCalibration.offsetX + dx,
        offsetY: drag.startCalibration.offsetY + dy,
      })
      return
    }

    if (drag.mode === 'scale') {
      const radius = Math.max(1, Math.hypot(point.x - drag.centerX, point.y - drag.centerY))
      const ratio = radius / drag.startRadius
      onCalibrationChange({
        ...drag.startCalibration,
        scale: Math.max(0.2, Math.min(4, drag.startCalibration.scale * ratio)),
      })
      return
    }

    const angle = Math.atan2(point.y - drag.centerY, point.x - drag.centerX)
    const deltaDeg = ((angle - drag.startAngle) * 180) / Math.PI
    onCalibrationChange({
      ...drag.startCalibration,
      rotationDeg: drag.startCalibration.rotationDeg + deltaDeg,
    })
  }

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current.mode = 'idle'
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-slate-50 p-2">
      <p className="m-0 mb-2 text-xs text-gray-600">
        Drag blue box to move, corner handle to scale, top handle to rotate.
      </p>
      <div className="relative">
        <img
          src={targetPreview.dataUrl}
          alt={`Calibration preview for ${targetPreview.angleLabel}`}
          className="block w-full rounded border border-gray-200 bg-white"
        />
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${logicalWidth} ${logicalHeight}`}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <g transform={`translate(${centerX} ${centerY}) rotate(${activeCalibration.rotationDeg})`}>
            <rect
              x={-boxWidth / 2}
              y={-boxHeight / 2}
              width={boxWidth}
              height={boxHeight}
              fill="rgba(29, 78, 216, 0.12)"
              stroke="#1d4ed8"
              strokeWidth={2}
              onPointerDown={(event) => startDrag('move', event)}
              style={{ cursor: 'move' }}
            />
            <circle
              cx={boxWidth / 2}
              cy={boxHeight / 2}
              r={6}
              fill="#ffffff"
              stroke="#1d4ed8"
              strokeWidth={2}
              onPointerDown={(event) => startDrag('scale', event)}
              style={{ cursor: 'nwse-resize' }}
            />
            <line x1={0} y1={-boxHeight / 2} x2={0} y2={-boxHeight / 2 - 20} stroke="#1d4ed8" strokeWidth={2} />
            <circle
              cx={0}
              cy={-boxHeight / 2 - 20}
              r={6}
              fill="#ffffff"
              stroke="#1d4ed8"
              strokeWidth={2}
              onPointerDown={(event) => startDrag('rotate', event)}
              style={{ cursor: 'grab' }}
            />
          </g>
        </svg>
      </div>
      <p className="m-0 mt-2 text-[11px] text-gray-600">
        X {activeCalibration.offsetX.toFixed(1)} · Y {activeCalibration.offsetY.toFixed(1)} · Scale {activeCalibration.scale.toFixed(3)} · Rot {activeCalibration.rotationDeg.toFixed(2)}°
      </p>
    </div>
  )
}

interface ExportPanelProps {
  canExport: boolean
  progress: {
    total: number
    completed: number
    failed: number
  }
  exports: Array<{
    filename: string
    dataUrl: string
    angleLabel: string
    colorLabel: string
  }> | null
  isRunning: boolean
  verification: {
    status: 'idle' | 'verifying' | 'verified' | 'unverified' | 'failed'
    token?: { token: string; keyId?: string; expiresAt?: number }
    manifestDataUrl?: string
  }
  onStart: () => void
}

const ExportPanel = ({ canExport, progress, exports, isRunning, verification, onStart }: ExportPanelProps) => {
  return (
    <section className="border border-gray-300 rounded-lg p-3 text-left bg-white">
      <h2 className="text-base font-medium m-0 mb-2">Export</h2>
      <p className="text-sm">Ready: {String(canExport)}</p>
      <p className="text-sm">
        Progress: {progress.completed}/{progress.total} (failed: {progress.failed})
      </p>
      <p className="text-sm">
        Verification: {verification.status}
        {verification.token?.keyId ? ` (${verification.token.keyId})` : ''}
      </p>
      <button type="button" disabled={!canExport || isRunning} onClick={onStart} className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:bg-gray-400">
        {isRunning ? 'Exporting…' : 'Start Export'}
      </button>
      {verification.manifestDataUrl ? (
        <div className="mt-2">
          <a
            href={verification.manifestDataUrl}
            download={`export-manifest-${Date.now()}.json`}
            className="text-sm text-blue-700 underline"
          >
            Download verification manifest
          </a>
        </div>
      ) : null}
      {exports && exports.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {exports.map((item) => (
            <a
              key={item.filename}
              href={item.dataUrl}
              download={item.filename}
              className="text-sm text-blue-700 underline"
            >
              Download {item.angleLabel} · {item.colorLabel}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  )
}