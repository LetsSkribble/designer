import type { ProjectState } from './types'
import { DESIGNER_ACTIONS } from './events'

const MIN_SCALE = 0.001

const clampScale = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(MIN_SCALE, value)
}

const sanitizeProjectState = (project: ProjectState): ProjectState => {
  const sanitizedElements = project.elements
    .filter((element) => Boolean(project.assets[element.assetId]))
    .map((element) => ({
      ...element,
      transform: {
        ...element.transform,
        scaleX: clampScale(element.transform.scaleX, 1),
        scaleY: clampScale(element.transform.scaleY, 1),
      },
    }))

  const selectedExists = sanitizedElements.some(
    (element) => element.id === project.selection.elementId,
  )

  return {
    ...project,
    elements: sanitizedElements,
    selection: selectedExists ? project.selection : { elementId: undefined },
  }
}

export interface DesignerCommand {
  name: string
  execute: (state: ProjectState) => ProjectState
  undo: (state: ProjectState) => ProjectState
}

export class CommandStack {
  private undoStack: DesignerCommand[] = []
  private redoStack: DesignerCommand[] = []
  private maxDepth: number

  constructor(maxDepth: number = 100) {
    this.maxDepth = maxDepth
  }

  push(command: DesignerCommand): void {
    this.undoStack.push(command)
    this.redoStack = []

    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift()
    }
  }

  undo(state: ProjectState): ProjectState | null {
    if (!this.canUndo) {
      return null
    }

    const command = this.undoStack.pop()
    if (!command) return null

    this.redoStack.push(command)
    return command.undo(state)
  }

  redo(state: ProjectState): ProjectState | null {
    if (!this.canRedo) {
      return null
    }

    const command = this.redoStack.pop()
    if (!command) return null

    this.undoStack.push(command)
    return command.execute(state)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}

export type DesignerAction =
  | { type: typeof DESIGNER_ACTIONS.PROJECT_INIT; payload: { schema: string } }
  | {
      type: typeof DESIGNER_ACTIONS.PRODUCT_SET
      payload: { productId: string }
    }
  | {
      type: typeof DESIGNER_ACTIONS.COLORS_SET
      payload: { colorIds: string[] }
    }
  | {
      type: typeof DESIGNER_ACTIONS.PRINT_AREA_SET
      payload: { areaId: string }
    }
  | {
      type: typeof DESIGNER_ACTIONS.ELEMENT_ADD
      payload: { assetId: string; x?: number; y?: number; scaleX?: number; scaleY?: number }
    }
  | {
      type: typeof DESIGNER_ACTIONS.ELEMENT_REMOVE
      payload: { elementId: string }
    }
  | {
      type: typeof DESIGNER_ACTIONS.ASSET_UPLOAD_SUCCESS
      payload: { metadata: import('./types').AssetMetadata }
    }
  | {
      type: typeof DESIGNER_ACTIONS.ELEMENT_SELECT
      payload: { elementId?: string }
    }
  | {
      type: typeof DESIGNER_ACTIONS.ELEMENT_TRANSFORM_UPDATE
      payload: {
        elementId: string
        x: number
        y: number
        scaleX: number
        scaleY: number
        rotationDeg: number
      }
    }
  | {
      type: typeof DESIGNER_ACTIONS.ELEMENT_RESET_TRANSFORM
      payload: { elementId: string }
    }
  | {
      type: typeof DESIGNER_ACTIONS.HISTORY_UNDO
      payload?: void
    }
  | {
      type: typeof DESIGNER_ACTIONS.HISTORY_REDO
      payload?: void
    }
  | {
      type: typeof DESIGNER_ACTIONS.AUTOSAVE_RESTORE
      payload: { project: ProjectState }
    }
  | { type: typeof DESIGNER_ACTIONS.WARNING_ACKNOWLEDGE; payload: { id: string } }

export const designerReducer = (
  state: ProjectState,
  action: DesignerAction,
): ProjectState => {
  switch (action.type) {
    case DESIGNER_ACTIONS.PROJECT_INIT:
      return {
        ...state,
        schemaVersion: action.payload.schema,
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }

    case DESIGNER_ACTIONS.PRODUCT_SET:
      return {
        ...state,
        productId: action.payload.productId as any,
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }

    case DESIGNER_ACTIONS.COLORS_SET:
      return {
        ...state,
        selectedColorIds: action.payload.colorIds,
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }

    case DESIGNER_ACTIONS.PRINT_AREA_SET:
      return {
        ...state,
        activePrintAreaId: action.payload.areaId as any,
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }

    case DESIGNER_ACTIONS.ELEMENT_ADD: {
      const newElement = {
        id: crypto.randomUUID(),
        type: 'image' as const,
        assetId: action.payload.assetId,
        transform: {
          x: action.payload.x ?? 0,
          y: action.payload.y ?? 0,
          scaleX: clampScale(action.payload.scaleX, 1),
          scaleY: clampScale(action.payload.scaleY, 1),
          rotationDeg: 0,
          origin: 'center' as const,
        },
        opacity: 1,
        visible: true,
        locked: false,
      }

      return {
        ...state,
        elements: [...state.elements, newElement],
        selection: { elementId: newElement.id },
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }
    }

    case DESIGNER_ACTIONS.ELEMENT_REMOVE: {
      const remainingElements = state.elements.filter(
        (elem) => elem.id !== action.payload.elementId,
      )

      return {
        ...state,
        elements: remainingElements,
        selection:
          state.selection.elementId === action.payload.elementId
            ? { elementId: undefined }
            : state.selection,
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }
    }

    case DESIGNER_ACTIONS.ASSET_UPLOAD_SUCCESS: {
      const { metadata } = action.payload

      return {
        ...state,
        assets: {
          ...state.assets,
          [metadata.id]: metadata,
        },
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }
    }

    case DESIGNER_ACTIONS.ELEMENT_SELECT:
      return {
        ...state,
        selection: { elementId: action.payload.elementId },
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }

    case DESIGNER_ACTIONS.ELEMENT_TRANSFORM_UPDATE: {
      const updatedElements = state.elements.map((elem) => {
        if (elem.id !== action.payload.elementId) return elem

        return {
          ...elem,
          transform: {
            x: action.payload.x,
            y: action.payload.y,
            scaleX: clampScale(action.payload.scaleX, elem.transform.scaleX),
            scaleY: clampScale(action.payload.scaleY, elem.transform.scaleY),
            rotationDeg: action.payload.rotationDeg,
            origin: 'center' as const,
          },
        }
      })

      return {
        ...state,
        elements: updatedElements,
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }
    }

    case DESIGNER_ACTIONS.ELEMENT_RESET_TRANSFORM: {
      const resetElements = state.elements.map((elem) => {
        if (elem.id !== action.payload.elementId) return elem

        return {
          ...elem,
          transform: {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotationDeg: 0,
            origin: 'center' as const,
          },
        }
      })

      return {
        ...state,
        elements: resetElements,
        meta: {
          ...state.meta,
          updatedAt: Date.now(),
        },
      }
    }

    case DESIGNER_ACTIONS.WARNING_ACKNOWLEDGE: {
      const updatedWarnings = state.warnings.map((warning) => {
        if (warning.id !== action.payload.id) return warning
        return { ...warning, acknowledged: true }
      })

      return {
        ...state,
        warnings: updatedWarnings,
        meta: {
          ...state.meta,
          userAcknowledgments: [
            ...state.meta.userAcknowledgments,
            action.payload.id,
          ],
        },
      }
    }

    case DESIGNER_ACTIONS.AUTOSAVE_RESTORE:
      return sanitizeProjectState(action.payload.project)

    default:
      return state
  }
}
