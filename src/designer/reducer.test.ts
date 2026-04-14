import { describe, expect, it } from 'vitest'
import { createInitialProjectState, DEFAULT_DESIGNER_CONFIG } from './defaults'
import { DESIGNER_ACTIONS } from './events'
import { designerReducer } from './reducer'

describe('designerReducer guardrails', () => {
  it('clamps element add scale to minimum value', () => {
    const state = createInitialProjectState(DEFAULT_DESIGNER_CONFIG)
    const withAsset = designerReducer(state, {
      type: DESIGNER_ACTIONS.ASSET_UPLOAD_SUCCESS,
      payload: {
        metadata: {
          id: 'asset-1',
          filename: 'x.png',
          mimeType: 'image/png',
          width: 100,
          height: 100,
          hasAlpha: true,
          opaqueBackgroundRatio: 0,
          data: 'data:image/png;base64,AAA',
          uploadedAt: Date.now(),
        },
      },
    })

    const next = designerReducer(withAsset, {
      type: DESIGNER_ACTIONS.ELEMENT_ADD,
      payload: { assetId: 'asset-1', scaleX: 0, scaleY: -10 },
    })

    expect(next.elements[0]?.transform.scaleX).toBe(0.001)
    expect(next.elements[0]?.transform.scaleY).toBe(0.001)
  })

  it('removes invalid selected element after delete', () => {
    const state = createInitialProjectState(DEFAULT_DESIGNER_CONFIG)
    const withAsset = designerReducer(state, {
      type: DESIGNER_ACTIONS.ASSET_UPLOAD_SUCCESS,
      payload: {
        metadata: {
          id: 'asset-1',
          filename: 'x.png',
          mimeType: 'image/png',
          width: 100,
          height: 100,
          hasAlpha: true,
          opaqueBackgroundRatio: 0,
          data: 'data:image/png;base64,AAA',
          uploadedAt: Date.now(),
        },
      },
    })

    const withElement = designerReducer(withAsset, {
      type: DESIGNER_ACTIONS.ELEMENT_ADD,
      payload: { assetId: 'asset-1', scaleX: 1, scaleY: 1 },
    })

    const selectedId = withElement.selection.elementId
    const afterDelete = designerReducer(withElement, {
      type: DESIGNER_ACTIONS.ELEMENT_REMOVE,
      payload: { elementId: selectedId! },
    })

    expect(afterDelete.selection.elementId).toBeUndefined()
    expect(afterDelete.elements).toHaveLength(0)
  })
})
