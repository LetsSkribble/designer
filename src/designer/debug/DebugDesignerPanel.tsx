import { Designer } from '../Designer'
import { DEFAULT_DESIGNER_CONFIG, createInitialProjectState } from '../defaults'

export interface DebugDesignerPanelProps {
  className?: string
}

export const DebugDesignerPanel = ({ className }: DebugDesignerPanelProps) => {
  return (
    <Designer
      className={className}
      initialConfig={DEFAULT_DESIGNER_CONFIG}
      initialProject={createInitialProjectState(DEFAULT_DESIGNER_CONFIG)}
    />
  )
}
