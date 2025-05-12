import type { Node } from '@milkdown/prose/model'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('abcedfghicklmn', 10)

export const getId = (node?: Node) => node?.attrs?.identity || nanoid()
