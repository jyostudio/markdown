/**
 * HTML 解析器：将 HTML 字符串转换为 CommonMark AST。
 *
 * 使用平台的 DOMParser API（浏览器和现代 Node.js 均可用）。
 */
import { Node } from "./node";
/**
 * 将 HTML 字符串解析为 CommonMark AST（节点树）。
 */
export declare class HtmlParser {
    #private;
    parse(html: string): Node;
}
//# sourceMappingURL=html-parser.d.ts.map