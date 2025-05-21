import { Icon } from '@milkdown/kit/component'
import { defineComponent, ref, h, Fragment } from 'vue'

import type { Icon as IconType } from '../../shared'

h
Fragment

export interface BlockHandleProps {
  onAdd: () => void
  addIcon: IconType
  handleIcon: IconType
  // yswang
  onHandle: (trigger: any) => void
}

export const BlockHandle = defineComponent<BlockHandleProps>({
  props: {
    onAdd: {
      type: Function,
      required: true,
    },
    addIcon: {
      type: Function,
      required: true,
    },
    handleIcon: {
      type: Function,
      required: true,
    },
    // yswang
    onHandle: {
      type: Function,
      required: true,
    }
  },
  setup(props) {
    const addButton = ref<HTMLDivElement>()
    // yswang
    const handleButton = ref<HTMLDivElement>()

    return () => {
      return (
        <>
          <div
            ref={addButton}
            class="operation-item"
            onPointerdown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              addButton.value?.classList.add('active')
            }}
            onPointerup={(e) => {
              e.preventDefault()
              e.stopPropagation()
              addButton.value?.classList.remove('active')
              props.onAdd()
            }}
          >
            <Icon icon={props.addIcon()} />
          </div>
          <div 
            class="operation-item"
            ref={handleButton}
            onPointerdown={(e) => {
              e.stopPropagation()
              handleButton.value?.classList.add('active')
            }}
            onPointerup={(e) => {
              e.stopPropagation()
              handleButton.value?.classList.remove('active')
              props.onHandle(handleButton.value)
            }}
          >
            <Icon icon={props.handleIcon()} />
          </div>
        </>
      )
    }
  },
})
