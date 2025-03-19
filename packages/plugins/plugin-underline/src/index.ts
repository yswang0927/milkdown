
import { commandsCtx } from '@milkdown/core';
import { $inputRule, $markSchema, $remark, $command, $useKeymap } from '@milkdown/kit/utils';
import { markRule } from '@milkdown/prose'
import { toggleMark } from '@milkdown/prose/commands';

/**
 * 下划线语法解析器插件，用于将 `__content__` 语法解析为 `<u>content</u>`。
 */

// 定义 $remark 用于解析默认的 markdown 内容
const remarkUnderline = $remark('remarkUnderline', () => () => (tree) => {
    const visit = (node: any) => {
        if (node.type === 'text' && typeof node.value === 'string') {
            const value = node.value;
            const regex = /__([^_]+)__/g;
            let match;
            let lastIndex = 0;
            const nodes = [];

            while ((match = regex.exec(value)) !== null) {
                if (match.index > lastIndex) {
                    nodes.push({
                        type: 'text',
                        value: value.slice(lastIndex, match.index)
                    });
                }

                nodes.push({
                    type: 'underline',
                    content: match[1]
                });

                //lastIndex = match.index + match[0].length;
                lastIndex = regex.lastIndex;
            }

            if (lastIndex < value.length) {
                nodes.push({
                    type: 'text',
                    value: value.slice(lastIndex)
                });
            }

            return nodes.length > 0 ? nodes : [node];
        }

        if (Array.isArray(node.children)) {
            node.children = node.children.flatMap(visit);
        }

        return [node];
    };

    tree.children = tree.children.flatMap(visit);
    return tree;
});

const underlineSchema = $markSchema('underline', () => ({
    inclusive: true,
    parseDOM: [{
        tag: 'u',
    }],
    toDOM: (mark) => ['u', 0],
    parseMarkdown: {
        match: (node) => node.type === 'underline',
        runner: (state, node, type) => {
            state.openMark(type);
            state.addText(node.content as string);
            state.closeMark(type);
        },
    },
    toMarkdown: {
        match: (mark) => mark.type.name === 'underline',
        runner: (state, mark, node) => {
            state.withMark(mark, 'text', node.text ? ('__' + node.text + '__') : '');
        },
    }
}));


const markInputRule = $inputRule((ctx) => {
    return markRule(/__([^_]+)__/, underlineSchema.type(ctx));
});

const toggleUnderlineCommand = $command('ToggleUnderline', (ctx) => () => {
    return toggleMark(underlineSchema.type(ctx));
});

const underlineKeymap = $useKeymap('underlineKeymap', {
    'ToggleUnderline': {
      shortcuts: 'Mod-u',
      command: (ctx) => {
        const commands = ctx.get(commandsCtx)
        return () => commands.call(toggleUnderlineCommand.key)
      },
    },
});

export const underlinePlugin = [remarkUnderline, markInputRule, underlineSchema, toggleUnderlineCommand, underlineKeymap].flat();
