import type {
  DesignerConfig,
  DesignerWarning,
  ProductTemplate,
  ProjectState,
  AssetMetadata,
} from '../types'

export class WarningEngine {
  private config: DesignerConfig

  constructor(config: DesignerConfig) {
    this.config = config
  }

  evaluate(
    state: ProjectState,
    product: ProductTemplate,
    assetMetadata?: AssetMetadata,
  ): DesignerWarning[] {
    const warnings: DesignerWarning[] = []

    if (!assetMetadata) return warnings

    const printArea = product.printAreas[state.activePrintAreaId]
    if (!printArea) return warnings

    // Check DPI
    if (this.config.warnings.enableLowContrast) {
      const dpiWarning = this.checkDPI(assetMetadata, printArea)
      if (dpiWarning) warnings.push(dpiWarning)
    }

    // Check for opaque background patch risk
    if (this.config.warnings.enablePatchRisk) {
      state.selectedColorIds.forEach((colorId) => {
        const patchWarning = this.checkOpaqueBackground(
          assetMetadata,
          product,
          colorId,
        )
        if (patchWarning) warnings.push(patchWarning)
      })
    }

    // Check low contrast
    if (this.config.warnings.enableLowContrast) {
      state.selectedColorIds.forEach((colorId) => {
        const contrastWarning = this.checkContrast(
          assetMetadata,
          product,
          colorId,
        )
        if (contrastWarning) warnings.push(contrastWarning)
      })
    }

    return warnings
  }

  private checkDPI(
    metadata: AssetMetadata,
    printArea: any,
  ): DesignerWarning | null {
    // Estimate DPI: assume 300 target DPI, calculate effective
    const printWidthInches = printArea.width / 96 // assume 96px per inch on screen
    const effectiveDPI = metadata.width / printWidthInches

    if (effectiveDPI < this.config.dpi.warning) {
      const id = `dpi-warning-${Date.now()}`
      return {
        id,
        type: 'DPI_LOW',
        severity:
          effectiveDPI < this.config.dpi.blocking ? 'blocking' : 'warning',
        message: `Effective DPI is ${Math.round(effectiveDPI)} (target: ${this.config.dpi.target})`,
        metrics: {
          effectiveDPI: Math.round(effectiveDPI),
          targetDPI: this.config.dpi.target,
          imageDimensions: `${metadata.width}x${metadata.height}`,
        },
        acknowledged: false,
        createdAt: Date.now(),
      }
    }

    return null
  }

  private checkOpaqueBackground(
    metadata: AssetMetadata,
    product: ProductTemplate,
    colorId: string,
  ): DesignerWarning | null {
    const color = product.colors.find((c) => c.id === colorId)
    if (!color) return null

    // If image has opaque background (low alpha ratio) and is similar color to garment
    if (
      metadata.opaqueBackgroundRatio > 0.2 &&
      this.isSimilarColor(metadata.dominantColor, color.hex)
    ) {
      const id = `patch-${colorId}-${Date.now()}`
      return {
        id,
        type: 'OPAQUE_BG_RISK',
        severity: 'warning',
        message: `Opaque background may create visible patch on ${color.label}`,
        targetRef: { colorId },
        metrics: {
          opaqueRatio: (metadata.opaqueBackgroundRatio * 100).toFixed(1),
          garmentColor: color.hex,
        },
        acknowledged: false,
        createdAt: Date.now(),
      }
    }

    return null
  }

  private checkContrast(
    metadata: AssetMetadata,
    product: ProductTemplate,
    colorId: string,
  ): DesignerWarning | null {
    const color = product.colors.find((c) => c.id === colorId)
    if (!color || !metadata.dominantColor) return null

    const contrast =
      this.calculateContrast(metadata.dominantColor, color.hex)

    if (contrast < 3) {
      const id = `contrast-${colorId}-${Date.now()}`
      return {
        id,
        type: 'LOW_CONTRAST',
        severity: 'warning',
        message: `Low contrast on ${color.label} (ratio: ${contrast.toFixed(2)}:1)`,
        targetRef: { colorId },
        acknowledged: false,
        createdAt: Date.now(),
      }
    }

    return null
  }

  private isSimilarColor(color1?: string, color2?: string): boolean {
    if (!color1 || !color2) return false

    const rgb1 = this.parseRGB(color1)
    const rgb2 = this.parseRGB(color2)

    if (!rgb1 || !rgb2) return false

    const distance = Math.sqrt(
      Math.pow(rgb1[0] - rgb2[0], 2) +
        Math.pow(rgb1[1] - rgb2[1], 2) +
        Math.pow(rgb1[2] - rgb2[2], 2),
    )

    return distance < 100 // threshold for "similar"
  }

  private calculateContrast(color1: string, color2: string): number {
    const rgb1 = this.parseRGB(color1)
    const rgb2 = this.parseRGB(color2)

    if (!rgb1 || !rgb2) return 1

    const lum1 = this.getLuminance(rgb1)
    const lum2 = this.getLuminance(rgb2)

    const lighter = Math.max(lum1, lum2)
    const darker = Math.min(lum1, lum2)

    return (lighter + 0.05) / (darker + 0.05)
  }

  private getLuminance(rgb: number[]): number {
    const [r, g, b] = rgb.map((val) => {
      const v = val / 255
      return v <= 0.03928
        ? v / 12.92
        : Math.pow((v + 0.055) / 1.055, 2.4)
    })

    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  private parseRGB(colorStr: string): number[] | null {
    const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (match) {
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
    }

    // Parse hex
    const hex = colorStr.replace('#', '')
    if (hex.length === 6) {
      return [
        parseInt(hex.substr(0, 2), 16),
        parseInt(hex.substr(2, 2), 16),
        parseInt(hex.substr(4, 2), 16),
      ]
    }

    return null
  }
}
