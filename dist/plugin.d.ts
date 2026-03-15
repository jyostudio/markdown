/**
 * Markdown 解析/渲染插件接口。
 *
 * 插件可以扩展：
 * - 块级语法（如 $$...$$ 数学公式块、:::mindmap 等）
 * - 行内语法（如 $...$ 行内公式）
 * - HTML 渲染（自定义节点 → HTML）
 * - Markdown 渲染（自定义节点 → Markdown）
 * - HTML 解析（自定义 HTML 元素 → AST）
 * - AST 后处理
 */
import type { Node } from "./node";
/**
 * Markdown 插件定义。
 */
export interface MarkdownPlugin {
    /** 插件名称 */
    name: string;
    /**
     * 块级解析扩展。
     * 每个 handler 定义一种新的块级语法。
     */
    blockHandlers?: BlockHandler[];
    /**
     * 行内解析扩展。
     * 每个 handler 定义一种新的行内语法。
     */
    inlineHandlers?: InlineHandler[];
    /**
     * 自定义 HTML 渲染规则。
     * key 为节点类型名（如 "math_block"）。
     */
    htmlRenderers?: Record<string, HtmlRenderRule>;
    /**
     * 自定义 Markdown 渲染规则。
     * key 为节点类型名。
     */
    markdownRenderers?: Record<string, MarkdownRenderRule>;
    /**
     * 自定义 HTML→AST 转换规则。
     * key 为 HTML 标签名（小写，如 "math"）。
     */
    htmlParsers?: Record<string, HtmlParseRule>;
    /**
     * AST 后处理钩子。解析完成后、渲染前调用。
     */
    postProcess?: (ast: Node) => void;
}
/**
 * 块级语法扩展。
 *
 * 在 BlockParser 的 `tryBlockStart` 和 `blockContinue` 中被调用。
 *
 * @example
 * ```ts
 * const mathBlockHandler: BlockHandler = {
 *   nodeType: "math_block",
 *   acceptsLines: true,
 *   tryStart(parser, container) {
 *     const line = parser.currentLine.slice(parser.nextNonspace);
 *     if (line.startsWith("$$")) {
 *       parser.closeUnmatchedBlocks();
 *       const node = parser.addChild("math_block", parser.nextNonspace);
 *       parser.advanceOffset(parser.currentLine.length - parser.offset, false);
 *       return true;
 *     }
 *     return false;
 *   },
 *   tryContinue(parser, node) {
 *     if (parser.currentLine.slice(parser.nextNonspace).startsWith("$$")) {
 *       parser.lastLineLength = parser.currentLine.length;
 *       parser.finalize(node, parser.lineNumber);
 *       return 2;
 *     }
 *     return 0;
 *   },
 *   finalize(parser, node) {
 *     node.literal = node.stringContent.replace(/\n$/, "");
 *     node.stringContent = "";
 *   }
 * };
 * ```
 */
export interface BlockHandler {
    /** 创建的节点类型名（如 "math_block"） */
    nodeType: string;
    /** 是否为容器类型（可包含子块），默认 false */
    isContainer?: boolean;
    /** 是否接受原始行文本（类似代码块），默认 false */
    acceptsLines?: boolean;
    /**
     * 尝试在当前行开始一个新块。
     * 返回 true 表示成功创建了块，false 表示未匹配。
     *
     * 可通过 parser 的公共字段读取当前行状态：
     * - `parser.currentLine` — 当前行文本
     * - `parser.nextNonspace` — 下一个非空白字符位置
     * - `parser.offset` — 当前偏移
     * - `parser.indent` — 缩进级别
     * - `parser.blank` — 是否空行
     *
     * 成功时应调用 `parser.closeUnmatchedBlocks()` 和 `parser.addChild(nodeType, offset)`。
     */
    tryStart: (parser: any, container: Node) => boolean;
    /**
     * 尝试继续当前块到新行。
     * - 0 = 继续
     * - 1 = 不匹配，终结块
     * - 2 = 不匹配，终结块且回退偏移
     */
    tryContinue?: (parser: any, node: Node) => 0 | 1 | 2;
    /**
     * 终结块节点时的处理逻辑。
     */
    finalize?: (parser: any, node: Node) => void;
    /**
     * 判断本块类型可以包含哪些子块类型。
     * 仅当 isContainer=true 时有效。
     */
    canContain?: (childType: string) => boolean;
}
/**
 * 行内语法扩展。
 *
 * 在 InlineParser 的 `parseInline` 中，当遇到 triggerCharCode 对应的
 * 字符时被调用。
 *
 * @example
 * ```ts
 * const inlineMathHandler: InlineHandler = {
 *   triggerCharCode: 0x24, // $
 *   parse(parser, block) {
 *     const subj = parser.subject;
 *     const start = parser.pos;
 *     if (subj.charAt(start) !== "$") return false;
 *     const end = subj.indexOf("$", start + 1);
 *     if (end < 0) return false;
 *     const node = new Node("math_inline");
 *     node.literal = subj.slice(start + 1, end);
 *     block.appendChild(node);
 *     parser.pos = end + 1;
 *     return true;
 *   }
 * };
 * ```
 */
export interface InlineHandler {
    /** 触发字符的 Unicode 码点（如 0x24 for '$'） */
    triggerCharCode: number;
    /**
     * 在当前位置尝试解析行内元素。
     * 返回 true 表示已消费字符并添加了节点，false 表示未匹配。
     *
     * 可通过 parser 读取：
     * - `parser.subject` — 当前行文本
     * - `parser.pos` — 当前解析位置
     *
     * 成功时应更新 `parser.pos` 并向 block 添加子节点。
     */
    parse: (parser: any, block: Node) => boolean;
}
/**
 * 自定义 HTML 渲染规则。
 */
export interface HtmlRenderRule {
    /**
     * 渲染节点为 HTML 片段。
     * @param node 当前节点
     * @param entering true=进入节点（开标签），false=离开节点（闭标签）
     * @returns HTML 字符串
     */
    render: (node: Node, entering: boolean) => string;
}
/**
 * 自定义 Markdown 渲染规则。
 */
export interface MarkdownRenderRule {
    /**
     * 渲染节点为 Markdown 文本。
     * @param node 当前节点
     * @param renderChildren 渲染子节点的辅助函数
     * @returns Markdown 字符串
     */
    render: (node: Node, renderChildren: (node: Node) => string) => string;
}
/**
 * 自定义 HTML→AST 转换规则。
 */
export interface HtmlParseRule {
    /**
     * 将 HTML 元素转换为 AST 节点并挂入父节点。
     * @param element HTML 元素
     * @param parent 父 AST 节点
     * @param processChildren 递归处理子元素的辅助函数
     */
    parse: (element: Element, parent: Node, processChildren: (el: Element, parent: Node) => void) => void;
}
/**
 * 从插件数组中收集指定类型的 handler 映射。
 */
export declare function collectPluginMap<T>(plugins: MarkdownPlugin[], getter: (p: MarkdownPlugin) => Record<string, T> | undefined): Map<string, T>;
/**
 * 从插件数组中收集指定类型的 handler 数组。
 */
export declare function collectPluginHandlers<T>(plugins: MarkdownPlugin[], getter: (p: MarkdownPlugin) => T[] | undefined): T[];
//# sourceMappingURL=plugin.d.ts.map