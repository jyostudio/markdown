/**
 * Markdown 渲染器：将 CommonMark AST 转换回 Markdown 文本。
 *
 * 使用递归方式，以便容器节点（引用块、列表）
 * 能够对子节点的输出进行变换。
 */
import { Node } from "./node";
import { Renderer } from "./html-renderer";
/**
 * 将 CommonMark AST 渲染为 Markdown 字符串。
 */
export declare class MarkdownRenderer extends Renderer<string> {
    #private;
    /**
     * 遍历 AST 并渲染为 Markdown 字符串。
     */
    render(ast: Node): string;
}
//# sourceMappingURL=markdown-renderer.d.ts.map