/**
 * @jyostudio/markdown
 *
 * 符合 CommonMark 0.31.2 规范的 Markdown 解析器和渲染器。
 *
 * 架构：
 *   Markdown 文本  ──▶  Parser.parse()  ──▶  AST（节点树）  ──▶  HtmlRenderer.render()  ──▶  HTML 字符串
 *
 * AST 是核心的中间表示。要添加新的输出格式（例如 HTML→Markdown 转换的
 * Markdown 渲染器），请创建一个新的 Renderer 子类来遍历 AST。
 *
 * 规划中的接口：
 *   - HtmlParser：       HTML 字符串  ──▶  AST
 *   - MarkdownRenderer： AST  ──▶  Markdown 字符串
 *   组合使用：HTML → AST → Markdown
 */
export { Node, NodeWalker, isContainer, registerContainerType } from "./node";
export type { NodeType, ListData, NodeWalkerEvent, TableAlign } from "./node";
export { BlockParser as Parser } from "./block-parser";
export type { RefMap } from "./common";
export { InlineParser } from "./inline-parser";
export { HtmlRenderer, Renderer } from "./html-renderer";
export type { RendererOptions } from "./html-renderer";
export { HtmlParser } from "./html-parser";
export { MarkdownRenderer } from "./markdown-renderer";
export type { MarkdownPlugin, BlockHandler, InlineHandler, HtmlRenderRule, MarkdownRenderRule, HtmlParseRule, } from "./plugin";
export { collectPluginMap, collectPluginHandlers } from "./plugin";
import type { Node } from "./node";
/**
 * 将 Markdown 字符串解析为 AST。
 *
 * ```ts
 * const ast = parse('# Hello\n\nWorld');
 * const ast2 = parse(md, [mathPlugin]);
 * ```
 */
export declare const parse: import("@jyostudio/overload").OverloadBuilder<[(args_0: string, args_1: any[]) => Node, (args_0: string) => Node]>;
/**
 * 将 AST 节点树渲染为 HTML 字符串。
 *
 * ```ts
 * const html = renderHtml(ast);
 * ```
 */
export declare const renderHtml: import("@jyostudio/overload").OverloadBuilder<[(args_0: any, args_1: any) => string, (args_0: any) => string]>;
/**
 * 将 Markdown 字符串直接转换为 HTML。
 *
 * ```ts
 * const html = markdownToHtml('**bold** text');
 * // → '<p><strong>bold</strong> text</p>\n'
 * ```
 */
export declare const markdownToHtml: import("@jyostudio/overload").OverloadBuilder<[(args_0: string, args_1: any) => string, (args_0: string) => string]>;
/**
 * 将 HTML 字符串解析为 AST。
 *
 * ```ts
 * const ast = parseHtml('<p><strong>Hello</strong></p>');
 * const ast2 = parseHtml(html, [mathPlugin]);
 * ```
 */
export declare const parseHtml: import("@jyostudio/overload").OverloadBuilder<[(args_0: string, args_1: any[]) => Node, (args_0: string) => Node]>;
/**
 * 将 AST 节点树渲染为 Markdown 字符串。
 *
 * ```ts
 * const md = renderMarkdown(ast);
 * const md2 = renderMarkdown(ast, [mathPlugin]);
 * ```
 */
export declare const renderMarkdown: import("@jyostudio/overload").OverloadBuilder<[(args_0: any, args_1: any[]) => string, (args_0: any) => string]>;
/**
 * 将 HTML 字符串直接转换为 Markdown。
 *
 * ```ts
 * const md = htmlToMarkdown('<p><strong>bold</strong> text</p>');
 * // → '**bold** text\n\n'
 * ```
 */
export declare const htmlToMarkdown: import("@jyostudio/overload").OverloadBuilder<[(args_0: string, args_1: any[]) => string, (args_0: string) => string]>;
//# sourceMappingURL=index.d.ts.map