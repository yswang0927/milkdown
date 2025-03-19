import { $ctx } from '@milkdown/utils'
import { html } from 'atomico'
import { loadingIcon } from './icons'

export interface FilePickerConfig {
  uploadingHTML: () => ReturnType<typeof html>
  onUpload: (file: File) => Promise<string>
  proxyDomURL?: (url: string) => Promise<string> | string
}

export const defaultFilePickerConfig: FilePickerConfig = {
  uploadingHTML: () => loadingIcon,
  onUpload: (file) => Promise.resolve(URL.createObjectURL(file))
}

export const filePickerConfig = $ctx(defaultFilePickerConfig, 'filePickerConfigCtx')
