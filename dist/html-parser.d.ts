/**
 * HTML 解析器：将 HTML 字符串转换为 CommonMark AST。
 *
 * 使用平台的 DOMParser API（浏览器和现代 Node.js 均可用）。
 */
import { Node } from "./node";
import type { MarkdownPlugin } from "./plugin";
/**
 * 将 HTML 字符串解析为 CommonMark AST（节点树）。
 */
export declare class HtmlParser {
    #private;
    constructor(plugins?: MarkdownPlugin[]);
    parse(html: string): Node;
}
//# sourceMappingURL=html-parser.d.ts.map