import { commandsCtx } from '@milkdown/core';
import { $inputRule, $markSchema, $remark, $command, $useKeymap } from '@milkdown/kit/utils';
import { markRule } from '@milkdown/prose';
import { toggleMark } from '@milkdown/prose/commands';

/**
 * yswang
 * 背景黄色高亮语法解析器插件，用于将 `==content==` 语法解析为 `<mark>content</mark>`。
 */

// 定义 $remark 用于解析默认的 markdown 内容
const remarkMark = $remark('remarkMark', () => () => (tree) => {
    const visit = (node: any) => {
        if (node.type === 'text' && typeof node.value === 'string') {
            const value = node.value;
            const regex = /==([^=]+)==/g;
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
                    type: 'mark',
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

export const highlightMarkSchema = $markSchema('mark', () => ({
    inclusive: true,
    parseDOM: [{
        tag: 'mark',
    }],
    toDOM: (_mark) => ['mark', 0],
    parseMarkdown: {
        match: (node) => node.type === 'mark',
        runner: (state, node, type) => {
            state.openMark(type);
            state.addText(node.content as string);
            state.closeMark(type);
        },
    },
    toMarkdown: {
        match: (mark) => mark.type.name === 'mark',
        runner: (state, mark, node) => {
            state.withMark(mark, 'text', node.text ? ('==' + node.text + '==') : '');
        },
    }
}));


const markInputRule = $inputRule((ctx) => {
    return markRule(/==([^=]+)==/, highlightMarkSchema.type(ctx))
});

export const toggleHighlightCommand = $command('ToggleHighlight', (ctx) => () => {
    return toggleMark(highlightMarkSchema.type(ctx));
});

const highlightKeymap = $useKeymap('highlightKeymap', {
    'ToggleHighlight': {
      shortcuts: 'Mod-m',
      command: (ctx) => {
        const commands = ctx.get(commandsCtx)
        return () => commands.call(toggleHighlightCommand.key)
      },
    },
});

export const highlightMarkPlugin = [
    remarkMark, 
    markInputRule, 
    highlightMarkSchema, 
    toggleHighlightCommand, 
    highlightKeymap
].flat();
