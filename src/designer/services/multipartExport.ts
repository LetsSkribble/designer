import type {
  ExportPreviewPlacementCalibration,
  ExportVerificationToken,
  ProductTemplate,
  ProjectState,
} from '../types'

export interface MultipartExportRenderedItem {
  filename: string
  dataUrl: string
  angleId: string
  angleLabel: string
  colorId: string
  colorLabel: string
  width: number
  height: number
}

export interface MultipartExportBuildInput {
  state: ProjectState
  product: ProductTemplate
  renderedItems: MultipartExportRenderedItem[]
  previewPlacementByAngle: Record<string, ExportPreviewPlacementCalibration>
  verification?: {
    status: 'idle' | 'verifying' | 'verified' | 'unverified' | 'failed'
    token?: ExportVerificationToken
    manifestDataUrl?: string
  }
}

export interface MultipartExportPayload {
  metadata: {
    projectId: string
    productId: string
    activePrintAreaId: string
    printArea: {
      x: number
      y: number
      width: number
      height: number
      safeMargin: number
    }
    previewPlacementByAngle: Record<string, ExportPreviewPlacementCalibration>
    renderedItems: Array<{
      filename: string
      angleId: string
      colorId: string
      width: number
      height: number
    }>
    elements: Array<{
      id: string
      assetId: string
      transform: {
        x: number
        y: number
        scaleX: number
        scaleY: number
        rotationDeg: number
      }
      opacity: number
      visible: boolean
      locked: boolean
    }>
    generatedAt: number
  }
  formData: FormData
}

export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, encoded] = dataUrl.split(',')
  const mime = /data:(.*?);base64/.exec(header ?? '')?.[1] ?? 'application/octet-stream'
  const binary = atob(encoded ?? '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime })
}

export const buildMultipartExportPayload = (
  input: MultipartExportBuildInput,
): MultipartExportPayload => {
  const printArea = input.product.printAreas[input.state.activePrintAreaId]
  if (!printArea) {
    throw new Error('Missing active print area for multipart export payload')
  }

  const metadata: MultipartExportPayload['metadata'] = {
    projectId: input.state.projectId,
    productId: input.state.productId,
    activePrintAreaId: input.state.activePrintAreaId,
    printArea,
    previewPlacementByAngle: input.previewPlacementByAngle,
    renderedItems: input.renderedItems.map((item) => ({
      filename: item.filename,
      angleId: item.angleId,
      colorId: item.colorId,
      width: item.width,
      height: item.height,
    })),
    elements: input.state.elements.map((element) => ({
      id: element.id,
      assetId: element.assetId,
      transform: {
        x: element.transform.x,
        y: element.transform.y,
        scaleX: element.transform.scaleX,
        scaleY: element.transform.scaleY,
        rotationDeg: element.transform.rotationDeg,
      },
      opacity: element.opacity,
      visible: element.visible,
      locked: element.locked,
    })),
    generatedAt: Date.now(),
  }

  const formData = new FormData()
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json')

  for (const renderedItem of input.renderedItems) {
    formData.append(
      'renders',
      dataUrlToBlob(renderedItem.dataUrl),
      renderedItem.filename,
    )
  }

  for (const asset of Object.values(input.state.assets)) {
    formData.append(
      'assets',
      dataUrlToBlob(asset.data),
      asset.filename,
    )
  }

  if (input.verification?.manifestDataUrl) {
    const manifestText = decodeURIComponent(
      input.verification.manifestDataUrl.replace('data:application/json;charset=utf-8,', ''),
    )
    formData.append('verificationManifest', new Blob([manifestText], { type: 'application/json' }), 'verification-manifest.json')
  }

  if (input.verification?.token?.token) {
    formData.append('verificationToken', input.verification.token.token)
    if (input.verification.token.keyId) {
      formData.append('verificationKeyId', input.verification.token.keyId)
    }
  }

  return { metadata, formData }
}
