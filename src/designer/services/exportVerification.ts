import type {
  ExportVerificationDesignInput,
  ExportVerificationItem,
  ExportVerificationPayload,
  ExportPreviewPlacementCalibration,
  ExportVerificationToken,
  PrintAreaBounds,
  ProductId,
  PrintAreaId,
} from '../types'

export interface ExportVerificationManifest {
  payload: ExportVerificationPayload
  token?: ExportVerificationToken
}

const toHex = (bytes: Uint8Array): string => {
  let value = ''
  for (const byte of bytes) {
    value += byte.toString(16).padStart(2, '0')
  }
  return value
}

const sha256 = async (input: string): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return toHex(new Uint8Array(hash))
}

const createNonce = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return toHex(bytes)
}

export const createExportVerificationPayload = async (
  projectId: string,
  productId: ProductId,
  activePrintAreaId: PrintAreaId,
  printArea: PrintAreaBounds,
  designInputs: ExportVerificationDesignInput[],
  previewPlacementByAngle: Record<string, ExportPreviewPlacementCalibration>,
  items: Array<{
    filename: string
    angleId: string
    colorId: string
    width: number
    height: number
    dataUrl: string
  }>,
): Promise<ExportVerificationPayload> => {
  const payloadItems: ExportVerificationItem[] = []

  for (const item of items) {
    payloadItems.push({
      filename: item.filename,
      angleId: item.angleId,
      colorId: item.colorId,
      width: item.width,
      height: item.height,
      sha256: await sha256(item.dataUrl),
    })
  }

  const combinedSha256 = await sha256(
    payloadItems
      .map((item) => `${item.filename}:${item.sha256}`)
      .join('|'),
  )

  return {
    projectId,
    productId,
    activePrintAreaId,
    printArea,
    nonce: createNonce(),
    generatedAt: Date.now(),
    itemCount: payloadItems.length,
    combinedSha256,
    items: payloadItems,
    designInputs,
    previewPlacementByAngle,
  }
}

export const createExportManifestDataUrl = (
  manifest: ExportVerificationManifest,
): string => {
  const encoded = encodeURIComponent(JSON.stringify(manifest, null, 2))
  return `data:application/json;charset=utf-8,${encoded}`
}
