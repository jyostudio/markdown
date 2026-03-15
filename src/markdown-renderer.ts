/**
 * Markdown 渲染器：将 CommonMark AST 转换回 Markdown 文本。
 *
 * 使用递归方式，以便容器节点（引用块、列表）
 * 能够对子节点的输出进行变换。
 */

import overload from "@jyostudio/overload";
import { Node, type TableAlign } from "./node";
import { Renderer } from "./html-renderer";
import type { MarkdownPlugin, MarkdownRenderRule } from "./plugin";
import { collectPluginMap } from "./plugin";


/**
 * 将 CommonMark AST 渲染为 Markdown 字符串。
 */
export class MarkdownRenderer extends Renderer<string> {
  /**
   * 插件提供的自定义节点 Markdown 渲染规则
   */
  #pluginRenderers: Map<string, MarkdownRenderRule>;

  constructor(plugins?: MarkdownPlugin[]) {
    super();
    this.#pluginRenderers = collectPluginMap(
      plugins || [],
      p => p.markdownRenderers,
    );
  }
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
      case "table":
        return this.#renderTable(node);
      case "table_row":
      case "table_cell":
        return this.#renderChildren(node);
      default: {
        // 检查插件自定义渲染规则
        const rule = this.#pluginRenderers.get(node.type);
        if (rule) {
          return rule.render(node, (n: Node) => this.#renderChildren(n));
        }
        return this.#renderChildren(node);
      }
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

  #renderTable(node: Node): string {
    const alignments = node.tableAlignments || [];
    const rows: string[][] = [];

    // 收集所有行的单元格内容（table_row 直接是 table 的子节点）
    let row = node.firstChild;
    while (row) {
      if (row.type === "table_row") {
        const cells: string[] = [];
        let cell = row.firstChild;
        while (cell) {
          if (cell.type === "table_cell") {
            cells.push(this.#renderChildren(cell).replace(/\|/g, "\\|"));
          }
          cell = cell.next;
        }
        rows.push(cells);
      }
      row = row.next;
    }

    if (rows.length === 0) return "";

    // 计算每列最小宽度
    const colCount = alignments.length || (rows[0]?.length ?? 0);
    const widths: number[] = new Array(colCount).fill(3);
    for (const row of rows) {
      for (let i = 0; i < colCount; i++) {
        widths[i] = Math.max(widths[i], (row[i] || "").length);
      }
    }

    // 构建分隔行
    const delimCells = alignments.map((align, i) => {
      const w = Math.max(widths[i], 3);
      const dashes = "-".repeat(w);
      if (align === "center") return ":" + dashes.slice(2) + ":";
      if (align === "right") return dashes.slice(1) + ":";
      if (align === "left") return ":" + dashes.slice(1);
      return dashes;
    });

    const formatRow = (cells: string[]) => {
      const padded = cells.map((c, i) => {
        const w = widths[i] || 3;
        return (" " + (c || "").padEnd(w) + " ");
      });
      return "|" + padded.join("|") + "|";
    };

    let result = "";
    // 第一行
    if (rows.length > 0) {
      result += formatRow(rows[0]) + "\n";
    }
    // 分隔行
    result += "|" + delimCells.map((d, i) => " " + d.padEnd(widths[i]) + " ").join("|") + "|\n";
    // 其余行
    for (let i = 1; i < rows.length; i++) {
      result += formatRow(rows[i]) + "\n";
    }
    result += "\n";
    return result;
  }
}
