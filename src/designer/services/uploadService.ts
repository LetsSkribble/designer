export interface AssetMetadata {
  id: string
  filename: string
  mimeType: string
  width: number
  height: number
  hasAlpha: boolean
  dominantColor?: string
  opaqueBackgroundRatio: number
  data: string // base64
  uploadedAt: number
}

export interface ValidationError {
  ok: false
  error: string
  type: 'SIZE' | 'TYPE' | 'DIMENSIONS' | 'LOAD_ERROR'
}

export interface ValidationSuccess {
  ok: true
  metadata: AssetMetadata
}

export class UploadValidator {
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
  private readonly ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
  private readonly MIN_DIMENSION = 50
  private readonly MAX_DIMENSION = 8000
  private readonly MAX_PIXEL_COUNT = 24_000_000

  async validate(file: File): Promise<ValidationSuccess | ValidationError> {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        ok: false,
        error: `File size exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        type: 'SIZE',
      }
    }

    // Check file type
    if (!this.ALLOWED_TYPES.includes(file.type)) {
      return {
        ok: false,
        error: 'Only PNG, JPG, and WebP images are supported',
        type: 'TYPE',
      }
    }

    // Load image and extract metadata
    try {
      const metadata = await this.extractMetadata(file)
      return { ok: true, metadata }
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Failed to load image',
        type: 'LOAD_ERROR',
      }
    }
  }

  private async extractMetadata(file: File): Promise<AssetMetadata> {
    const base64 = await this.fileToBase64(file)
    const img = await this.loadImage(base64)

    // Validate dimensions
    if (
      img.width < this.MIN_DIMENSION ||
      img.height < this.MIN_DIMENSION ||
      img.width > this.MAX_DIMENSION ||
      img.height > this.MAX_DIMENSION
    ) {
      throw new Error(
        `Image dimensions must be between ${this.MIN_DIMENSION}x${this.MIN_DIMENSION} and ${this.MAX_DIMENSION}x${this.MAX_DIMENSION}`,
      )
    }

    if (img.width * img.height > this.MAX_PIXEL_COUNT) {
      throw new Error(
        `Image pixel count exceeds ${(this.MAX_PIXEL_COUNT / 1_000_000).toFixed(0)}MP safety limit`,
      )
    }

    // Analyze image for alpha and background
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    const imageData = ctx.getImageData(0, 0, img.width, img.height)
    const { hasAlpha, opaqueRatio, dominantColor } =
      this.analyzeImageData(imageData)

    return {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      filename: file.name,
      mimeType: file.type,
      width: img.width,
      height: img.height,
      hasAlpha,
      dominantColor,
      opaqueBackgroundRatio: opaqueRatio,
      data: base64,
      uploadedAt: Date.now(),
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  private loadImage(base64: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = base64
    })
  }

  private analyzeImageData(
    imageData: ImageData,
  ): {
    hasAlpha: boolean
    opaqueRatio: number
    dominantColor?: string
  } {
    const data = imageData.data
    let opaquePixels = 0
    let hasAlpha = false

    // Sample every 10th pixel for performance
    const step = 10
    let r = 0,
      g = 0,
      b = 0,
      samples = 0

    for (let i = 0; i < data.length; i += step * 4) {
      const alpha = data[i + 3]
      if (alpha < 255) {
        hasAlpha = true
      }
      if (alpha > 200) {
        opaquePixels++
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        samples++
      }
    }

    const totalSampled = data.length / 4 / step
    const opaqueRatio = samples > 0 ? opaquePixels / totalSampled : 0

    const dominantColor =
      samples > 0
        ? `rgb(${Math.round(r / samples)}, ${Math.round(g / samples)}, ${Math.round(b / samples)})`
        : undefined

    return { hasAlpha, opaqueRatio, dominantColor }
  }
}
