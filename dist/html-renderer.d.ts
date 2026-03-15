/**
 * CommonMark AST 的 HTML 渲染器。
 *
 * 遍历 AST 并生成 HTML 字符串。
 */
import { Node, type NodeType } from "./node";
import type { MarkdownPlugin } from "./plugin";
/**
 * HtmlRenderer 的配置选项。
 */
export interface RendererOptions {
    /**
     * 软换行的输出字符串（默认为 "\n")
     */
    softbreak?: string;
    /**
     * 是否启用安全模式（过滤原始 HTML 内容与潜在危险链接）
     */
    safe?: boolean;
    /**
     * 允许转换的 Markdown 特性白名单。
     *
     * 仅白名单中的特性会被转换为 HTML，其余特性以原始 Markdown 语法输出。
     * 不传此选项时默认支持所有特性。
     *
     * 可用值（对应 AST 节点类型）：
     * `"heading"` `"code_block"` `"html_block"` `"thematic_break"`
     * `"block_quote"` `"list"` `"emph"` `"strong"` `"link"` `"image"`
     * `"code"` `"html_inline"`
     *
     * @example
     * // 只允许粗体、斜体和链接
     * markdownToHtml(md, { allowedFeatures: ["strong", "emph", "link"] })
     */
    allowedFeatures?: NodeType[] | Set<NodeType>;
    /**
     * 插件列表。插件可提供自定义节点类型的 HTML 渲染规则。
     */
    plugins?: MarkdownPlugin[];
}
/**
 * 抽象基础渲染器。通过继承并实现节点处理器可以创建
 * 自定义输出格式（例如 Markdown、纯文本等）。
 */
export declare abstract class Renderer<T> {
    /**
     * 将 AST 渲染为目标格式，由子类实现。
     */
    abstract render(ast: Node): T;
}
/**
 * 将 CommonMark AST 渲染为 HTML 字符串。
 */
export declare class HtmlRenderer extends Renderer<string> {
    #private;
    constructor(options?: RendererOptions);
    /**
     * 遍历 AST 并渲染为 HTML 字符串。
     */
    render(ast: Node): string;
}
//# sourceMappingURL=html-renderer.d.ts.map