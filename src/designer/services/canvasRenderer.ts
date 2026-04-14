import type { ProjectState, ProductTemplate, Transform2D } from '../types'

export interface RenderConfig {
  showSafeArea: boolean
  showPrintBounds: boolean
  showSelection: boolean
  clipToPrintArea: boolean
  printAreaCalibration?: {
    offsetX: number
    offsetY: number
    scale: number
    rotationDeg: number
  }
  quality: 'preview' | 'final'
  scale: number
  renderMode: 'flat' | 'realistic'
  realismStrength: number
  lightingStrength: number
}

export const DEFAULT_REALISM_STRENGTH = 1
export const DEFAULT_LIGHTING_STRENGTH = 1

interface DisplacementMap {
  luminance: number[]
  displaceX: number[]
  displaceY: number[]
  widthScale: number[]
  inset: number[]
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private imageCache = new Map<string, HTMLImageElement>()
  private templateCache = new Map<string, string>()
  private displacementCache = new Map<string, DisplacementMap>()
  private grayscaleMapCache = new Map<string, HTMLCanvasElement>()
  private normalizedAssetCache = new Map<string, HTMLCanvasElement>()
  private lastTemplateCacheKey: string | null = null
  private readonly MAX_CACHE_ENTRIES = 60
  private readonly MAX_RENDER_SOURCE_DIMENSION = 2400

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    if (!this.ctx) {
      throw new Error('Failed to get 2D context')
    }
  }

  async render(
    state: ProjectState,
    product: ProductTemplate,
    config: RenderConfig,
  ): Promise<void> {
    const printArea = product.printAreas[state.activePrintAreaId]
    if (!printArea) return

    const canvasWidth = product.mockupSize.width
    const canvasHeight = product.mockupSize.height

    this.canvas.width = canvasWidth * 2
    this.canvas.height = canvasHeight * 2

    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.scale(2, 2)

    const color = product.colors.find((c) =>
      state.selectedColorIds.includes(c.id),
    )
    if (!color) return

    this.drawSceneBackground(canvasWidth, canvasHeight)
    this.invalidateTemplateCachesIfNeeded(product.templateImageUrl, color.hex)
    this.pruneImageCaches(state)
    const templateImage = await this.drawTemplate(product.templateImageUrl, color.hex, canvasWidth, canvasHeight)
    const designMaskCtx =
      config.renderMode === 'realistic'
        ? this.createMaskContext(canvasWidth, canvasHeight)
        : null

    for (const element of state.elements) {
      await this.drawElement(
        element,
        state,
        printArea,
        templateImage,
        config.renderMode,
        config.clipToPrintArea,
        config.printAreaCalibration,
        designMaskCtx,
        config.realismStrength,
      )
    }

    if (config.renderMode === 'realistic') {
      this.applyAutoLightingFromTemplate(
        templateImage,
        printArea,
        designMaskCtx?.canvas ?? null,
        config.lightingStrength,
        config.printAreaCalibration,
      )
    }

    if (config.showPrintBounds) {
      this.drawPrintBounds(printArea)
    }
    if (config.showSafeArea) {
      this.drawSafeArea(printArea)
    }

    // Reset transform before drawing selection to ensure it's always visible
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.scale(2, 2)

    if (config.showSelection && state.selection.elementId) {
      const selected = state.elements.find(
        (el) => el.id === state.selection.elementId,
      )
      if (selected) {
        this.drawSelection(selected, state)
      }
    }
  }

  private drawSceneBackground(width: number, height: number): void {
    this.ctx.fillStyle = '#f4f7fb'
    this.ctx.fillRect(0, 0, width, height)

    const gradient = this.ctx.createRadialGradient(
      width * 0.5,
      height * 0.38,
      20,
      width * 0.5,
      height * 0.45,
      Math.max(width, height) * 0.8,
    )
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.92)')
    gradient.addColorStop(1, 'rgba(230, 236, 245, 0.96)')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, width, height)
  }

  private async drawTemplate(
    templateUrl: string,
    garmentColor: string,
    width: number,
    height: number,
  ): Promise<HTMLImageElement> {
    const img = await this.loadTemplateImage(templateUrl, garmentColor)
    this.ctx.drawImage(img, 0, 0, width, height)
    return img
  }

  private async drawElement(
    element: any,
    state: ProjectState,
    printArea: any,
    templateImage: HTMLImageElement,
    renderMode: RenderConfig['renderMode'],
    clipToPrintArea: boolean,
    printAreaCalibration: RenderConfig['printAreaCalibration'],
    designMaskCtx: CanvasRenderingContext2D | null,
    realismStrength: number,
  ): Promise<void> {
    if (!element.visible || element.type !== 'image') return

    const transform = element.transform
    const assetData = state.assets[element.assetId]
    if (!assetData) return

    this.ctx.save()
    if (clipToPrintArea) {
      this.applyPrintAreaClip(this.ctx, printArea, printAreaCalibration)
    }

    this.applyTransform(transform)

    if (designMaskCtx && renderMode === 'realistic') {
      designMaskCtx.save()
      if (clipToPrintArea) {
        this.applyPrintAreaClip(designMaskCtx, printArea, printAreaCalibration)
      }
      designMaskCtx.translate(transform.x, transform.y)
      designMaskCtx.rotate((transform.rotationDeg * Math.PI) / 180)
      designMaskCtx.scale(transform.scaleX, transform.scaleY)
    }

    try {
      const img = await this.loadImage(assetData.id, assetData.data)
      const renderSource = this.getRenderableSource(assetData.id, img)
      this.ctx.globalAlpha = element.opacity
      if (renderMode === 'realistic') {
        this.drawWarpedArtwork(
          renderSource,
          templateImage,
          printArea,
          designMaskCtx,
          element.opacity,
          realismStrength,
        )
      } else {
        this.drawFlatArtwork(renderSource)
      }
    } catch {
      this.ctx.fillStyle = '#ddd'
      this.ctx.fillRect(printArea.x, printArea.y, printArea.width, printArea.height)
    }

    if (designMaskCtx && renderMode === 'realistic') {
      designMaskCtx.restore()
    }
    this.ctx.restore()
  }

  private applyPrintAreaClip(
    targetCtx: CanvasRenderingContext2D,
    printArea: { x: number; y: number; width: number; height: number },
    calibration?: RenderConfig['printAreaCalibration'],
  ): void {
    const centerX = printArea.x + printArea.width / 2
    const centerY = printArea.y + printArea.height / 2
    const scale = calibration?.scale ?? 1
    const rotationDeg = calibration?.rotationDeg ?? 0
    const offsetX = calibration?.offsetX ?? 0
    const offsetY = calibration?.offsetY ?? 0
    const clipWidth = Math.max(1, printArea.width * scale)
    const clipHeight = Math.max(1, printArea.height * scale)

    targetCtx.save()
    targetCtx.translate(centerX + offsetX, centerY + offsetY)
    targetCtx.rotate((rotationDeg * Math.PI) / 180)
    targetCtx.beginPath()
    targetCtx.rect(-clipWidth / 2, -clipHeight / 2, clipWidth, clipHeight)
    targetCtx.restore()
    targetCtx.clip()
  }

  private createMaskContext(
    width: number,
    height: number,
  ): CanvasRenderingContext2D | null {
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = width
    maskCanvas.height = height
    return maskCanvas.getContext('2d')
  }

  private loadImage(assetId: string, src: string): Promise<HTMLImageElement> {
    const cached = this.imageCache.get(assetId)
    if (cached) {
      return Promise.resolve(cached)
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        this.imageCache.set(assetId, img)
        resolve(img)
      }
      img.onerror = () => reject(new Error('Failed to load image data'))
      img.src = src
    })
  }

  private invalidateTemplateCachesIfNeeded(templateUrl: string, garmentColor: string): void {
    const nextTemplateKey = `${templateUrl}::${garmentColor}`
    if (this.lastTemplateCacheKey === nextTemplateKey) {
      return
    }

    this.lastTemplateCacheKey = nextTemplateKey
    this.displacementCache.clear()
    this.grayscaleMapCache.clear()
  }

  private pruneImageCaches(state: ProjectState): void {
    const activeAssetIds = new Set(Object.keys(state.assets))

    for (const [key] of this.normalizedAssetCache) {
      if (!activeAssetIds.has(key)) {
        this.normalizedAssetCache.delete(key)
      }
    }

    const removableKeys: string[] = []
    for (const [key] of this.imageCache) {
      if (key.startsWith('asset-') && !activeAssetIds.has(key)) {
        removableKeys.push(key)
      }
    }
    for (const key of removableKeys) {
      this.imageCache.delete(key)
    }

    if (this.imageCache.size > this.MAX_CACHE_ENTRIES) {
      const keys = [...this.imageCache.keys()].slice(0, this.imageCache.size - this.MAX_CACHE_ENTRIES)
      for (const key of keys) {
        if (!key.startsWith('/templates/')) {
          this.imageCache.delete(key)
        }
      }
    }
  }

  private getRenderableSource(assetId: string, img: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
    const maxSide = Math.max(img.width, img.height)
    if (maxSide <= this.MAX_RENDER_SOURCE_DIMENSION) {
      return img
    }

    const cached = this.normalizedAssetCache.get(assetId)
    if (cached) {
      return cached
    }

    const ratio = this.MAX_RENDER_SOURCE_DIMENSION / Math.max(1, maxSide)
    const width = Math.max(1, Math.round(img.width * ratio))
    const height = Math.max(1, Math.round(img.height * ratio))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const canvasCtx = canvas.getContext('2d')
    if (!canvasCtx) {
      return img
    }

    canvasCtx.imageSmoothingEnabled = true
    canvasCtx.drawImage(img, 0, 0, width, height)
    this.normalizedAssetCache.set(assetId, canvas)
    return canvas
  }

  private async loadTemplateImage(
    templateUrl: string,
    garmentColor: string,
  ): Promise<HTMLImageElement> {
    if (/\.(png|jpe?g|webp|gif)$/i.test(templateUrl)) {
      return this.loadImage(templateUrl, templateUrl)
    }

    const cacheKey = `${templateUrl}::${garmentColor}`
    const cached = this.templateCache.get(cacheKey)
    if (cached) {
      return this.loadImage(cacheKey, cached)
    }

    const svgText = await fetch(templateUrl).then((response) => response.text())
    const themedSvg = svgText.replaceAll('__GARMENT_COLOR__', garmentColor)
    const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(themedSvg)}`
    this.templateCache.set(cacheKey, encoded)
    return this.loadImage(cacheKey, encoded)
  }

  private drawWarpedArtwork(
    img: HTMLImageElement | HTMLCanvasElement,
    templateImage: HTMLImageElement,
    printArea: any,
    maskCtx: CanvasRenderingContext2D | null,
    maskAlpha: number,
    realismStrength: number,
  ): void {
    const width = img.width
    const height = img.height
    const slices = 96
    const sliceHeight = height / slices
    const originX = -width / 2
    const originY = -height / 2
    const displacement = this.buildDisplacementMap(templateImage, printArea, slices)
    const bleed = 1.5

    this.ctx.imageSmoothingEnabled = true

    for (let index = 0; index < slices; index += 1) {
      const sy = index * sliceHeight
      const t = index / Math.max(1, slices - 1)
      const fold = Math.sin(t * Math.PI)
      const lum = displacement.luminance[index] ?? 0.5
      const shade = lum - 0.5
      const curved = (fold * fold * 8 + (displacement.displaceX[index] ?? 0)) * realismStrength
      const inset = (fold * fold * 4 + (displacement.inset[index] ?? 0) + Math.max(0, -shade) * 2) * realismStrength
      const widthScale = Math.max(0.8, 1 - ((1 - (displacement.widthScale[index] ?? 1)) + fold * 0.02) * realismStrength)
      const dy = originY + sy + (fold * 0.8 + (displacement.displaceY[index] ?? 0)) * realismStrength - bleed
      const sh = index === slices - 1 ? height - sy : sliceHeight + bleed * 2
      const sourceY = Math.max(0, sy - bleed)
      const sourceHeight = Math.min(height - sourceY, sh + bleed * 2)

      this.ctx.globalAlpha = 1
      this.ctx.drawImage(
        img,
        0,
        sourceY,
        width,
        sourceHeight,
        originX + curved,
        dy,
        Math.max(1, width * widthScale - curved * 2),
        sh + inset + bleed * 2,
      )

      if (maskCtx) {
        maskCtx.globalCompositeOperation = 'source-over'
        maskCtx.globalAlpha = maskAlpha
        maskCtx.drawImage(
          img,
          0,
          sourceY,
          width,
          sourceHeight,
          originX + curved,
          dy,
          Math.max(1, width * widthScale - curved * 2),
          sh + inset + bleed * 2,
        )
      }
    }

    this.ctx.globalAlpha = 1
    if (maskCtx) {
      maskCtx.globalAlpha = 1
    }
  }

  private drawFlatArtwork(img: HTMLImageElement | HTMLCanvasElement): void {
    const width = img.width
    const height = img.height

    this.ctx.imageSmoothingEnabled = true
    this.ctx.drawImage(img, -width / 2, -height / 2, width, height)
    this.ctx.globalAlpha = 1
  }

  private buildDisplacementMap(
    sourceImage: HTMLImageElement,
    printArea: any,
    slices: number,
  ): DisplacementMap {
    const cacheKey = `${sourceImage.src || `${sourceImage.width}x${sourceImage.height}`}::${printArea.x},${printArea.y},${printArea.width},${printArea.height}::${slices}`
    const cached = this.displacementCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = printArea.width
    sampleCanvas.height = printArea.height
    const sampleCtx = sampleCanvas.getContext('2d')
    if (!sampleCtx) {
      const fallback: DisplacementMap = {
        luminance: new Array(slices).fill(0.5),
        displaceX: new Array(slices).fill(0),
        displaceY: new Array(slices).fill(0),
        widthScale: new Array(slices).fill(1),
        inset: new Array(slices).fill(0),
      }
      this.displacementCache.set(cacheKey, fallback)
      return fallback
    }

    sampleCtx.drawImage(
      sourceImage,
      0,
      0,
      this.canvas.width / 2,
      this.canvas.height / 2,
      -printArea.x,
      -printArea.y,
      this.canvas.width / 2,
      this.canvas.height / 2,
    )

    const imageData = sampleCtx.getImageData(0, 0, printArea.width, printArea.height).data
    const luminance = new Array(slices).fill(0.5)
    const displaceX = new Array(slices).fill(0)
    const displaceY = new Array(slices).fill(0)
    const widthScale = new Array(slices).fill(1)
    const inset = new Array(slices).fill(0)
    const xMid = printArea.width / 2

    for (let index = 0; index < slices; index += 1) {
      const startY = Math.floor((index / slices) * printArea.height)
      const endY = Math.max(startY + 1, Math.floor(((index + 1) / slices) * printArea.height))
      let lumTotal = 0
      let count = 0
      let leftLum = 0
      let rightLum = 0
      let leftCount = 0
      let rightCount = 0

      for (let y = startY; y < endY; y += 1) {
        for (let x = 0; x < printArea.width; x += 1) {
          const offset = (y * printArea.width + x) * 4
          const r = imageData[offset] ?? 255
          const g = imageData[offset + 1] ?? 255
          const b = imageData[offset + 2] ?? 255
          const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255
          lumTotal += lum
          if (x < xMid) {
            leftLum += lum
            leftCount += 1
          } else {
            rightLum += lum
            rightCount += 1
          }
          count += 1
        }
      }

      const rowLum = count ? lumTotal / count : 0.5
      const leftAvg = leftCount ? leftLum / leftCount : rowLum
      const rightAvg = rightCount ? rightLum / rightCount : rowLum
      const horizontalGradient = rightAvg - leftAvg

      luminance[index] = rowLum
      displaceX[index] = horizontalGradient * 16
      widthScale[index] = 1 - Math.max(0, 0.5 - rowLum) * 0.1
      inset[index] = Math.max(0, 0.5 - rowLum) * 7
    }

    for (let index = 1; index < slices - 1; index += 1) {
      const prev = luminance[index - 1] ?? luminance[index]
      const next = luminance[index + 1] ?? luminance[index]
      const curvature = (prev + next) * 0.5 - luminance[index]
      displaceY[index] = curvature * 30
    }

    this.smoothSeries(displaceX, 2)
    this.smoothSeries(displaceY, 2)
    this.smoothSeries(widthScale, 2)
    this.smoothSeries(inset, 2)

    const map: DisplacementMap = { luminance, displaceX, displaceY, widthScale, inset }
    this.displacementCache.set(cacheKey, map)
    return map
  }

  private applyPreviewLightingMaps(
    grayscaleMap: HTMLCanvasElement,
    printArea: any,
    designMaskCanvas: HTMLCanvasElement | null,
    lightingStrength: number,
    printAreaCalibration?: RenderConfig['printAreaCalibration'],
  ): void {
    const lightingCanvas = document.createElement('canvas')
    lightingCanvas.width = this.canvas.width / 2
    lightingCanvas.height = this.canvas.height / 2
    const lightingCtx = lightingCanvas.getContext('2d')
    if (!lightingCtx) {
      return
    }

    lightingCtx.drawImage(grayscaleMap, printArea.x, printArea.y, printArea.width, printArea.height)
    if (designMaskCanvas) {
      lightingCtx.globalCompositeOperation = 'destination-in'
      lightingCtx.drawImage(designMaskCanvas, 0, 0, lightingCanvas.width, lightingCanvas.height)
      lightingCtx.globalCompositeOperation = 'source-over'
    }

    this.ctx.save()
    this.applyPrintAreaClip(this.ctx, printArea, printAreaCalibration)

    this.ctx.globalCompositeOperation = 'multiply'
    this.ctx.globalAlpha = Math.max(0, Math.min(1, 0.18 * lightingStrength))
    this.ctx.drawImage(lightingCanvas, 0, 0, lightingCanvas.width, lightingCanvas.height)

    this.ctx.globalCompositeOperation = 'screen'
    this.ctx.globalAlpha = Math.max(0, Math.min(1, 0.12 * lightingStrength))
    this.ctx.drawImage(lightingCanvas, 0, 0, lightingCanvas.width, lightingCanvas.height)

    this.ctx.restore()
    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.globalAlpha = 1
  }

  private applyAutoLightingFromTemplate(
    templateImage: HTMLImageElement,
    printArea: any,
    designMaskCanvas: HTMLCanvasElement | null,
    lightingStrength: number,
    printAreaCalibration?: RenderConfig['printAreaCalibration'],
  ): void {
    const grayscaleMap = this.buildGrayscaleTemplateMap(templateImage, printArea)
    this.applyPreviewLightingMaps(
      grayscaleMap,
      printArea,
      designMaskCanvas,
      lightingStrength,
      printAreaCalibration,
    )
  }

  private buildGrayscaleTemplateMap(
    templateImage: HTMLImageElement,
    printArea: any,
  ): HTMLCanvasElement {
    const cacheKey = `${templateImage.src || `${templateImage.width}x${templateImage.height}`}::gray::${printArea.x},${printArea.y},${printArea.width},${printArea.height}`
    const cached = this.grayscaleMapCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const mapCanvas = document.createElement('canvas')
    mapCanvas.width = printArea.width
    mapCanvas.height = printArea.height
    const mapCtx = mapCanvas.getContext('2d')
    if (!mapCtx) {
      this.grayscaleMapCache.set(cacheKey, mapCanvas)
      return mapCanvas
    }

    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = this.canvas.width / 2
    sampleCanvas.height = this.canvas.height / 2
    const sampleCtx = sampleCanvas.getContext('2d')
    if (!sampleCtx) {
      this.grayscaleMapCache.set(cacheKey, mapCanvas)
      return mapCanvas
    }

    sampleCtx.drawImage(templateImage, 0, 0, sampleCanvas.width, sampleCanvas.height)
    const imageData = sampleCtx.getImageData(printArea.x, printArea.y, printArea.width, printArea.height)
    const { data } = imageData

    let luminanceTotal = 0
    let count = 0
    for (let offset = 0; offset < data.length; offset += 4) {
      const alpha = data[offset + 3] ?? 0
      if (alpha <= 8) continue
      const lum = (data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) / 255
      luminanceTotal += lum
      count += 1
    }

    const avg = count ? luminanceTotal / count : 0.5
    const contrast = 1.45
    for (let offset = 0; offset < data.length; offset += 4) {
      const alpha = data[offset + 3] ?? 0
      if (alpha <= 8) {
        data[offset + 3] = 0
        continue
      }
      const lum = (data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) / 255
      const adjusted = Math.max(0, Math.min(1, 0.5 + (lum - avg) * contrast))
      const value = Math.round(adjusted * 255)
      data[offset] = value
      data[offset + 1] = value
      data[offset + 2] = value
      data[offset + 3] = Math.min(255, Math.round(alpha * 0.95))
    }

    mapCtx.putImageData(imageData, 0, 0)
    this.grayscaleMapCache.set(cacheKey, mapCanvas)
    return mapCanvas
  }

  private smoothSeries(series: number[], passes: number): void {
    for (let pass = 0; pass < passes; pass += 1) {
      const copy = [...series]
      for (let index = 1; index < series.length - 1; index += 1) {
        series[index] = (copy[index - 1] + copy[index] * 2 + copy[index + 1]) / 4
      }
    }
  }

  private applyTransform(transform: Transform2D): void {
    this.ctx.translate(transform.x, transform.y)
    this.ctx.rotate((transform.rotationDeg * Math.PI) / 180)
    this.ctx.scale(transform.scaleX, transform.scaleY)
  }

  private drawPrintBounds(printArea: any): void {
    this.ctx.strokeStyle = '#ff0000'
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([5, 5])
    this.ctx.strokeRect(printArea.x, printArea.y, printArea.width, printArea.height)
    this.ctx.setLineDash([])

    this.ctx.fillStyle = '#ff0000'
    this.ctx.font = '10px sans-serif'
    this.ctx.fillText('Print Bounds', printArea.x + 5, printArea.y + 15)
  }

  private drawSafeArea(printArea: any): void {
    const margin = printArea.safeMargin
    this.ctx.strokeStyle = '#ffaa00'
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([2, 2])
    this.ctx.strokeRect(
      printArea.x + margin,
      printArea.y + margin,
      printArea.width - margin * 2,
      printArea.height - margin * 2,
    )
    this.ctx.setLineDash([])

    this.ctx.fillStyle = '#ffaa00'
    this.ctx.font = '10px sans-serif'
    this.ctx.fillText('Safe Area', printArea.x + margin + 2, printArea.y + margin + 12)
  }

  private drawSelection(element: any, state: ProjectState): void {
    const transform = element.transform
    const asset = state.assets[element.assetId]
    const width = (asset?.width ?? 100) * transform.scaleX
    const height = (asset?.height ?? 100) * transform.scaleY
    const halfWidth = width / 2
    const halfHeight = height / 2

    this.ctx.save()
    this.ctx.translate(transform.x, transform.y)
    this.ctx.rotate((transform.rotationDeg * Math.PI) / 180)
    this.ctx.strokeStyle = '#0066ff'
    this.ctx.lineWidth = 2
    this.ctx.strokeRect(-halfWidth, -halfHeight, width, height)

    const handleRadius = 6
    const handleFill = '#ffffff'
    const handleStroke = '#0066ff'
    const handles = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: -halfWidth, y: halfHeight },
      { x: halfWidth, y: halfHeight },
    ]

    this.ctx.fillStyle = handleFill
    this.ctx.strokeStyle = handleStroke
    this.ctx.lineWidth = 2
    for (const handle of handles) {
      this.ctx.beginPath()
      this.ctx.arc(handle.x, handle.y, handleRadius, 0, Math.PI * 2)
      this.ctx.fill()
      this.ctx.stroke()
    }

    this.ctx.beginPath()
    this.ctx.moveTo(0, -halfHeight)
    this.ctx.lineTo(0, -halfHeight - 22)
    this.ctx.stroke()
    this.ctx.beginPath()
    this.ctx.arc(0, -halfHeight - 22, handleRadius, 0, Math.PI * 2)
    this.ctx.fill()
    this.ctx.stroke()
    this.ctx.restore()
  }

  getDataURL(format: 'png' | 'jpg' = 'png'): string {
    return format === 'png'
      ? this.canvas.toDataURL('image/png')
      : this.canvas.toDataURL('image/jpeg', 0.95)
  }
}
