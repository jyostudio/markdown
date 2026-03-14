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

export { Node, NodeWalker, isContainer } from "./node";
export type { NodeType, ListData, NodeWalkerEvent } from "./node";

export { BlockParser as Parser } from "./block-parser";
export type { RefMap } from "./common";

export { InlineParser } from "./inline-parser";

export { HtmlRenderer, Renderer } from "./html-renderer";
export type { RendererOptions } from "./html-renderer";

export { HtmlParser } from "./html-parser";

export { MarkdownRenderer } from "./markdown-renderer";

// #region 便捷函数

import overload from "@jyostudio/overload";
import { BlockParser } from "./block-parser";
import { HtmlRenderer } from "./html-renderer";
import { HtmlParser } from "./html-parser";
import { MarkdownRenderer } from "./markdown-renderer";
import type { Node } from "./node";
import type { RendererOptions } from "./html-renderer";

/**
 * 将 Markdown 字符串解析为 AST。
 *
 * ```ts
 * const ast = parse('# Hello\n\nWorld');
 * ```
 */
export const parse = overload(
  [String],
  function (markdown: string): Node {
    const parser = new BlockParser();
    return parser.parse(markdown);
  },
);

/**
 * 将 AST 节点树渲染为 HTML 字符串。
 *
 * ```ts
 * const html = renderHtml(ast);
 * ```
 */
export const renderHtml = overload(
  [Object],
  function (ast: Node): string {
    const renderer = new HtmlRenderer();
    return renderer.render(ast);
  },
).add(
  [Object, Object],
  function (ast: Node, options: RendererOptions): string {
    const renderer = new HtmlRenderer(options);
    return renderer.render(ast);
  },
);

/**
 * 将 Markdown 字符串直接转换为 HTML。
 *
 * ```ts
 * const html = markdownToHtml('**bold** text');
 * // → '<p><strong>bold</strong> text</p>\n'
 * ```
 */
export const markdownToHtml = overload(
  [String],
  function (markdown: string): string {
    return (renderHtml as Function)(parse(markdown));
  },
).add(
  [String, Object],
  function (markdown: string, options: RendererOptions): string {
    return (renderHtml as Function)(parse(markdown), options);
  },
);

/**
 * 将 HTML 字符串解析为 AST。
 *
 * ```ts
 * const ast = parseHtml('<p><strong>Hello</strong></p>');
 * ```
 */
export const parseHtml = overload(
  [String],
  function (html: string): Node {
    const parser = new HtmlParser();
    return parser.parse(html);
  },
);

/**
 * 将 AST 节点树渲染为 Markdown 字符串。
 *
 * ```ts
 * const md = renderMarkdown(ast);
 * ```
 */
export const renderMarkdown = overload(
  [Object],
  function (ast: Node): string {
    const renderer = new MarkdownRenderer();
    return renderer.render(ast);
  },
);

/**
 * 将 HTML 字符串直接转换为 Markdown。
 *
 * ```ts
 * const md = htmlToMarkdown('<p><strong>bold</strong> text</p>');
 * // → '**bold** text\n\n'
 * ```
 */
export const htmlToMarkdown = overload(
  [String],
  function (html: string): string {
    return (renderMarkdown as Function)(parseHtml(html));
  },
);

// #endregion
