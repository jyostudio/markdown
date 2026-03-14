/**
 * CommonMark 0.31.2 的块级解析器。
 *
 * 实现两阶段解析算法：
 *   第一阶段：构建块结构（本文件）
 *   第二阶段：解析行内内容（inline-parser.ts）
 */

import overload from "@jyostudio/overload";
import { Node, type ListData, type NodeType } from "./node";
import {
  isSpaceOrTab,
  peek,
  reATXHeading,
  reSetextHeadingLine,
  reThematicBreak,
  reCodeFence,
  reBulletListMarker,
  reOrderedListMarker,
  reHtmlBlockOpen1,
  reHtmlBlockOpen2,
  reHtmlBlockOpen3,
  reHtmlBlockOpen4,
  reHtmlBlockOpen5,
  reHtmlBlockOpen6,
  reHtmlBlockOpen7,
  unescapeString,
  normalizeReference,
  type RefMap,
} from "./common";
import { InlineParser } from "./inline-parser";

// #region 附加正则表达式

/**
 * 围栏式代码块关闭行正则
 */
const reClosingCodeFence = /^(`{3,}|~{3,})\s*$/;


/**
 * 各类 HTML 块关闭条件正则数组（索引对应类型 1–5，0 为占位）
 */
const reHtmlBlockClose: (RegExp | null)[] = [
  null,
  /<\/(?:pre|script|style|textarea)>/i,
  /-->/,
  /\?>/,
  />/,
  /\]\]>/,
];


/**
 * 当前行可能开始块级特殊结构的快速预判断正则
 */
const reMaybeSpecial = /^[#`~*+\-_=<>0-9!]/;

// #endregion

// #region 块解析器

export class BlockParser {
  /**
   * 文档根节点
   */
  doc!: Node;


  /**
   * 当前最内层打开块节点（解析末端）
   */
  tip!: Node;


  /**
   * 处理当前行前的末端节点
   */
  oldtip!: Node;


  /**
   * 最后一个与当前行匹配的容器节点
   */
  lastMatchedContainer!: Node;


  /**
   * 当前正在处理的行
   */
  currentLine = "";


  /**
   * 当前行号（从 1 开始）
   */
  lineNumber = 0;


  /**
   * 当前行的字符偏移量
   */
  offset = 0;


  /**
   * 当前列号（制表符已展开）
   */
  column = 0;


  /**
   * 下一个非空白字符的偏移量
   */
  nextNonspace = 0;


  /**
   * 下一个非空白字符的列号
   */
  nextNonspaceColumn = 0;


  /**
   * 当前块的缩进级别
   */
  indent = 0;


  /**
   * 当前行是否满足缩进代码块条件（≥4 空格）
   */
  indented = false;


  /**
   * 当前行是否为空行
   */
  blank = false;


  /**
   * 上一次 advanceOffset 是否部分消耗了制表符
   */
  partiallyConsumedTab = false;


  /**
   * 所有未匹配的打开块是否已终结
   */
  allClosed = true;


  /**
   * 上一行的字符长度
   */
  lastLineLength = 0;


  /**
   * 链接引用定义映射表
   */
  refmap: RefMap = {};


  /**
   * 行内解析器实例
   */
  inlineParser: InlineParser;

  constructor() {
    this.inlineParser = new InlineParser();
  }

  // #region 公共 API

  /**
   * 解析 Markdown 字符串，构建并返回 AST 文档根节点。
   */
  public parse(input: string): Node;
  public parse(...params: unknown[]): any {
    BlockParser.prototype.parse = overload([String], function (this: BlockParser, input) {
      this.doc = new Node("document", [
        [1, 1],
        [0, 0],
      ]);
      this.tip = this.doc;
      this.refmap = {};
      this.lineNumber = 0;
      this.lastLineLength = 0;
      this.offset = 0;
      this.column = 0;
      this.lastMatchedContainer = this.doc;
      this.currentLine = "";

      const lines = input
        .replace(/\r\n|\r/g, "\n")
        .replace(/\0/g, "\uFFFD")
        .split("\n");
      let len = lines.length;
      if (len > 0 && lines[len - 1] === "") {
        len--;
      }

      for (let i = 0; i < len; i++) {
        this.processLine(lines[i]);
      }

      while (this.tip !== this.doc) {
        this.finalize(this.tip, len);
      }
      this.finalize(this.doc, len);
      this.processInlines(this.doc);
      return this.doc;
    });

    return (BlockParser.prototype.parse as Function).apply(this, params);
  }

  // #endregion

  // #region 行处理（核心算法）

  /**
   * 处理单行输入，更新块级树结构。
   */
  public processLine(line: string): void;
  public processLine(...params: unknown[]): any {
    BlockParser.prototype.processLine = overload(
      [String],
      function (this: BlockParser, line: string) {
        let container = this.doc;
        this.oldtip = this.tip;
        this.offset = 0;
        this.column = 0;
        this.blank = false;
        this.partiallyConsumedTab = false;
        this.lineNumber++;
        this.currentLine = line;

        // #region 第一阶段：遍历打开的块，检查延续
        let lastChild = container.lastChild;

        while (lastChild && lastChild.open) {
          container = lastChild;
          this.findNextNonspace();

          const result = this.blockContinue(container);
          if (result === 0) {
            // 匹配
          } else if (result === 1) {
            container = container.parent!
            break;
          } else {
            // result === 2：行已被消耗（例如关闭围栏）
            this.lastLineLength = line.length;
            return;
          }

          lastChild = container.lastChild;
        }

        this.allClosed = container === this.oldtip;
        this.lastMatchedContainer = container;

        // matchedLeaf：如果容器接受行且不是段落则为 true
        const matchedLeaf =
          container.type !== "paragraph" && this.acceptsLines(container.type);

        // #endregion

        // #region 第二阶段：尝试新的块开始
        if (!matchedLeaf) {
          let keepTrying = true;
          while (keepTrying) {
            this.findNextNonspace();

            if (
              !this.indented &&
              !reMaybeSpecial.test(this.currentLine.charAt(this.nextNonspace))
            ) {
              this.advanceOffset(this.nextNonspace - this.offset, false);
              break;
            }

            const res = this.tryBlockStart(container);
            if (res === 1) {
              container = this.tip;
            } else if (res === 2) {
              container = this.tip;
              keepTrying = false;
            } else {
              this.advanceOffset(this.nextNonspace - this.offset, false);
              keepTrying = false;
            }
          }
        }

        // #endregion

        // #region 第三阶段：添加行内容
        if (!this.allClosed && !this.blank && this.tip.type === "paragraph") {
          // 惰性段落延续
          this.addLine();
        } else {
          this.closeUnmatchedBlocks();

          if (this.blank && container.lastChild) {
            container.lastChild.lastLineBlank = true;
          }

          const t = container.type;
          const lastLineBlank =
            this.blank &&
            !(
              t === "block_quote" ||
              (t === "code_block" && container.isFenced) ||
              (t === "item" &&
                !container.firstChild &&
                container.sourcepos?.[0]?.[0] === this.lineNumber)
            );

          let cur: Node | null = container;
          while (cur) {
            cur.lastLineBlank = lastLineBlank;
            cur = cur.parent;
          }

          if (this.acceptsLines(t)) {
            this.addLine();
            if (
              t === "html_block" &&
              container.htmlBlockType >= 1 &&
              container.htmlBlockType <= 5
            ) {
              const closePat = reHtmlBlockClose[container.htmlBlockType];
              if (closePat && closePat.test(this.currentLine.slice(this.offset))) {
                this.finalize(container, this.lineNumber);
              }
            }
          } else if (this.offset < this.currentLine.length && !this.blank) {
            container = this.addChild("paragraph", this.offset);
            this.advanceOffset(this.nextNonspace - this.offset, false);
            this.addLine();
          }
        }

        this.lastLineLength = line.length;
        // #endregion
      },
    );
    return (BlockParser.prototype.processLine as Function).apply(this, params);
  }

  // #endregion

  // #region 块延续

  /**
   * 检查容器块是否可延续当前行。
   * 返回 0 表示继续，1 表示中断，2 表示行已被消耗。
   */
  public blockContinue(container: Node): number;
  public blockContinue(...params: unknown[]): any {
    BlockParser.prototype.blockContinue = overload(
      [Node],
      function (this: BlockParser, container: Node): number {
        switch (container.type) {
          case "block_quote": {
            if (
              !this.indented &&
              peek(this.currentLine, this.nextNonspace) === 0x3e
            ) {
              this.advanceOffset(this.nextNonspace + 1 - this.offset, false);
              if (isSpaceOrTab(peek(this.currentLine, this.offset))) {
                this.advanceOffset(1, true);
              }
              return 0;
            }
            return 1;
          }

          case "item": {
            if (this.blank) {
              if (container.firstChild === null) {
                return 1;
              }
              this.advanceOffset(this.nextNonspace - this.offset, false);
              return 0;
            }
            const listData = container.listData!;
            if (this.indent >= listData.markerOffset + listData.padding) {
              this.advanceOffset(
                listData.markerOffset + listData.padding - this.offset,
                true,
              );
              return 0;
            }
            return 1;
          }

          case "heading":
            return 1;

          case "code_block": {
            if (container.isFenced) {
              if (
                this.indent <= 3 &&
                this.currentLine.charAt(this.nextNonspace) === container.fenceChar
              ) {
                const fenceMatch = this.currentLine
                  .slice(this.nextNonspace)
                  .match(reClosingCodeFence);
                if (fenceMatch && fenceMatch[1].length >= container.fenceLength) {
                  this.lastLineLength = this.currentLine.length;
                  this.finalize(container, this.lineNumber);
                  return 2;
                }
              }
              let i = container.fenceOffset;
              while (i > 0 && isSpaceOrTab(peek(this.currentLine, this.offset))) {
                this.advanceOffset(1, true);
                i--;
              }
              return 0;
            } else {
              if (this.indent >= 4) {
                this.advanceOffset(4, true);
                return 0;
              } else if (this.blank) {
                this.advanceOffset(this.nextNonspace - this.offset, false);
                return 0;
              }
              return 1;
            }
          }

          case "html_block": {
            if (
              this.blank &&
              (container.htmlBlockType === 6 || container.htmlBlockType === 7)
            ) {
              return 1;
            }
            return 0;
          }

          case "paragraph":
            return this.blank ? 1 : 0;

          default:
            return 0;
        }
      },
    );
    return (BlockParser.prototype.blockContinue as Function).apply(this, params);
  }

  // #endregion

  // #region 块开始

  /**
   * 在当前位置尝试开始新的块结构。
   * 返回 0 表示无匹配，1 表示容器块已创建，2 表示叶子块已创建。
   */
  public tryBlockStart(container: Node): number;
  public tryBlockStart(...params: unknown[]): any {
    BlockParser.prototype.tryBlockStart = overload(
      [Node],
      function (this: BlockParser, container: Node): number {
        // 1. 块引用
        if (!this.indented && peek(this.currentLine, this.nextNonspace) === 0x3e) {
          this.advanceOffset(this.nextNonspace + 1 - this.offset, false);
          if (isSpaceOrTab(peek(this.currentLine, this.offset))) {
            this.advanceOffset(1, true);
          }
          this.closeUnmatchedBlocks();
          this.addChild("block_quote", this.nextNonspace);
          return 1;
        }

        // 2. ATX 标题
        if (!this.indented) {
          const atxMatch = this.currentLine
            .slice(this.nextNonspace)
            .match(reATXHeading);
          if (atxMatch) {
            this.advanceOffset(
              this.nextNonspace + atxMatch[0].length - this.offset,
              false,
            );
            this.closeUnmatchedBlocks();
            const heading = this.addChild("heading", this.nextNonspace);
            heading.level = atxMatch[0].trim().length;
            let content = this.currentLine.slice(this.offset);
            content = content.replace(/^[ \t]*#+[ \t]*$/, "");
            content = content.replace(/[ \t]+#+[ \t]*$/, "");
            heading.stringContent = content.trim();
            this.advanceOffset(this.currentLine.length - this.offset, false);
            return 2;
          }
        }

        // 3. 围栏代码块
        if (!this.indented) {
          const fenceMatch = this.currentLine
            .slice(this.nextNonspace)
            .match(reCodeFence);
          if (fenceMatch) {
            const fenceLength = fenceMatch[0].length;
            const afterFence = this.currentLine.slice(
              this.nextNonspace + fenceLength,
            );
            if (fenceMatch[0].charAt(0) === "`" && afterFence.includes("`")) {
              // 无效：信息字符串中包含反引号
            } else {
              this.closeUnmatchedBlocks();
              const codeBlock = this.addChild("code_block", this.nextNonspace);
              codeBlock.isFenced = true;
              codeBlock.fenceLength = fenceLength;
              codeBlock.fenceChar = fenceMatch[0].charAt(0);
              codeBlock.fenceOffset = this.indent;
              codeBlock.info = unescapeString(afterFence.trim());
              this.advanceOffset(this.currentLine.length - this.offset, false);
              return 2;
            }
          }
        }

        // 4. HTML 块
        if (!this.indented) {
          const s = this.currentLine.slice(this.nextNonspace);
          let htmlType = 0;
          if (reHtmlBlockOpen1.test(s)) htmlType = 1;
          else if (reHtmlBlockOpen2.test(s)) htmlType = 2;
          else if (reHtmlBlockOpen3.test(s)) htmlType = 3;
          else if (reHtmlBlockOpen4.test(s)) htmlType = 4;
          else if (reHtmlBlockOpen5.test(s)) htmlType = 5;
          else if (reHtmlBlockOpen6.test(s)) htmlType = 6;
          else if (reHtmlBlockOpen7.test(s) && this.tip.type !== "paragraph")
            htmlType = 7;

          if (htmlType > 0 && (htmlType < 7 || this.tip.type !== "paragraph")) {
            this.closeUnmatchedBlocks();
            const htmlBlock = this.addChild("html_block", this.offset);
            htmlBlock.htmlBlockType = htmlType;
            return 2;
          }
        }

        // 5. Setext 标题（段落 → 标题，仅当所有容器匹配时）
        if (
          !this.indented &&
          this.tip.type === "paragraph" &&
          this.allClosed &&
          reSetextHeadingLine.test(this.currentLine.slice(this.nextNonspace))
        ) {
          // 先尝试从段落内容中解析链接引用定义
          let content = this.tip.stringContent;
          let hasRefDef = true;
      while (content.charCodeAt(0) === 0x5b && hasRefDef) {
        const result = this.parseLinkRefDef(content);
        if (result !== null) {
          content = result;
        } else {
          hasRefDef = false;
        }
      }
      // 如果所有内容都被引用定义消耗，则不是 setext 标题
      if (content.trim() === "") {
        this.tip.stringContent = content;
        this.advanceOffset(this.currentLine.length - this.offset, false);
        return 0;
      }
      this.closeUnmatchedBlocks();
      const heading = new Node(
        "heading",
        this.tip.sourcepos
          ? ([...this.tip.sourcepos] as [[number, number], [number, number]])
          : undefined,
      );
      heading.level =
        this.currentLine.charAt(this.nextNonspace) === "=" ? 1 : 2;
      heading.stringContent = content
        .replace(/\n$/, "")
        .replace(/[ \t]+$/gm, "");
      this.tip.insertBefore(heading);
      this.tip.unlink();
      this.tip = heading;
      this.advanceOffset(this.currentLine.length - this.offset, false);
      return 2;
    }

    // 6. 主题分隔线
    if (
      !this.indented &&
      reThematicBreak.test(this.currentLine.slice(this.nextNonspace))
    ) {
      this.closeUnmatchedBlocks();
      this.addChild("thematic_break", this.nextNonspace);
      this.advanceOffset(this.currentLine.length - this.offset, false);
          return 2;
        }

        // 7. 列表项
        if (!this.blank) {
          const listData = this.parseListMarker(container);
          if (listData) {
            this.closeUnmatchedBlocks();
            this.addListItem(listData);
            return 1;
          }
        }

        // 8. 缩进代码块
        if (this.indented && this.tip.type !== "paragraph" && !this.blank) {
          this.closeUnmatchedBlocks();
          this.addChild("code_block", this.offset);
          this.advanceOffset(4, true);
          return 2;
        }

        return 0;
      },
    );
    return (BlockParser.prototype.tryBlockStart as Function).apply(this, params);
  }

  /**
   * 判断节点类型是否接受行内容（段落、代码块、HTML 块）。
   */
  public acceptsLines(type: NodeType): boolean;
  public acceptsLines(...params: unknown[]): any {
    BlockParser.prototype.acceptsLines = overload(
      [String],
      function (this: BlockParser, type: string): boolean {
        return (
          type === "paragraph" || type === "code_block" || type === "html_block"
        );
      },
    );
    return (BlockParser.prototype.acceptsLines as Function).apply(this, params);
  }

  // #endregion

  // #region 列表项解析

  /**
   * 尝试在当前行解析列表标记，成功时返回列表数据，否则返回 null。
   */
  public parseListMarker(tipNode: Node): ListData | null;
  public parseListMarker(...params: unknown[]): any {
    BlockParser.prototype.parseListMarker = overload(
      [Node],
      function (this: BlockParser, tipNode: Node): ListData | null {
        const rest = this.currentLine.slice(this.nextNonspace);
        let match: RegExpMatchArray | null;
        let markerLength: number;
        const listData: ListData = {
          type: "bullet",
          tight: true,
          bulletChar: "",
          start: 0,
          delimiter: "",
          padding: 0,
          markerOffset: this.indent,
        };

        if (listData.markerOffset >= 4) return null;

        match = rest.match(reBulletListMarker);
        if (match) {
          listData.type = "bullet";
          listData.bulletChar = match[0].charAt(0);
          markerLength = 1;
        } else {
          match = rest.match(reOrderedListMarker);
          if (match) {
            listData.type = "ordered";
            listData.start = parseInt(match[1], 10);
            listData.delimiter = match[2];
            markerLength = match[0].length;
            if (tipNode.type === "paragraph" && listData.start !== 1) {
              return null;
            }
          } else {
            return null;
          }
        }

        const nextCharPos = this.nextNonspace + markerLength;
        if (nextCharPos < this.currentLine.length) {
          if (!isSpaceOrTab(peek(this.currentLine, nextCharPos))) {
            return null;
          }
        }

        if (tipNode.type === "paragraph") {
          if (this.currentLine.slice(nextCharPos).trim() === "") {
            return null;
          }
        }

        this.advanceOffset(this.nextNonspace + markerLength - this.offset, false);
        const spacesStartCol = this.column;
        const spacesStartOffset = this.offset;

        let spacesAfterMarker = 0;
        while (
          this.column - spacesStartCol < 5 &&
          isSpaceOrTab(peek(this.currentLine, this.offset))
        ) {
          this.advanceOffset(1, true);
          spacesAfterMarker++;
        }

        const blankItem =
          peek(this.currentLine, this.offset) === -1 ||
          peek(this.currentLine, this.offset) === 0x0a;

        if (spacesAfterMarker >= 5 || spacesAfterMarker < 1 || blankItem) {
          listData.padding = markerLength + 1;
          this.column = spacesStartCol;
          this.offset = spacesStartOffset;
          if (isSpaceOrTab(peek(this.currentLine, this.offset))) {
            this.advanceOffset(1, true);
          }
        } else {
          listData.padding = markerLength + spacesAfterMarker;
        }

        return listData;
      },
    );
    return (BlockParser.prototype.parseListMarker as Function).apply(this, params);
  }

  /**
   * 根据列表数据向树中插入列表节点与列表项节点。
   */
  public addListItem(listData: ListData): void;
  public addListItem(...params: unknown[]): any {
    BlockParser.prototype.addListItem = overload(
      [Object],
      function (this: BlockParser, listData: ListData) {
        if (
          this.tip.type !== "list" ||
          !this.listsMatch(this.tip.listData!, listData)
        ) {
          const list = this.addChild("list", this.nextNonspace);
          list.listData = { ...listData };
        }
        const item = this.addChild("item", this.nextNonspace);
        item.listData = { ...listData };
      },
    );
    return (BlockParser.prototype.addListItem as Function).apply(this, params);
  }

  /**
   * 判断两组列表数据是否属于同一类型（类型、分隔符、标记字符相同）。
   */
  public listsMatch(a: ListData, b: ListData): boolean;
  public listsMatch(...params: unknown[]): any {
    BlockParser.prototype.listsMatch = overload(
      [Object, Object],
      function (this: BlockParser, a: ListData, b: ListData): boolean {
        return (
          a.type === b.type &&
          a.delimiter === b.delimiter &&
          a.bulletChar === b.bulletChar
        );
      },
    );
    return (BlockParser.prototype.listsMatch as Function).apply(this, params);
  }

  // #endregion

  // #region 树操作

  /**
   * 向当前 tip 节点追加指定类型的子节点，并将 tip 更新为新节点。
   */
  public addChild(type: NodeType, offset: number): Node;
  public addChild(...params: unknown[]): any {
    BlockParser.prototype.addChild = overload(
      [String, Number],
      function (this: BlockParser, type: string, offset: number): Node {
        while (!this.canContain(this.tip.type, type as NodeType)) {
          this.finalize(this.tip, this.lineNumber - 1);
        }
        const node = new Node(type as NodeType, [
          [this.lineNumber, offset + 1],
          [0, 0],
        ]);
        this.tip.appendChild(node);
        this.tip = node;
        return node;
      },
    );
    return (BlockParser.prototype.addChild as Function).apply(this, params);
  }

  /**
   * 判断父节点类型是否允许包含指定子节点类型。
   */
  public canContain(parentType: NodeType, childType: NodeType): boolean;
  public canContain(...params: unknown[]): any {
    BlockParser.prototype.canContain = overload(
      [String, String],
      function (this: BlockParser, parentType: string, childType: string): boolean {
        switch (parentType) {
          case "document":
          case "block_quote":
          case "item":
            return childType !== "item";
          case "list":
            return childType === "item";
          default:
            return false;
        }
      },
    );
    return (BlockParser.prototype.canContain as Function).apply(this, params);
  }

  /**
   * 将当前行的剩余内容追加到 tip 节点的 stringContent 中。
   */
  public addLine(): void;
  public addLine(...params: unknown[]): any {
    BlockParser.prototype.addLine = overload(
      [],
      function (this: BlockParser) {
        if (this.partiallyConsumedTab) {
          this.offset++;
          const charsToTab = 4 - (this.column % 4);
          this.tip.stringContent += " ".repeat(charsToTab);
        }
        this.tip.stringContent += this.currentLine.slice(this.offset) + "\n";
      },
    );
    return (BlockParser.prototype.addLine as Function).apply(this, params);
  }

  /**
   * 关闭所有未能与当前行匹配的打开块节点。
   */
  public closeUnmatchedBlocks(): void;
  public closeUnmatchedBlocks(...params: unknown[]): any {
    BlockParser.prototype.closeUnmatchedBlocks = overload(
      [],
      function (this: BlockParser) {
        if (!this.allClosed) {
          while (this.oldtip !== this.lastMatchedContainer) {
            const parent = this.oldtip.parent!;
            this.finalize(this.oldtip, this.lineNumber - 1);
            this.oldtip = parent;
          }
          this.allClosed = true;
        }
      },
    );
    return (BlockParser.prototype.closeUnmatchedBlocks as Function).apply(this, params);
  }

  // #endregion

  // #region 终结化

  /**
   * 终结指定块节点：关闭节点、设置源码位置并执行后处理逻辑。
   */
  public finalize(block: Node, lineNumber: number): void;
  public finalize(...params: unknown[]): any {
    BlockParser.prototype.finalize = overload(
      [Node, Number],
      function (this: BlockParser, block: Node, lineNumber: number) {
        const parent = block.parent;
        block.open = false;

        if (block.sourcepos) {
          block.sourcepos[1] = [lineNumber, this.lastLineLength + 1];
        }

        switch (block.type) {
          case "paragraph":
            this.finalizeParagraph(block);
            break;
          case "code_block":
            this.finalizeCodeBlock(block);
            break;
          case "html_block":
            block.literal = block.stringContent.replace(/(\n *)+$/, "");
            block.stringContent = "";
            break;
          case "list":
            this.finalizeList(block);
            break;
          default:
            break;
        }

        this.tip = parent || this.doc;
      },
    );
    return (BlockParser.prototype.finalize as Function).apply(this, params);
  }

  /**
   * 终结段落节点：提取链接引用定义，若段落为空则从树中移除。
   */
  public finalizeParagraph(block: Node): void;
  public finalizeParagraph(...params: unknown[]): any {
    BlockParser.prototype.finalizeParagraph = overload(
      [Node],
      function (this: BlockParser, block: Node) {
        let content = block.stringContent;
        let hasRefDef = true;

        while (content.charCodeAt(0) === 0x5b && hasRefDef) {
          const result = this.parseLinkRefDef(content);
          if (result !== null) {
            content = result;
          } else {
            hasRefDef = false;
          }
        }

        block.stringContent = content;
        if (content.trim() === "") {
          block.unlink();
        }
      },
    );
    return (BlockParser.prototype.finalizeParagraph as Function).apply(this, params);
  }

  /**
   * 终结代码块节点：提取代码内容到 literal，并清空 stringContent。
   */
  public finalizeCodeBlock(block: Node): void;
  public finalizeCodeBlock(...params: unknown[]): any {
    BlockParser.prototype.finalizeCodeBlock = overload(
      [Node],
      function (this: BlockParser, block: Node) {
        if (block.isFenced) {
          // 第一行（围栏行）添加了一个空的 '\n'；去除它
          let content = block.stringContent;
          if (content.charCodeAt(0) === 0x0a) {
            content = content.substring(1);
          }
          block.literal = content;
        } else {
          block.literal = block.stringContent.replace(/(\n[ \t]*)+$/, "\n");
        }
        block.stringContent = "";
      },
    );
    return (BlockParser.prototype.finalizeCodeBlock as Function).apply(this, params);
  }

  /**
   * 终结列表节点：根据各列表项末尾是否为空行判断是否为紧凑列表。
   */
  public finalizeList(block: Node): void;
  public finalizeList(...params: unknown[]): any {
    BlockParser.prototype.finalizeList = overload(
      [Node],
      function (this: BlockParser, block: Node) {
        let tight = true;
        let item = block.firstChild;

        while (item) {
          if (this.endsWithBlankLine(item) && item.next) {
            tight = false;
            break;
          }
          let subItem = item.firstChild;
          while (subItem) {
            if (this.endsWithBlankLine(subItem) && (subItem.next || item.next)) {
              tight = false;
              break;
            }
            subItem = subItem.next;
          }
          if (!tight) break;
          item = item.next;
        }

        block.listData!.tight = tight;
      },
    );
    return (BlockParser.prototype.finalizeList as Function).apply(this, params);
  }

  /**
   * 检查给定块节点（含嵌套列表末端）是否以空行结尾。
   */
  public endsWithBlankLine(block: Node): boolean;
  public endsWithBlankLine(...params: unknown[]): any {
    BlockParser.prototype.endsWithBlankLine = overload(
      [Node],
      function (this: BlockParser, block: Node): boolean {
        let cur: Node | null = block;
        while (cur) {
          if (cur.lastLineBlank) return true;
          if (cur.type === "list" || cur.type === "item") {
            cur = cur.lastChild;
          } else {
            break;
          }
        }
        return false;
      },
    );
    return (BlockParser.prototype.endsWithBlankLine as Function).apply(this, params);
  }

  // #endregion

  // #region 链接引用定义解析

  /**
   * 从字符串开头尝试解析链接引用定义，成功时返回剩余字符串，否则返回 null。
   */
  public parseLinkRefDef(s: string): string | null;
  public parseLinkRefDef(...params: unknown[]): any {
    BlockParser.prototype.parseLinkRefDef = overload(
      [String],
      function (this: BlockParser, s: string): string | null {
    let pos = 0;
    if (s.charCodeAt(pos) !== 0x5b) return null;
    pos++;

    let nestLevel = 1;
    let labelEnd = -1;

    while (pos < s.length && nestLevel > 0) {
      const ch = s.charCodeAt(pos);
      if (ch === 0x5c && pos + 1 < s.length) {
        pos += 2;
        continue;
      }
      if (ch === 0x5b) return null;
      if (ch === 0x5d) {
        nestLevel--;
        if (nestLevel === 0) labelEnd = pos;
      }
      pos++;
    }

    if (labelEnd === -1) return null;

    const rawLabel = s.substring(1, labelEnd);
    if (rawLabel.trim() === "" || rawLabel.length > 999) return null;

    if (s.charCodeAt(pos) !== 0x3a) return null;
    pos++;

    while (
      pos < s.length &&
      (s.charCodeAt(pos) === 0x20 || s.charCodeAt(pos) === 0x09)
    ) {
      pos++;
    }
    if (pos < s.length && s.charCodeAt(pos) === 0x0a) {
      pos++;
      while (
        pos < s.length &&
        (s.charCodeAt(pos) === 0x20 || s.charCodeAt(pos) === 0x09)
      ) {
        pos++;
      }
    }

    const destResult = this.parseLinkDestination(s, pos);
    if (destResult === null) return null;
    const dest = destResult.destination;
    pos = destResult.pos;

    const beforeTitle = pos;
    let spacesBeforeTitle = 0;
    let newlineBeforeTitle = false;
    while (
      pos < s.length &&
      (s.charCodeAt(pos) === 0x20 || s.charCodeAt(pos) === 0x09)
    ) {
      pos++;
      spacesBeforeTitle++;
    }
    if (pos < s.length && s.charCodeAt(pos) === 0x0a) {
      pos++;
      newlineBeforeTitle = true;
      while (
        pos < s.length &&
        (s.charCodeAt(pos) === 0x20 || s.charCodeAt(pos) === 0x09)
      ) {
        pos++;
      }
    }

    let title = "";
    let hasTitle = false;
    if (spacesBeforeTitle > 0 || newlineBeforeTitle) {
      const titleResult = this.parseLinkTitle(s, pos);
      if (titleResult !== null) {
        title = titleResult.title;
        pos = titleResult.pos;
        hasTitle = true;
      } else {
        pos = beforeTitle + spacesBeforeTitle;
      }
    } else {
      pos = beforeTitle;
    }

    while (
      pos < s.length &&
      (s.charCodeAt(pos) === 0x20 || s.charCodeAt(pos) === 0x09)
    ) {
      pos++;
    }

    let atEnd = pos >= s.length || s.charCodeAt(pos) === 0x0a;

    if (!atEnd && hasTitle) {
      hasTitle = false;
      title = "";
      pos = beforeTitle + spacesBeforeTitle;
      while (
        pos < s.length &&
        (s.charCodeAt(pos) === 0x20 || s.charCodeAt(pos) === 0x09)
      ) {
        pos++;
      }
      atEnd = pos >= s.length || s.charCodeAt(pos) === 0x0a;
    }

    if (!atEnd) return null;

    if (pos < s.length && s.charCodeAt(pos) === 0x0a) {
      pos++;
    }

    const label = normalizeReference("[" + rawLabel + "]");
    if (label === "") return null;

    if (!(label in this.refmap)) {
      this.refmap[label] = { destination: dest, title: title };
    }

    return s.substring(pos);
      },
    );
    return (BlockParser.prototype.parseLinkRefDef as Function).apply(this, params);
  }

  /**
   * 从字符串的指定位置解析链接目标地址，失败返回 null。
   */
  public parseLinkDestination(
    s: string,
    pos: number,
  ): { destination: string; pos: number } | null;
  public parseLinkDestination(...params: unknown[]): any {
    BlockParser.prototype.parseLinkDestination = overload(
      [String, Number],
      function (this: BlockParser, s: string, pos: number): { destination: string; pos: number } | null {
        if (pos >= s.length) return null;

    if (s.charCodeAt(pos) === 0x3c) {
      pos++;
      let dest = "";
      while (pos < s.length) {
        const ch = s.charCodeAt(pos);
        if (ch === 0x0a || ch === 0x0d) return null;
        if (ch === 0x3e)
          return { destination: unescapeString(dest), pos: pos + 1 };
        if (
          ch === 0x5c &&
          pos + 1 < s.length &&
          s.charCodeAt(pos + 1) !== 0x0a
        ) {
          dest += s.charAt(pos + 1);
          pos += 2;
          continue;
        }
        if (ch === 0x3c) return null;
        dest += s.charAt(pos);
        pos++;
      }
      return null;
    }

    let parenDepth = 0;
    let dest = "";
    const startPos = pos;

    while (pos < s.length) {
      const ch = s.charCodeAt(pos);
      if (isSpaceOrTab(ch) || ch === 0x0a || ch === 0x0d) break;
      if (ch < 0x20 || ch === 0x7f) break;
      if (
        ch === 0x5c &&
        pos + 1 < s.length &&
        isAsciiPunctuation(s.charCodeAt(pos + 1))
      ) {
        dest += s.charAt(pos + 1);
        pos += 2;
        continue;
      }
      if (ch === 0x28) {
        parenDepth++;
        if (parenDepth > 32) return null;
        dest += "(";
        pos++;
        continue;
      }
      if (ch === 0x29) {
        if (parenDepth === 0) break;
        parenDepth--;
        dest += ")";
        pos++;
        continue;
      }
      dest += s.charAt(pos);
      pos++;
    }

    if (parenDepth !== 0) return null;
    if (pos === startPos) return { destination: "", pos };
    return { destination: unescapeString(dest), pos };
      },
    );
    return (BlockParser.prototype.parseLinkDestination as Function).apply(this, params);
  }

  /**
   * 从字符串的指定位置解析链接标题，失败返回 null。
   */
  public parseLinkTitle(
    s: string,
    pos: number,
  ): { title: string; pos: number } | null;
  public parseLinkTitle(...params: unknown[]): any {
    BlockParser.prototype.parseLinkTitle = overload(
      [String, Number],
      function (this: BlockParser, s: string, pos: number): { title: string; pos: number } | null {
        if (pos >= s.length) return null;

    const opener = s.charCodeAt(pos);
    let closer: number;
    if (opener === 0x22) closer = 0x22;
    else if (opener === 0x27) closer = 0x27;
    else if (opener === 0x28) closer = 0x29;
    else return null;

    pos++;
    let title = "";

    while (pos < s.length) {
      const ch = s.charCodeAt(pos);
      if (ch === closer) return { title: unescapeString(title), pos: pos + 1 };
      if (
        ch === 0x5c &&
        pos + 1 < s.length &&
        isAsciiPunctuation(s.charCodeAt(pos + 1))
      ) {
        title += s.charAt(pos + 1);
        pos += 2;
        continue;
      }
      if (opener === 0x28 && ch === 0x28) return null;
      title += s.charAt(pos);
      pos++;
    }

    return null;
      },
    );
    return (BlockParser.prototype.parseLinkTitle as Function).apply(this, params);
  }

  // #endregion

  // #region 行内解析

  /**
   * 遍历 AST，对所有段落和标题节点执行行内元素解析。
   */
  public processInlines(block: Node): void;
  public processInlines(...params: unknown[]): any {
    BlockParser.prototype.processInlines = overload(
      [Node],
      function (this: BlockParser, block: Node) {
        const walker = block.walker();
        let event: ReturnType<typeof walker.next>;
        while ((event = walker.next())) {
          if (!event.entering) continue;
          if (event.node.type === "paragraph" || event.node.type === "heading") {
            this.inlineParser.parse(event.node, this.refmap);
          }
        }
      },
    );
    return (BlockParser.prototype.processInlines as Function).apply(this, params);
  }

  // #endregion

  // #region 偏移量管理

  /**
   * 扫描当前行，定位下一个非空白字符并更新相关状态字段。
   */
  public findNextNonspace(): void;
  public findNextNonspace(...params: unknown[]): any {
    BlockParser.prototype.findNextNonspace = overload(
      [],
      function (this: BlockParser) {
        const currentLine = this.currentLine;
        let i = this.offset;
        let col = this.column;

        while (i < currentLine.length) {
          const ch = currentLine.charCodeAt(i);
          if (ch === 0x20) {
            i++;
            col++;
          } else if (ch === 0x09) {
            i++;
            col += 4 - (col % 4);
          } else {
            break;
          }
        }

        this.blank = i >= currentLine.length;
        this.nextNonspace = i;
        this.nextNonspaceColumn = col;
        this.indent = this.nextNonspaceColumn - this.column;
        this.indented = this.indent >= 4;
      },
    );
    return (BlockParser.prototype.findNextNonspace as Function).apply(this, params);
  }

  /**
   * 按字符数或列数推进当前行的解析偏移量。
   */
  public advanceOffset(count: number, columns: boolean): void;
  public advanceOffset(...params: unknown[]): any {
    BlockParser.prototype.advanceOffset = overload(
      [Number, Boolean],
      function (this: BlockParser, count: number, columns: boolean) {
        const currentLine = this.currentLine;

        if (columns) {
          let remaining = count;
          while (remaining > 0 && this.offset < currentLine.length) {
            const ch = currentLine.charCodeAt(this.offset);
            if (ch === 0x09) {
              const charsToTab = 4 - (this.column % 4);
              if (charsToTab > remaining) {
                this.partiallyConsumedTab = true;
                this.column += remaining;
                remaining = 0;
              } else {
                this.partiallyConsumedTab = false;
                this.column += charsToTab;
                this.offset++;
                remaining -= charsToTab;
              }
            } else {
              this.partiallyConsumedTab = false;
              this.offset++;
              this.column++;
              remaining--;
            }
          }
        } else {
          this.offset += count;
          this.column += count;
        }
      },
    );
    return (BlockParser.prototype.advanceOffset as Function).apply(this, params);
  }

  // #endregion
}

// #endregion

function isAsciiPunctuation(code: number): boolean {
  return (
    (code >= 0x21 && code <= 0x2f) ||
    (code >= 0x3a && code <= 0x40) ||
    (code >= 0x5b && code <= 0x60) ||
    (code >= 0x7b && code <= 0x7e)
  );
}
