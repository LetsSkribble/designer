import { describe, expect, it } from 'vitest'
import {
  createExportManifestDataUrl,
  createExportVerificationPayload,
} from './exportVerification'

describe('exportVerification', () => {
  it('creates payload with expected metadata and hashes', async () => {
    const payload = await createExportVerificationPayload(
      'project-1',
      'tshirt',
      'front',
      { x: 10, y: 20, width: 200, height: 240, safeMargin: 12 },
      [
        {
          elementId: 'element-1',
          assetId: 'asset-1',
          filename: 'art.png',
          mimeType: 'image/png',
          width: 500,
          height: 600,
          data: 'data:image/png;base64,AAA',
          transform: {
            x: 120,
            y: 140,
            scaleX: 0.8,
            scaleY: 0.8,
            rotationDeg: 5,
            origin: 'center',
          },
          opacity: 1,
          visible: true,
          locked: false,
        },
      ],
      {
        front: { offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 },
      },
      [
        {
          filename: 'a.png',
          angleId: 'front',
          colorId: 'black',
          width: 100,
          height: 100,
          dataUrl: 'data:image/png;base64,AAA',
        },
      ],
    )

    expect(payload.projectId).toBe('project-1')
    expect(payload.productId).toBe('tshirt')
    expect(payload.activePrintAreaId).toBe('front')
    expect(payload.itemCount).toBe(1)
    expect(payload.items[0]?.filename).toBe('a.png')
    expect(payload.designInputs[0]?.assetId).toBe('asset-1')
    expect(payload.previewPlacementByAngle.front?.scale).toBe(1)
    expect(payload.items[0]?.sha256.length).toBe(64)
    expect(payload.combinedSha256.length).toBe(64)
    expect(payload.nonce.length).toBe(32)
  })

  it('changes combined hash when export content changes', async () => {
    const payloadA = await createExportVerificationPayload(
      'project-1',
      'tshirt',
      'front',
      { x: 10, y: 20, width: 200, height: 240, safeMargin: 12 },
      [],
      {
        front: { offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 },
      },
      [
        {
          filename: 'a.png',
          angleId: 'front',
          colorId: 'black',
          width: 100,
          height: 100,
          dataUrl: 'data:image/png;base64,AAA',
        },
      ],
    )

    const payloadB = await createExportVerificationPayload(
      'project-1',
      'tshirt',
      'front',
      { x: 10, y: 20, width: 200, height: 240, safeMargin: 12 },
      [],
      {
        front: { offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 },
      },
      [
        {
          filename: 'a.png',
          angleId: 'front',
          colorId: 'black',
          width: 100,
          height: 100,
          dataUrl: 'data:image/png;base64,BBB',
        },
      ],
    )

    expect(payloadA.combinedSha256).not.toBe(payloadB.combinedSha256)
  })

  it('builds manifest download data url', async () => {
    const payload = await createExportVerificationPayload(
      'project-1',
      'tshirt',
      'front',
      { x: 10, y: 20, width: 200, height: 240, safeMargin: 12 },
      [],
      {
        front: { offsetX: 0, offsetY: 0, scale: 1, rotationDeg: 0 },
      },
      [
        {
          filename: 'a.png',
          angleId: 'front',
          colorId: 'black',
          width: 100,
          height: 100,
          dataUrl: 'data:image/png;base64,AAA',
        },
      ],
    )

    const dataUrl = createExportManifestDataUrl({
      payload,
      token: { token: 'signed-token', keyId: 'shop-key-1' },
    })

    expect(dataUrl.startsWith('data:application/json')).toBe(true)
    expect(dataUrl.includes('signed-token')).toBe(true)
  })
})
