/**
 * Markdown 渲染器：将 CommonMark AST 转换回 Markdown 文本。
 *
 * 使用递归方式，以便容器节点（引用块、列表）
 * 能够对子节点的输出进行变换。
 */

import overload from "@jyostudio/overload";
import { Node } from "./node";
import { Renderer } from "./html-renderer";


/**
 * 将 CommonMark AST 渲染为 Markdown 字符串。
 */
export class MarkdownRenderer extends Renderer<string> {
  /**
   * 遍历 AST 并渲染为 Markdown 字符串。
   */
  public render(ast: Node): string;
  public render(...params: unknown[]): any {
    MarkdownRenderer.prototype.render = overload([Node], function (this: MarkdownRenderer, ast) {
      return this.#renderNode(ast);
    });
    return (MarkdownRenderer.prototype.render as Function).apply(this, params);
  }

  #renderChildren(node: Node): string {
    let result = "";
    let child = node.firstChild;
    while (child) {
      result += this.#renderNode(child);
      child = child.next;
    }
    return result;
  }

  #renderNode(node: Node): string {
    switch (node.type) {
      case "document":
        return this.#renderChildren(node);
      case "text":
        return node.literal || "";
      case "softbreak":
        return "\n";
      case "linebreak":
        return "  \n";
      case "emph":
        return "*" + this.#renderChildren(node) + "*";
      case "strong":
        return "**" + this.#renderChildren(node) + "**";
      case "code":
        return this.#renderInlineCode(node);
      case "link":
        return this.#renderLink(node);
      case "image":
        return this.#renderImage(node);
      case "html_inline":
        return node.literal || "";
      case "html_block":
        return (node.literal || "") + "\n";
      case "paragraph":
        return this.#renderParagraph(node);
      case "heading":
        return this.#renderHeading(node);
      case "code_block":
        return this.#renderCodeBlock(node);
      case "thematic_break":
        return "---\n\n";
      case "block_quote":
        return this.#renderBlockQuote(node);
      case "list":
        return this.#renderList(node);
      case "item":
        return this.#renderChildren(node);
      default:
        return this.#renderChildren(node);
    }
  }

  #renderInlineCode(node: Node): string {
    const literal = node.literal || "";
    if (literal.includes("`")) {
      return "`` " + literal + " ``";
    }
    return "`" + literal + "`";
  }

  #renderLink(node: Node): string {
    const text = this.#renderChildren(node);
    const dest = node.destination || "";
    if (node.title) {
      return `[${text}](${dest} "${node.title}")`;
    }
    return `[${text}](${dest})`;
  }

  #renderImage(node: Node): string {
    const alt = this.#renderChildren(node);
    const dest = node.destination || "";
    if (node.title) {
      return `![${alt}](${dest} "${node.title}")`;
    }
    return `![${alt}](${dest})`;
  }

  #renderParagraph(node: Node): string {
    const grandparent = node.parent?.parent;
    const inTightList =
      grandparent?.type === "list" && grandparent.listData?.tight;
    const content = this.#renderChildren(node);
    return inTightList ? content + "\n" : content + "\n\n";
  }

  #renderHeading(node: Node): string {
    const prefix = "#".repeat(node.level) + " ";
    return prefix + this.#renderChildren(node) + "\n\n";
  }

  #renderCodeBlock(node: Node): string {
    const info = node.info || "";
    const literal = node.literal || "";
    let fence = "```";
    while (literal.includes(fence)) {
      fence += "`";
    }
    return fence + info + "\n" + literal + fence + "\n\n";
  }

  #renderBlockQuote(node: Node): string {
    const inner = this.#renderChildren(node);
    const lines = inner.split("\n");
    const result = lines
      .map((line, i) => {
        if (i === lines.length - 1 && line === "") return "";
        return line ? "> " + line : ">";
      })
      .join("\n");
    return result + "\n";
  }

  #renderList(node: Node): string {
    let result = "";
    let itemIndex = node.listData?.start || 1;
    let child = node.firstChild;

    while (child) {
      if (child.type === "item") {
        const prefix =
          node.listData?.type === "bullet" ? "- " : `${itemIndex}. `;
        const content = this.#renderChildren(child);
        const indent = " ".repeat(prefix.length);
        const lines = content.split("\n");
        const indented = lines
          .map((line, i) => {
            if (i === 0) return prefix + line;
            if (line === "") return "";
            return indent + line;
          })
          .join("\n");
        result += indented;
        itemIndex++;
      }
      child = child.next;
    }

    if (!result.endsWith("\n\n")) {
      result += "\n";
    }
    return result;
  }
}
