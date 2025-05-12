import type { MilkdownPlugin } from '@milkdown/ctx'
import {
  diagramSchema,
  insertDiagramCommand,
  insertDiagramInputRules,
  mermaidConfigCtx,
  remarkDiagramPlugin,
  //blockMermaidSchema,
} from './node'

export * from './node'

/// All plugins exported by this package.
export const diagram: MilkdownPlugin[] = [
  remarkDiagramPlugin,
  mermaidConfigCtx,
  diagramSchema,
  insertDiagramCommand,
  insertDiagramInputRules,
  //blockMermaidSchema,
].flat()
