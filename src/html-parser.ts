/**
 * HTML 解析器：将 HTML 字符串转换为 CommonMark AST。
 *
 * 使用平台的 DOMParser API（浏览器和现代 Node.js 均可用）。
 */

import overload from "@jyostudio/overload";
import { Node, type TableAlign } from "./node";
import type { MarkdownPlugin, HtmlParseRule } from "./plugin";
import { collectPluginMap } from "./plugin";


/**
 * 块级 HTML 标签名集合（用于判定 DOM 元素转换为块级 AST 节点）
 */
const BLOCK_ELEMENTS = new Set([
  "div",
  "section",
  "article",
  "aside",
  "nav",
  "header",
  "footer",
  "main",
  "figure",
  "figcaption",
  "details",
  "summary",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "dl",
  "dt",
  "dd",
  "address",
  "fieldset",
  "form",
]);


/**
 * 允许直接包含块级子节点的父节点类型集合
 */
const BLOCK_PARENTS = new Set(["document", "block_quote", "list", "item"]);


/**
 * 将 HTML 字符串解析为 CommonMark AST（节点树）。
 */
export class HtmlParser {
  /**
   * 插件提供的自定义 HTML→AST 转换规则
   */
  #pluginParsers: Map<string, HtmlParseRule>;

  constructor(plugins?: MarkdownPlugin[]) {
    this.#pluginParsers = collectPluginMap(
      plugins || [],
      p => p.htmlParsers,
    );
  }

  parse(html: string): Node;
  parse(...params: unknown[]): any {
    HtmlParser.prototype.parse = overload([String], function (this: HtmlParser, html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const root = new Node("document");
      this.#processChildren(doc.body, root);
      return root;
    });
    return (HtmlParser.prototype.parse as Function).apply(this, params);
  }

  #processChildren(element: globalThis.Node, parent: Node): void {
    for (const child of element.childNodes) {
      this.#processNode(child, parent);
    }
  }

  #processNode(domNode: globalThis.Node, parent: Node): void {
    if (domNode.nodeType === 3 /* 文本节点 */) {
      const text = domNode.textContent || "";
      if (!text) return;
      if (/^\s*$/.test(text) && BLOCK_PARENTS.has(parent.type)) return;
      const textNode = new Node("text");
      textNode.literal = text;
      parent.appendChild(textNode);
      return;
    }

    if (domNode.nodeType !== 1 /* 元素节点 */) return;

    const el = domNode as Element;
    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case "p": {
        const node = new Node("paragraph");
        parent.appendChild(node);
        this.#processChildren(el, node);
        break;
      }
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const node = new Node("heading");
        node.level = parseInt(tag[1]);
        parent.appendChild(node);
        this.#processChildren(el, node);
        break;
      }
      case "blockquote": {
        const node = new Node("block_quote");
        parent.appendChild(node);
        this.#processChildren(el, node);
        break;
      }
      case "pre": {
        const codeEl = el.querySelector("code");
        const node = new Node("code_block");
        if (codeEl) {
          const cls = codeEl.getAttribute("class") || "";
          const m = cls.match(/language-(\S+)/);
          if (m) node.info = m[1];
          node.literal = codeEl.textContent || "";
        } else {
          node.literal = el.textContent || "";
        }
        parent.appendChild(node);
        break;
      }
      case "code": {
        const node = new Node("code");
        node.literal = el.textContent || "";
        parent.appendChild(node);
        break;
      }
      case "em":
      case "i": {
        const node = new Node("emph");
        parent.appendChild(node);
        this.#processChildren(el, node);
        break;
      }
      case "strong":
      case "b": {
        const node = new Node("strong");
        parent.appendChild(node);
        this.#processChildren(el, node);
        break;
      }
      case "a": {
        const node = new Node("link");
        node.destination = el.getAttribute("href") || "";
        node.title = el.getAttribute("title") || "";
        parent.appendChild(node);
        this.#processChildren(el, node);
        break;
      }
      case "img": {
        const node = new Node("image");
        node.destination = el.getAttribute("src") || "";
        node.title = el.getAttribute("title") || "";
        const alt = el.getAttribute("alt") || "";
        if (alt) {
          const textNode = new Node("text");
          textNode.literal = alt;
          node.appendChild(textNode);
        }
        parent.appendChild(node);
        break;
      }
      case "br": {
        const node = new Node("linebreak");
        parent.appendChild(node);
        break;
      }
      case "hr": {
        const node = new Node("thematic_break");
        parent.appendChild(node);
        break;
      }
      case "ul":
      case "ol": {
        const node = new Node("list");
        node.listData = {
          type: tag === "ul" ? "bullet" : "ordered",
          tight: this.#isTightList(el),
          bulletChar: "-",
          start: parseInt(el.getAttribute("start") || "1") || 1,
          delimiter: ".",
          padding: 0,
          markerOffset: 0,
        };
        parent.appendChild(node);
        this.#processChildren(el, node);
        break;
      }
      case "li": {
        const node = new Node("item");
        parent.appendChild(node);
        if (!this.#hasBlockChildren(el)) {
          const para = new Node("paragraph");
          node.appendChild(para);
          this.#processChildren(el, para);
        } else {
          this.#processChildren(el, node);
        }
        break;
      }
      case "table": {
        const node = new Node("table");
        node.tableAlignments = this.#extractTableAlignments(el);
        parent.appendChild(node);
        this.#processTableChildren(el, node);
        break;
      }
      default: {
        // 检查插件自定义 HTML→AST 转换规则
        const rule = this.#pluginParsers.get(tag);
        if (rule) {
          rule.parse(el, parent, (e, p) => this.#processChildren(e, p));
          break;
        }
        if (BLOCK_ELEMENTS.has(tag)) {
          const node = new Node("html_block");
          node.literal = el.outerHTML + "\n";
          parent.appendChild(node);
        } else {
          const node = new Node("html_inline");
          node.literal = el.outerHTML;
          parent.appendChild(node);
        }
        break;
      }
    }
  }

  #hasBlockChildren(el: Element): boolean {
    const blockTags = new Set([
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "pre",
      "ul",
      "ol",
      "hr",
      "div",
      "table",
    ]);
    for (const child of el.children) {
      if (blockTags.has(child.tagName.toLowerCase())) return true;
    }
    return false;
  }

  #isTightList(el: Element): boolean {
    for (const li of el.children) {
      if (li.tagName.toLowerCase() === "li") {
        for (const child of li.children) {
          if (child.tagName.toLowerCase() === "p") return false;
        }
      }
    }
    return true;
  }

  #extractTableAlignments(tableEl: Element): TableAlign[] {
    const alignments: TableAlign[] = [];
    // 从第一行（thead > tr 或直接 tr）提取列数和对齐方式
    const firstRow = tableEl.querySelector("tr");
    if (!firstRow) return alignments;
    for (const cell of firstRow.children) {
      const tag = cell.tagName.toLowerCase();
      if (tag === "th" || tag === "td") {
        const style = cell.getAttribute("style") || "";
        const alignMatch = style.match(/text-align:\s*(left|center|right)/);
        alignments.push(alignMatch ? alignMatch[1] as TableAlign : null);
      }
    }
    return alignments;
  }

  #processTableChildren(tableEl: Element, tableNode: Node): void {
    for (const child of tableEl.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
        // 展开 thead/tbody/tfoot，将其中的 tr 直接挂在 table 下
        this.#processTableRows(child, tableNode);
      } else if (tag === "tr") {
        this.#processTableRow(child, tableNode);
      }
    }
  }

  #processTableRows(sectionEl: Element, parent: Node): void {
    for (const child of sectionEl.children) {
      if (child.tagName.toLowerCase() === "tr") {
        this.#processTableRow(child, parent);
      }
    }
  }

  #processTableRow(trEl: Element, parent: Node): void {
    const row = new Node("table_row");
    parent.appendChild(row);
    for (const child of trEl.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === "th" || tag === "td") {
        const cell = new Node("table_cell");
        row.appendChild(cell);
        this.#processChildren(child, cell);
      }
    }
  }
}
