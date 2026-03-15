/**
 * CommonMark AST 的 HTML 渲染器。
 *
 * 遍历 AST 并生成 HTML 字符串。
 */

import overload from "@jyostudio/overload";
import { Node, type NodeWalkerEvent, type NodeType } from "./node";
import { escapeXml, normalizeURI } from "./common";
import type { MarkdownPlugin, HtmlRenderRule } from "./plugin";
import { collectPluginMap } from "./plugin";


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
export abstract class Renderer<T> {
  /**
   * 将 AST 渲染为目标格式，由子类实现。
   */
  public abstract render(ast: Node): T;
}

/**
 * 将 CommonMark AST 渲染为 HTML 字符串。
 */
export class HtmlRenderer extends Renderer<string> {
  #softbreak: string;
  #safe: boolean;
  #buf = "";
  #lastOut = "\n";
  #disableTags = 0;

  /**
   * null 表示允许所有特性
   */
  #allowedFeatures: Set<NodeType> | null = null;

  /**
   * 当前嵌套在多少层「禁用」的 block_quote 内
   */
  #rawBlockquoteDepth = 0;

  /**
   * 插件提供的自定义节点 HTML 渲染规则
   */
  #pluginRenderers: Map<string, HtmlRenderRule>;

  constructor(options?: RendererOptions) {
    super();
    this.#softbreak = options?.softbreak ?? "\n";
    this.#safe = options?.safe ?? false;
    if (options?.allowedFeatures !== undefined) {
      this.#allowedFeatures =
        options.allowedFeatures instanceof Set
          ? options.allowedFeatures
          : new Set(options.allowedFeatures);
    }
    this.#pluginRenderers = collectPluginMap(
      options?.plugins || [],
      p => p.htmlRenderers,
    );
  }

  /** 检查某个特性是否在白名单中（未设置白名单时永远返回 true）*/
  #isAllowed(type: NodeType): boolean {
    return this.#allowedFeatures === null || this.#allowedFeatures.has(type);
  }

  /**
   * 遍历 AST 并渲染为 HTML 字符串。
   */
  public render(ast: Node): string;
  public render(...params: unknown[]): any {
    HtmlRenderer.prototype.render = overload([Node], function (this: HtmlRenderer, ast) {
      this.#buf = "";
      this.#lastOut = "\n";
      this.#disableTags = 0;
      this.#rawBlockquoteDepth = 0;

      const walker = ast.walker();
      let event: NodeWalkerEvent | null;

      while ((event = walker.next())) {
        const { entering, node } = event;
        this.#renderNode(node, entering);
      }

      return this.#buf;
    });
    return (HtmlRenderer.prototype.render as Function).apply(this, params);
  }

  // #region 输出辅助方法

  #out(s: string): void {
    this.#buf += s;
    if (s.length > 0) {
      this.#lastOut = s[s.length - 1];
    }
  }

  #lit(s: string): void {
    this.#out(s);
  }

  #cr(): void {
    if (this.#lastOut !== "\n") {
      this.#lit("\n");
    }
  }

  #tag(
    name: string,
    attrs?: [string, string][],
    selfClosing = false,
  ): void {
    if (this.#disableTags > 0) return;

    let s = "<" + name;
    if (attrs) {
      for (const [key, value] of attrs) {
        s += " " + key + '="' + value + '"';
      }
    }
    if (selfClosing) {
      s += " /";
    }
    s += ">";
    this.#lit(s);
  }

  // #endregion

  // #region 节点渲染

  #renderNode(node: Node, entering: boolean): void {
    switch (node.type) {
      case "document":
        break;

      case "text":
        this.#out(escapeXml(node.literal || ""));
        break;

      case "softbreak":
        this.#out(this.#softbreak);
        break;

      case "linebreak":
        this.#tag("br", undefined, true);
        this.#cr();
        break;

      case "emph":
        if (!this.#isAllowed("emph")) {
          this.#out("*");
          break;
        }
        this.#tag(entering ? "em" : "/em");
        break;

      case "strong":
        if (!this.#isAllowed("strong")) {
          this.#out("**");
          break;
        }
        this.#tag(entering ? "strong" : "/strong");
        break;

      case "html_inline":
        if (!this.#isAllowed("html_inline") || this.#safe) {
          // 不允许时或安全模式下，输出转义后的原始文本
          if (this.#safe && this.#isAllowed("html_inline")) {
            this.#lit("<!-- raw HTML omitted -->");
          } else if (!this.#isAllowed("html_inline")) {
            this.#out(escapeXml(node.literal || ""));
          } else {
            this.#lit("<!-- raw HTML omitted -->");
          }
          break;
        }
        this.#lit(node.literal || "");
        break;

      case "html_block":
        this.#cr();
        if (!this.#isAllowed("html_block")) {
          // 以 <p> 包裹，显示转义后的原始 HTML 文本
          this.#lit("<p>");
          this.#out(escapeXml((node.literal || "").replace(/\n$/, "")));
          this.#lit("</p>");
          this.#cr();
          break;
        }
        if (this.#safe) {
          this.#lit("<!-- raw HTML omitted -->");
        } else {
          this.#lit(node.literal || "");
        }
        this.#cr();
        break;

      case "link":
        if (!this.#isAllowed("link")) {
          if (entering) {
            this.#out("[");
          } else {
            const dest = escapeXml(node.destination || "");
            const titlePart = node.title
              ? ' "' + escapeXml(node.title) + '"'
              : "";
            this.#out("](" + dest + titlePart + ")");
          }
          break;
        }
        if (entering) {
          const attrs: [string, string][] = [
            ["href", escapeXml(normalizeURI(node.destination || ""))],
          ];
          if (node.title) {
            attrs.push(["title", escapeXml(node.title)]);
          }
          this.#tag("a", attrs);
        } else {
          this.#tag("/a");
        }
        break;

      case "image":
        if (!this.#isAllowed("image")) {
          // 以 ![alt](url) 形式输出；用 disableTags 抑制子节点的 HTML 标签，
          // 仍收集子节点的文本内容作为 alt 文本
          if (entering) {
            this.#out("![");
            this.#disableTags++;
          } else {
            this.#disableTags--;
            const dest = escapeXml(node.destination || "");
            const titlePart = node.title
              ? ' "' + escapeXml(node.title) + '"'
              : "";
            this.#out("](" + dest + titlePart + ")");
          }
          break;
        }
        if (entering) {
          if (this.#disableTags === 0) {
            this.#lit(
              "<img" +
              ' src="' +
              escapeXml(normalizeURI(node.destination || "")) +
              '"' +
              ' alt="',
            );
          }
          this.#disableTags++;
        } else {
          this.#disableTags--;
          if (this.#disableTags === 0) {
            if (node.title) {
              this.#lit('" title="' + escapeXml(node.title));
            }
            this.#lit('" />');
          }
        }
        break;

      case "code":
        if (!this.#isAllowed("code")) {
          this.#out("`" + escapeXml(node.literal || "") + "`");
          break;
        }
        this.#tag("code");
        this.#out(escapeXml(node.literal || ""));
        this.#tag("/code");
        break;

      case "paragraph":
        // 处于禁用列表的 item 内：item 负责 <p> 包裹，此处跳过
        if (!this.#isAllowed("list") && node.parent?.type === "item") {
          break;
        }
        // 处于禁用 block_quote 内：加 "> " 前缀
        if (this.#rawBlockquoteDepth > 0) {
          if (entering) {
            this.#cr();
            this.#lit("<p>");
            this.#lit("&gt; ".repeat(this.#rawBlockquoteDepth));
          } else {
            this.#lit("</p>");
            this.#cr();
          }
          break;
        }
        this.#renderParagraph(node, entering);
        break;

      case "heading":
        if (!this.#isAllowed("heading")) {
          if (entering) {
            this.#cr();
            this.#lit("<p>");
            this.#out("#".repeat(node.level ?? 1) + " ");
          } else {
            this.#lit("</p>");
            this.#cr();
          }
          break;
        }
        this.#renderHeading(node, entering);
        break;

      case "code_block":
        if (!this.#isAllowed("code_block")) {
          this.#cr();
          const cbInfo = node.info ? node.info.split(/\s+/)[0] : "";
          // 以 <pre> 保留换行，显示原始围栏代码块语法
          this.#lit("<pre>");
          this.#out(
            "```" +
            (cbInfo ? escapeXml(cbInfo) : "") +
            "\n" +
            escapeXml(node.literal || "") +
            "```",
          );
          this.#lit("</pre>");
          this.#cr();
          break;
        }
        this.#renderCodeBlock(node);
        break;

      case "thematic_break":
        if (!this.#isAllowed("thematic_break")) {
          this.#cr();
          this.#lit("<p>---</p>");
          this.#cr();
          break;
        }
        this.#cr();
        this.#tag("hr", undefined, true);
        this.#cr();
        break;

      case "block_quote":
        if (!this.#isAllowed("block_quote")) {
          if (entering) this.#rawBlockquoteDepth++;
          else this.#rawBlockquoteDepth--;
          break;
        }
        this.#cr();
        this.#tag(entering ? "blockquote" : "/blockquote");
        this.#cr();
        break;

      case "list":
        if (!this.#isAllowed("list")) {
          // 不输出 <ul>/<ol> 标签，由 item 逐条渲染
          break;
        }
        this.#renderList(node, entering);
        break;

      case "item": {
        if (!this.#isAllowed("list")) {
          // 每个 item 渲染为带项目符号前缀的 <p>
          const listNode = node.parent!;
          if (entering) {
            this.#cr();
            this.#lit("<p>");
            if (listNode.listData?.type === "ordered") {
              let pos = 0;
              let cur: Node | null = node;
              while (cur.prev !== null) {
                pos++;
                cur = cur.prev;
              }
              const start = listNode.listData?.start ?? 1;
              this.#out(escapeXml(start + pos + ". "));
            } else {
              this.#lit("- ");
            }
          } else {
            this.#lit("</p>");
            this.#cr();
          }
          break;
        }
        this.#renderItem(node, entering);
        break;
      }

      case "table":
        this.#cr();
        this.#tag(entering ? "table" : "/table");
        this.#cr();
        break;

      case "table_row":
        this.#cr();
        this.#tag(entering ? "tr" : "/tr");
        this.#cr();
        break;

      case "table_cell": {
        if (entering) {
          const alignments = this.#getTableAlignments(node);
          const cellIndex = this.#getCellIndex(node);
          const align = alignments?.[cellIndex] || null;
          const attrs: [string, string][] | undefined = align
            ? [["style", "text-align: " + align]]
            : undefined;
          this.#tag("td", attrs);
        } else {
          this.#tag("/td");
          this.#cr();
        }
        break;
      }

      default: {
        // 检查插件自定义渲染规则
        const rule = this.#pluginRenderers.get(node.type);
        if (rule) {
          this.#lit(rule.render(node, entering));
        }
        break;
      }
    }
  }

  #renderParagraph(node: Node, entering: boolean): void {
    const grandparent = node.parent?.parent;
    if (
      grandparent &&
      grandparent.type === "list" &&
      grandparent.listData?.tight
    ) {
      return;
    }
    if (entering) {
      this.#cr();
      this.#tag("p");
    } else {
      this.#tag("/p");
      this.#cr();
    }
  }

  #renderHeading(node: Node, entering: boolean): void {
    const tag = "h" + node.level;
    if (entering) {
      this.#cr();
      this.#tag(tag);
    } else {
      this.#tag("/" + tag);
      this.#cr();
    }
  }

  #renderCodeBlock(node: Node): void {
    this.#cr();
    const info = node.info ? node.info.split(/\s+/)[0] : "";
    if (info) {
      this.#tag("pre");
      this.#tag("code", [["class", "language-" + escapeXml(info)]]);
    } else {
      this.#tag("pre");
      this.#tag("code");
    }
    this.#out(escapeXml(node.literal || ""));
    this.#tag("/code");
    this.#tag("/pre");
    this.#cr();
  }

  #renderList(node: Node, entering: boolean): void {
    const tag = node.listData?.type === "bullet" ? "ul" : "ol";
    if (entering) {
      this.#cr();
      const attrs: [string, string][] | undefined =
        node.listData?.type === "ordered" && node.listData.start !== 1
          ? [["start", String(node.listData.start)]]
          : undefined;
      this.#tag(tag, attrs);
      this.#cr();
    } else {
      this.#cr();
      this.#tag("/" + tag);
      this.#cr();
    }
  }

  #renderItem(_node: Node, entering: boolean): void {
    if (entering) {
      this.#tag("li");
    } else {
      this.#tag("/li");
      this.#cr();
    }
  }

  #getTableAlignments(cell: Node): import("./node").TableAlign[] | null {
    // cell → row → table
    const table = cell.parent?.parent;
    return table?.tableAlignments || null;
  }

  #getCellIndex(cell: Node): number {
    let index = 0;
    let cur = cell.prev;
    while (cur) {
      index++;
      cur = cur.prev;
    }
    return index;
  }

  // #endregion
}
