import { block } from '@milkdown/kit/plugin/block'

import type { DefineFeature, Icon } from '../shared'
import type { GroupBuilder } from './menu/group-builder'

import { configureBlockHandle } from './handle'
import { configureMenu, menu, menuAPI, configureHandleMenu, handleMenu, handleMenuAPI } from './menu'

interface BlockEditConfig {
  handleAddIcon: Icon
  handleDragIcon: Icon
  buildMenu: (builder: GroupBuilder) => void

  slashMenuTextGroupLabel: string
  slashMenuTextIcon: Icon
  slashMenuTextLabel: string
  slashMenuH1Icon: Icon
  slashMenuH1Label: string
  slashMenuH2Icon: Icon
  slashMenuH2Label: string
  slashMenuH3Icon: Icon
  slashMenuH3Label: string
  slashMenuH4Icon: Icon
  slashMenuH4Label: string
  slashMenuH5Icon: Icon
  slashMenuH5Label: string
  slashMenuH6Icon: Icon
  slashMenuH6Label: string
  slashMenuQuoteIcon: Icon
  slashMenuQuoteLabel: string
  slashMenuDividerIcon: Icon
  slashMenuDividerLabel: string

  slashMenuListGroupLabel: string
  slashMenuBulletListIcon: Icon
  slashMenuBulletListLabel: string
  slashMenuOrderedListIcon: Icon
  slashMenuOrderedListLabel: string
  slashMenuTaskListIcon: Icon
  slashMenuTaskListLabel: string

  slashMenuAdvancedGroupLabel: string
  slashMenuImageIcon: Icon
  slashMenuImageLabel: string
  slashMenuCodeBlockIcon: Icon
  slashMenuCodeBlockLabel: string
  slashMenuTableIcon: Icon
  slashMenuTableLabel: string
  slashMenuMathIcon: Icon
  slashMenuMathLabel: string
  // yswang
  slashMenuGraphIcon: Icon
  slashMenuGraphLabel: string
}

export type BlockEditFeatureConfig = Partial<BlockEditConfig>

export const defineFeature: DefineFeature<BlockEditFeatureConfig> = (
  editor,
  config
) => {
  editor
    .config((ctx) => configureBlockHandle(ctx, config))
    .config((ctx) => configureMenu(ctx, config))
    .config((ctx) => configureHandleMenu(ctx, config)) // yswang
    .use(menuAPI)
    .use(block)
    .use(menu)
    .use(handleMenu)  // yswang
    .use(handleMenuAPI) // yswang
}
