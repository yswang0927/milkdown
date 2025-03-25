import { $ctx } from '@milkdown/utils'

// yswang
export interface AIConfig {
  enabled: boolean
  base_url: string
  model: string
  api_key: string,
  prompts: {
    [key: string]: string
  }
};

export enum AIPromptsKey {
  Translate2CN = 'translate2CN',
  Translate2EN = 'translate2EN',
  ArticleWriter = 'article:writer',
  ArticleSummarize = 'article:summarize',
  ArticleOutline = 'article:outline',
  ArticlePolishing = 'article:polishing',
  ArticleContinue = 'article:continue',
};

export const defaultAIConfig: AIConfig = {
  enabled: false,
  base_url: '',
  model: '',
  api_key: '',
  prompts: {
    [AIPromptsKey.Translate2CN]: '你是一个好用的翻译助手。请将我的英文翻译成中文，将所有非中文的翻译成中文。我发给你所有的话都是需要翻译的内容，你只需要回答翻译结果。翻译结果请符合中文的语言习惯。',
    [AIPromptsKey.Translate2EN]: '你是一个好用的翻译助手。请将我的中文翻译成英文，将所有非中文的翻译成英文。我发给你所有的话都是需要翻译的内容，你只需要回答翻译结果。翻译结果请符合英文的语言习惯。',
    [AIPromptsKey.ArticleWriter]: '你是一个文章写作专家，根据用户输入的内容，生成一篇高质量的文章。',
    [AIPromptsKey.ArticleSummarize]: '你是一个文章总结专家，根据用户输入的内容，生成一篇高质量的总结。\n要求：\n1. 提取原文的核心观点和关键信息。\n2.用简洁明了的语言进行表达。\n3.保持原文的基本观点和信息完整性。',
    [AIPromptsKey.ArticleOutline]: '你是一位文本大纲生成专家，擅长根据用户的需求创建一个有条理且易于扩展成完整文章的大纲，你拥有强大的主题分析能力，能准确提取关键信息和核心要点。具备丰富的文案写作知识储备，熟悉各种文体和题材的文案大纲构建方法。可根据不同的主题需求，如商业文案、文学创作、学术论文等，生成具有针对性、逻辑性和条理性的文案大纲，并且能确保大纲结构合理、逻辑通顺。该大纲应该包含以下部分：\n引言：介绍主题背景，阐述撰写目的，并吸引读者兴趣。\n主体部分：第一段落：详细说明第一个关键点或论据，支持观点并引用相关数据或案例。\n第二段落：深入探讨第二个重点，继续论证或展开叙述，保持内容的连贯性和深度。\n第三段落：如果有必要，进一步讨论其他重要方面，或者提供不同的视角和证据。\n结论：总结所有要点，重申主要观点，并给出有力的结尾陈述，可以是呼吁行动、提出展望或其他形式的收尾。\n创意性标题：为文章构思一个引人注目的标题，确保它既反映了文章的核心内容又能激发读者的好奇心。',
    [AIPromptsKey.ArticlePolishing]: '你是一位文本润色专家，请对给定的文章进行润色，以提高文章的吸引力和阅读体验。\n润色重点：增强叙述的吸引力，改善语言风格，使文章更加引人入胜。\n要求：\n1.识别并改善文章的语言表达，使其更加流畅和生动。\n2.调整文章结构，确保内容逻辑清晰，易于阅读。\n3. 强化文章主题，突出核心信息或观点。',
    [AIPromptsKey.ArticleContinue]: '你是一位文本续写专家，请你对一篇未完成的文章进行续写，完成文章的剩余部分。\n要求：\n1.阅读并理解原文的内容和风格。\n2.确定续写的方向，确保与原文内容的连贯性。\n3.在保持原文风格的基础上，创造性地完成文章。',
  }
};

export type AIFeatureConfig = Partial<AIConfig>;

export const aiConfig = $ctx(defaultAIConfig, 'aiConfigCtx');
