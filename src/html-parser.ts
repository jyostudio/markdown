/**
 * HTML 解析器：将 HTML 字符串转换为 CommonMark AST。
 *
 * 使用平台的 DOMParser API（浏览器和现代 Node.js 均可用）。
 */

import overload from "@jyostudio/overload";
import { Node } from "./node";


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
      default: {
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
}
