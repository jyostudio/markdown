/**
 * CommonMark 0.31.2 的行内级解析器。
 *
 * 处理：代码跨度、强调/加粗、链接、图片、自动链接、
 * 原始 HTML、硬/软换行、反斜杠转义、实体、文本。
 */

import overload from "@jyostudio/overload";
import { Node } from "./node";
import type { InlineHandler } from "./plugin";
import {
  unescapeString,
  normalizeURI,
  normalizeReference,
  isUnicodePunctuation,
  isUnicodeWhitespace,
  reEntityHere,
  OPENTAG,
  CLOSETAG,
} from "./common";

import type { RefMap } from "./common";

// #region 分隔符

/**
 * 强调/加粗分隔符链表节点，用于两遍式强调匹配算法。
 */
interface Delimiter {
  /**
   * 分隔符的字符码点（* 为 0x2A，_ 为 0x5F）
   */
  cc: number;

  /**
   * 当前有效分隔符数量
   */
  numdelims: number;

  /**
   * 原始分隔符数量（用于匹配回溢）
   */
  origdelims: number;

  /**
   * 对应的文本节点
   */
  node: Node;

  /**
   * 链表前驱
   */
  prev: Delimiter | null;

  /**
   * 链表后继
   */
  next: Delimiter | null;

  /**
   * 是否可以作为开启分隔符
   */
  canOpen: boolean;

  /**
   * 是否可以作为闭合分隔符
   */
  canClose: boolean;

  /**
   * 是否仍处于激活状态
   */
  active: boolean;
}

/**
 * 括号链表节点，用于跟踪尚未闭合的 [ 或 ![ 以便解析链接与图片。
 */
interface Bracket {
  /**
   * 对应的左方括号节点
   */
  node: Node;

  /**
   * 链表前驱
   */
  prev: Bracket | null;

  /**
   * 进入括号时的分隔符链表尾节点
   */
  previousDelimiter: Delimiter | null;

  /**
   * 左方括号在主题字符串中的位置索引
   */
  index: number;

  /**
   * 是否为图片语法（![ 开头）
   */
  image: boolean;

  /**
   * 是否仍处于激活状态
   */
  active: boolean;

  /**
   * 当前括号后是否更接另一个括号
   */
  bracketAfter: boolean;
}

// #endregion

// #region 正则表达式模式

/**
 * 可转义字符正则（锚定行首）
 */
const reEscapable = /^[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]/;
/**
 * 链接标签正则（方括号内至多 999 个字符）
 */
const reLinkLabel = /^\[(?:[^\\\[\]]|\\.){0,999}\]/s;
/**
 * 尖括号包裹的链接目标正则
 */
const reLinkDestinationBraces = /^(?:<(?:[^<>\n\r\\]|\\.)*>)/s;
/**
 * URL 自动链接正则
 */
const reAutolink = /^<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^\s<>]*>/;
/**
 * 邮件地址自动链接正则
 */
const reEmailAutolink =
  /^<[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*>/;
/**
 * 行内 HTML 标签正则
 */
const reHtmlTagInline = new RegExp(
  `^(?:` +
  `${OPENTAG}|` +
  `${CLOSETAG}|` +
  `<!---->|<!---?>|<!--(?!-?>)[\\s\\S]*?-->|` +
  `<[?][\\s\\S]*?[?]>|` +
  `<![A-Za-z]+[^>]*>|` +
  `<!\\[CDATA\\[[\\s\\S]*?\\]\\]>` +
  `)`,
);

// #endregion

// #region 行内解析器

export class InlineParser {
  /**
   * 当前正在解析的字符串内容
   */
  subject = "";


  /**
   * 当前解析位置（字符索引）
   */
  pos = 0;


  /**
   * 分隔符链表头（用于强调/加粗处理）
   */
  delimiters: Delimiter | null = null;


  /**
   * 括号链表头（用于链接/图片处理）
   */
  brackets: Bracket | null = null;


  /**
   * 链接引用定义映射表
   */
  refmap: RefMap = {};

  /**
   * 插件提供的行内 handler
   */
  #pluginInlineHandlers: InlineHandler[] = [];

  /**
   * 插件触发字符码集合，用于 parseString 中断消耗
   */
  #pluginTriggerChars: Set<number> = new Set();

  constructor(inlineHandlers?: InlineHandler[]) {
    this.#pluginInlineHandlers = inlineHandlers || [];
    for (const handler of this.#pluginInlineHandlers) {
      this.#pluginTriggerChars.add(handler.triggerCharCode);
    }
  }

  /**
   * 解析块节点的 stringContent，将行内元素作为子节点追加，并执行强调后处理。
   */
  public parse(block: Node, refmap: RefMap): void;
  public parse(...params: unknown[]): any {
    InlineParser.prototype.parse = overload(
      [Node, Object],
      function (this: InlineParser, block: Node, refmap: RefMap): void {
        this.subject = block.stringContent
          .replace(/\n$/, "")
          .replace(/[ \t]+$/, "");
        this.pos = 0;
        this.delimiters = null;
        this.brackets = null;
        this.refmap = refmap;

        let c: number;
        while ((c = this.peek()) !== -1) {
          const parsed = this.parseInline(block);
          if (!parsed) {
            this.pos++;
            block.appendChild(this.text(String.fromCodePoint(c)));
          }
        }

        block.stringContent = "";
        this.processEmphasis(null);
      },
    );
    return (InlineParser.prototype.parse as Function).apply(this, params);
  }

  /**
   * 返回当前位置字符的码点；到达字符串末尾则返回 -1。
   */
  public peek(): number;
  public peek(...params: unknown[]): any {
    InlineParser.prototype.peek = overload(
      [],
      function (this: InlineParser): number {
        if (this.pos < this.subject.length) {
          return this.subject.charCodeAt(this.pos);
        }
        return -1;
      },
    );
    return (InlineParser.prototype.peek as Function).apply(this, params);
  }

  // #region 解析单个行内元素

  /**
   * 识别并解析当前位置的单个行内元素，追加到块节点，返回是否解析成功。
   */
  public parseInline(block: Node): boolean;
  public parseInline(...params: unknown[]): any {
    InlineParser.prototype.parseInline = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        const c = this.peek();
        switch (c) {
          case 0x0a: // \n
            return this.parseNewline(block);
          case 0x5c: // \
            return this.parseBackslash(block);
          case 0x60: // `
            return this.parseBackticks(block);
          case 0x2a: // *
          case 0x5f: // _
            return this.handleDelim(c, block);
          case 0x5b: // [
            return this.parseOpenBracket(block);
          case 0x21: // !
            return this.parseBang(block);
          case 0x5d: // ]
            return this.parseCloseBracket(block);
          case 0x3c: // <
            return this.parseAutolink(block) || this.parseHtmlTag(block);
          case 0x26: // &
            return this.parseEntity(block);
          default: {
            // 检查插件行内 handler
            for (const handler of this.#pluginInlineHandlers) {
              if (handler.triggerCharCode === c) {
                if (handler.parse(this, block)) return true;
              }
            }
            return this.parseString(block);
          }
        }
      },
    );
    return (InlineParser.prototype.parseInline as Function).apply(this, params);
  }

  // #endregion

  // #region 换行符

  /**
   * 解析换行符，根据前置内容生成软换行或硬换行节点。
   */
  public parseNewline(block: Node): boolean;
  public parseNewline(...params: unknown[]): any {
    InlineParser.prototype.parseNewline = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        this.pos++;
        // 检查前面的空格（硬换行需要 2 个以上）
        const lastChild = block.lastChild;
        if (lastChild && lastChild.type === "text" && lastChild.literal !== null) {
          const text = lastChild.literal;
          if (text.endsWith("  ")) {
            // 硬换行
            lastChild.literal = text.replace(/ +$/, "");
            block.appendChild(new Node("linebreak"));
          } else if (text.endsWith("\\")) {
            // 反斜杠硬换行
            lastChild.literal = text.slice(0, -1);
            block.appendChild(new Node("linebreak"));
          } else {
            // 软换行 —— 去除尾随空格
            lastChild.literal = text.replace(/ +$/, "");
            block.appendChild(new Node("softbreak"));
          }
        } else {
          block.appendChild(new Node("softbreak"));
        }

        // 跳过下一行的前导空格
        while (
          this.pos < this.subject.length &&
          this.subject.charCodeAt(this.pos) === 0x20
        ) {
          this.pos++;
        }
        return true;
      },
    );
    return (InlineParser.prototype.parseNewline as Function).apply(this, params);
  }

  // #endregion

  // #region 反斜杠转义

  /**
   * 解析反斜杠转义序列或反斜杠硬换行。
   */
  public parseBackslash(block: Node): boolean;
  public parseBackslash(...params: unknown[]): any {
    InlineParser.prototype.parseBackslash = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        this.pos++;
        if (this.pos < this.subject.length) {
          const cc = this.subject.charCodeAt(this.pos);
          if (cc === 0x0a) {
            // 硬换行
            this.pos++;
            block.appendChild(new Node("linebreak"));
            // 跳过前导空格
            while (
              this.pos < this.subject.length &&
              this.subject.charCodeAt(this.pos) === 0x20
            ) {
              this.pos++;
            }
            return true;
          }
          if (reEscapable.test(this.subject.charAt(this.pos))) {
            block.appendChild(this.text(this.subject.charAt(this.pos)));
            this.pos++;
            return true;
          }
        }
        block.appendChild(this.text("\\"));
        return true;
      },
    );
    return (InlineParser.prototype.parseBackslash as Function).apply(this, params);
  }

  // #endregion

  // #region 反引号（代码跨度）

  /**
   * 解析反引号代码跨度（code span）。
   */
  public parseBackticks(block: Node): boolean;
  public parseBackticks(...params: unknown[]): any {
    InlineParser.prototype.parseBackticks = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        const startPos = this.pos;
        const ticks = this.subject.slice(this.pos).match(/^`+/);
        if (!ticks) return false;

        const tickLength = ticks[0].length;
        const afterTicks = startPos + tickLength;
        this.pos = afterTicks;

        // 查找匹配的关闭反引号序列
        let searchPos = this.pos;

        while (searchPos < this.subject.length) {
          const closingMatch = this.subject.slice(searchPos).match(/`+/);
          if (!closingMatch) break;

          const closingPos = searchPos + closingMatch.index!;
          const closingLength = closingMatch[0].length;

          if (closingLength === tickLength) {
            // 找到匹配的关闭反引号
            let content = this.subject.substring(afterTicks, closingPos);
            // 行尾 → 空格
            content = content.replace(/\n/g, " ");
            // 如果内容不全是空格，则去除单个前导/尾随空格
            if (
              content.length > 0 &&
              content.charAt(0) === " " &&
              content.charAt(content.length - 1) === " " &&
              /[^ ]/.test(content)
            ) {
              content = content.substring(1, content.length - 1);
            }

            const codeNode = new Node("code");
            codeNode.literal = content;
            block.appendChild(codeNode);
            this.pos = closingPos + closingLength;
            return true;
          }

          searchPos = closingPos + closingLength;
        }

        // 未找到匹配的关闭反引号：字面反引号
        this.pos = startPos;
        block.appendChild(this.text(ticks[0]));
        this.pos = afterTicks;
        return true;
      },
    );
    return (InlineParser.prototype.parseBackticks as Function).apply(this, params);
  }

  // #endregion

  // #region 强调分隔符

  /**
   * 处理强调/加粗分隔符（* 或 _），向分隔符链表注册节点。
   */
  public handleDelim(cc: number, block: Node): boolean;
  public handleDelim(...params: unknown[]): any {
    InlineParser.prototype.handleDelim = overload(
      [Number, Node],
      function (this: InlineParser, cc: number, block: Node): boolean {
        const res = this.scanDelims(cc);
        if (!res) return false;

        const numdelims = res.numdelims;
        const startPos = this.pos;

        this.pos += numdelims;

        const contents = this.subject.substring(startPos, this.pos);
        const node = this.text(contents);
        block.appendChild(node);

        if (!(res.canOpen || res.canClose)) {
          return true;
        }

        const delimiter: Delimiter = {
          cc,
          numdelims,
          origdelims: numdelims,
          node,
          prev: this.delimiters,
          next: null,
          canOpen: res.canOpen,
          canClose: res.canClose,
          active: true,
        };

        if (this.delimiters !== null) {
          this.delimiters.next = delimiter;
        }
        this.delimiters = delimiter;

        return true;
      },
    );
    return (InlineParser.prototype.handleDelim as Function).apply(this, params);
  }

  /**
   * 扫描连续的分隔符数量，并判断其左/右侧翼合法性。
   */
  public scanDelims(cc: number): { numdelims: number; canOpen: boolean; canClose: boolean } | null;
  public scanDelims(...params: unknown[]): any {
    InlineParser.prototype.scanDelims = overload(
      [Number],
      function (this: InlineParser, cc: number): { numdelims: number; canOpen: boolean; canClose: boolean } | null {
        let numdelims = 0;

        const charBefore =
          this.pos === 0 ? 0x0a : this.subject.charCodeAt(this.pos - 1);

        while (
          this.pos + numdelims < this.subject.length &&
          this.subject.charCodeAt(this.pos + numdelims) === cc
        ) {
          numdelims++;
        }

        if (numdelims === 0) return null;

        const charAfter =
          this.pos + numdelims < this.subject.length
            ? this.subject.charCodeAt(this.pos + numdelims)
            : 0x0a;

        const afterIsWhitespace = isUnicodeWhitespace(charAfter);
        const afterIsPunctuation = isUnicodePunctuation(charAfter);
        const beforeIsWhitespace = isUnicodeWhitespace(charBefore);
        const beforeIsPunctuation = isUnicodePunctuation(charBefore);

        const leftFlanking =
          !afterIsWhitespace &&
          (!afterIsPunctuation || beforeIsWhitespace || beforeIsPunctuation);

        const rightFlanking =
          !beforeIsWhitespace &&
          (!beforeIsPunctuation || afterIsWhitespace || afterIsPunctuation);

        let canOpen: boolean;
        let canClose: boolean;

        if (cc === 0x5f /* _ */) {
          canOpen = leftFlanking && (!rightFlanking || beforeIsPunctuation);
          canClose = rightFlanking && (!leftFlanking || afterIsPunctuation);
        } else {
          canOpen = leftFlanking;
          canClose = rightFlanking;
        }

        return { numdelims, canOpen, canClose };
      },
    );
    return (InlineParser.prototype.scanDelims as Function).apply(this, params);
  }

  /**
   * 对分隔符链表执行强调匹配算法，生成 emph / strong 节点。
   */
  public processEmphasis(stackBottom: Delimiter | null): void;
  public processEmphasis(...params: unknown[]): any {
    const processEmphasisImpl = function (this: InlineParser, stackBottom: Delimiter | null): void {
      // 在 stackBottom 之上查找第一个可能的关闭分隔符
      const openers_bottom: Record<string, Delimiter | null> = {};
      const getKey = (cc: number, closerLen: number) => `${cc}_${closerLen % 3}`;

      // 将所有 openers_bottom 初始化为 stackBottom
      for (const cc of [0x2a, 0x5f]) {
        for (const rem of [0, 1, 2]) {
          openers_bottom[`${cc}_${rem}`] = stackBottom;
        }
      }

      let closer = stackBottom ? stackBottom.next : this.delimiters;
      // 向前遍历找到第一个分隔符
      while (closer !== null && closer.prev !== stackBottom) {
        closer = closer.prev;
      }
      if (stackBottom === null) {
        // 找到第一个分隔符
        let d = this.delimiters;
        while (d !== null && d.prev !== null) {
          d = d.prev;
        }
        closer = d;
      } else {
        closer = stackBottom.next;
      }

      while (closer !== null) {
        if (!closer.canClose) {
          closer = closer.next;
          continue;
        }

        const cc = closer.cc;

        // 查找开始分隔符
        let opener = closer.prev;
        let openerFound = false;
        const bottomKey = getKey(cc, closer.origdelims);
        const bottom = openers_bottom[bottomKey] || stackBottom;

        while (opener !== null && opener !== bottom && opener !== stackBottom) {
          if (opener.cc === cc && opener.canOpen && opener.active) {
            // 检查“3的倍数”规则
            if (
              (opener.canClose || closer.canOpen) &&
              (opener.origdelims + closer.origdelims) % 3 === 0 &&
              !(opener.origdelims % 3 === 0 && closer.origdelims % 3 === 0)
            ) {
              // 规则阻止匹配
              opener = opener.prev;
              continue;
            }
            openerFound = true;
            break;
          }
          opener = opener.prev;
        }

        if (!openerFound) {
          // 未找到开始分隔符；为后续搜索设置下限
          openers_bottom[bottomKey] = closer.prev;
          if (!closer.canOpen) {
            // 可以移除
            const next = closer.next;
            this.removeDelimiter(closer);
            closer = next;
          } else {
            closer = closer.next;
          }
          continue;
        }

        // 找到开始和关闭分隔符
        const useDelims = closer.numdelims >= 2 && opener!.numdelims >= 2 ? 2 : 1;
        const openerNode = opener!.node;
        const closerNode = closer.node;

        // 从开始分隔符文本中移除已使用的分隔符
        opener!.numdelims -= useDelims;
        closer.numdelims -= useDelims;

        openerNode.literal = openerNode.literal!.substring(
          0,
          openerNode.literal!.length - useDelims,
        );
        closerNode.literal = closerNode.literal!.substring(
          0,
          closerNode.literal!.length - useDelims,
        );

        // 构建强调节点
        const emphNode = new Node(useDelims === 2 ? "strong" : "emph");

        // 将开始和关闭分隔符之间的节点移入强调节点
        let tmp = openerNode.next;
        while (tmp && tmp !== closerNode) {
          const next = tmp.next;
          emphNode.appendChild(tmp);
          tmp = next;
        }
        openerNode.insertAfter(emphNode);

        // 移除开始和关闭分隔符之间的分隔符
        let tempDelim = closer.prev;
        while (tempDelim !== null && tempDelim !== opener) {
          const prev = tempDelim.prev;
          this.removeDelimiter(tempDelim);
          tempDelim = prev;
        }

        // 如果完全消耗则移除开始/关闭分隔符
        if (opener!.numdelims === 0) {
          openerNode.unlink();
          this.removeDelimiter(opener!);
        }

        if (closer.numdelims === 0) {
          const next = closer.next;
          closerNode.unlink();
          this.removeDelimiter(closer);
          closer = next;
        }
      }

      // 移除剩余的分隔符
      let d = this.delimiters;
      while (d !== null && d !== stackBottom) {
        const prev = d.prev;
        this.removeDelimiter(d);
        d = prev;
      }
    };
    InlineParser.prototype.processEmphasis = overload([null], processEmphasisImpl).add([Object], processEmphasisImpl);
    return (InlineParser.prototype.processEmphasis as Function).apply(this, params);
  }

  /**
   * 将指定节点从分隔符链表中移除。
   */
  public removeDelimiter(delim: Delimiter): void;
  public removeDelimiter(...params: unknown[]): any {
    InlineParser.prototype.removeDelimiter = overload(
      [Object],
      function (this: InlineParser, delim: Delimiter): void {
        if (delim.prev !== null) {
          delim.prev.next = delim.next;
        }
        if (delim.next !== null) {
          delim.next.prev = delim.prev;
        }
        if (delim === this.delimiters) {
          this.delimiters = delim.prev;
        }
      },
    );
    return (InlineParser.prototype.removeDelimiter as Function).apply(this, params);
  }

  // #endregion

  // #region 链接和图片

  /**
   * 解析左方括号 [，向括号链表注册当前位置。
   */
  public parseOpenBracket(block: Node): boolean;
  public parseOpenBracket(...params: unknown[]): any {
    InlineParser.prototype.parseOpenBracket = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        this.pos++;
        const node = this.text("[");
        block.appendChild(node);

        this.addBracket(node, this.pos - 1, false);
        return true;
      },
    );
    return (InlineParser.prototype.parseOpenBracket as Function).apply(this, params);
  }

  /**
   * 解析感叹号 !，若紧跟 [ 则作为图片前缀处理。
   */
  public parseBang(block: Node): boolean;
  public parseBang(...params: unknown[]): any {
    InlineParser.prototype.parseBang = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        const startPos = this.pos;
        this.pos++;

        if (
          this.pos < this.subject.length &&
          this.subject.charCodeAt(this.pos) === 0x5b /* [ */
        ) {
          this.pos++;
          const node = this.text("![");
          block.appendChild(node);
          this.addBracket(node, startPos + 1, true);
        } else {
          block.appendChild(this.text("!"));
        }

        return true;
      },
    );
    return (InlineParser.prototype.parseBang as Function).apply(this, params);
  }

  /**
   * 在括号链表头部插入新的括号节点。
   */
  public addBracket(node: Node, index: number, image: boolean): void;
  public addBracket(...params: unknown[]): any {
    InlineParser.prototype.addBracket = overload(
      [Node, Number, Boolean],
      function (this: InlineParser, node: Node, index: number, image: boolean): void {
        if (this.brackets !== null) {
          this.brackets.bracketAfter = true;
        }

        this.brackets = {
          node,
          prev: this.brackets,
          previousDelimiter: this.delimiters,
          index,
          image,
          active: true,
          bracketAfter: false,
        };
      },
    );
    return (InlineParser.prototype.addBracket as Function).apply(this, params);
  }

  /**
   * 移除括号链表的头节点（最近一个未闭合的括号）。
   */
  public removeBracket(): void;
  public removeBracket(...params: unknown[]): any {
    InlineParser.prototype.removeBracket = overload(
      [],
      function (this: InlineParser): void {
        if (this.brackets !== null) {
          this.brackets = this.brackets.prev;
        }
      },
    );
    return (InlineParser.prototype.removeBracket as Function).apply(this, params);
  }

  /**
   * 解析右方括号 ]，尝试组合链接或图片节点。
   */
  public parseCloseBracket(block: Node): boolean;
  public parseCloseBracket(...params: unknown[]): any {
    InlineParser.prototype.parseCloseBracket = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        this.pos++;

        // 查找方括号开启符
        let opener = this.brackets;

        if (opener === null) {
          block.appendChild(this.text("]"));
          return true;
        }

        if (!opener.active) {
          block.appendChild(this.text("]"));
          this.removeBracket();
          return true;
        }

        // 尝试解析行内链接或引用链接
        const startPos = this.pos;
        let dest: string | null = null;
        let title: string | null = null;
        let matched = false;
        let refLabel: string | null = null;

        // 尝试行内链接：( 目标地址 标题? )
        if (
          this.pos < this.subject.length &&
          this.subject.charCodeAt(this.pos) === 0x28 /* ( */
        ) {
          this.pos++;
          this.spnl();

          const destResult = this.parseLinkDestination();
          if (destResult !== null) {
            dest = destResult;
            // 可选标题
            const beforeTitle = this.pos;
            if (this.spnl()) {
              const titleResult = this.parseLinkTitle();
              if (titleResult !== null) {
                title = titleResult;
              } else {
                this.pos = beforeTitle;
              }
            }
            this.spnl();
            if (
              this.pos < this.subject.length &&
              this.subject.charCodeAt(this.pos) === 0x29 /* ) */
            ) {
              this.pos++;
              matched = true;
            } else {
              this.pos = startPos;
            }
          } else {
            this.pos = startPos;
          }
        }

        if (!matched) {
          // 尝试引用链接
          const savePos = this.pos;

          // 尝试 [引用标签] —— 必须紧跟 ] 之后
          const labelResult = this.parseLinkLabel();
          if (labelResult !== null && labelResult.length > 2) {
            refLabel = labelResult;
          } else {
            // 快捷或折叠引用：用第一个方括号内容作为标签
            refLabel = this.subject.substring(opener.index, startPos);
            if (labelResult === null || labelResult.length === 0) {
              // 快捷引用：没有第二个标签，重置 pos
              this.pos = savePos;
            }
            // 折叠引用（labelResult === '[]'），pos 停留在 '[]' 之后
          }

          // 查找引用
          const ref = normalizeReference(refLabel);
          if (ref in this.refmap) {
            const refData = this.refmap[ref];
            dest = refData.destination;
            title = refData.title;
            matched = true;
          } else {
            this.pos = startPos;
          }
        }

        if (matched) {
          const isImage = opener.image;
          const node = new Node(isImage ? "image" : "link");
          node.destination = dest;
          node.title = title || "";

          // 将开始和关闭方括号之间的节点移入链接/图片节点
          let tmp = opener.node.next;
          while (tmp) {
            const next = tmp.next;
            node.appendChild(tmp);
            tmp = next;
          }

          block.appendChild(node);

          // 处理链接内部的强调
          this.processEmphasis(opener.previousDelimiter);
          this.removeBracket();

          opener.node.unlink();

          // 如果不是图片，停用所有更早的 [ 方括号（不允许嵌套链接）
          if (!isImage) {
            let br = this.brackets;
            while (br !== null) {
              if (!br.image) {
                br.active = false;
              }
              br = br.prev;
            }
          }

          return true;
        }

        // 未匹配
        this.removeBracket();
        this.pos = startPos;
        block.appendChild(this.text("]"));
        return true;
      },
    );
    return (InlineParser.prototype.parseCloseBracket as Function).apply(this, params);
  }

  /**
   * 从当前位置解析行内链接目标地址，失败返回 null。
   */
  public parseLinkDestination(): string | null;
  public parseLinkDestination(...params: unknown[]): any {
    InlineParser.prototype.parseLinkDestination = overload(
      [],
      function (this: InlineParser): string | null {
        const subject = this.subject;
        const pos = this.pos;

        if (pos >= subject.length) return null;

        if (subject.charCodeAt(pos) === 0x3c /* < */) {
          // 尖括号目标地址
          const match = subject.slice(pos).match(reLinkDestinationBraces);
          if (match) {
            this.pos = pos + match[0].length;
            return unescapeString(match[0].substring(1, match[0].length - 1));
          }
          return null;
        }

        // 普通目标地址
        let depth = 0;
        let i = pos;

        while (i < subject.length) {
          const ch = subject.charCodeAt(i);

          if (ch === 0x20 || ch <= 0x1f || ch === 0x7f) break;
          if (ch === 0x0a) break;

          if (ch === 0x5c && i + 1 < subject.length) {
            const next = subject.charCodeAt(i + 1);
            if (isAsciiPunct(next)) {
              i += 2;
              continue;
            }
          }

          if (ch === 0x28 /* ( */) {
            depth++;
            if (depth > 32) return null;
            i++;
            continue;
          }

          if (ch === 0x29 /* ) */) {
            if (depth === 0) break;
            depth--;
            i++;
            continue;
          }

          i++;
        }

        if (depth !== 0) return null;
        if (i === pos) return "";

        this.pos = i;
        return unescapeString(subject.substring(pos, i));
      },
    );
    return (InlineParser.prototype.parseLinkDestination as Function).apply(this, params);
  }

  /**
   * 从当前位置解析行内链接标题，失败返回 null。
   */
  public parseLinkTitle(): string | null;
  public parseLinkTitle(...params: unknown[]): any {
    InlineParser.prototype.parseLinkTitle = overload(
      [],
      function (this: InlineParser): string | null {
        const subject = this.subject;
        const pos = this.pos;

        if (pos >= subject.length) return null;

        const opener = subject.charCodeAt(pos);
        let closer: number;

        if (opener === 0x22 /* " */) {
          closer = 0x22;
        } else if (opener === 0x27 /* ' */) {
          closer = 0x27;
        } else if (opener === 0x28 /* ( */) {
          closer = 0x29;
        } else {
          return null;
        }

        let i = pos + 1;

        while (i < subject.length) {
          const ch = subject.charCodeAt(i);

          if (ch === closer) {
            this.pos = i + 1;
            return unescapeString(subject.substring(pos + 1, i));
          }

          if (ch === 0x5c && i + 1 < subject.length) {
            i += 2;
            continue;
          }

          if (opener === 0x28 && ch === 0x28) return null;

          i++;
        }

        return null;
      },
    );
    return (InlineParser.prototype.parseLinkTitle as Function).apply(this, params);
  }

  /**
   * 从当前位置解析链接标签（方括号内容），失败返回 null。
   */
  public parseLinkLabel(): string | null;
  public parseLinkLabel(...params: unknown[]): any {
    InlineParser.prototype.parseLinkLabel = overload(
      [],
      function (this: InlineParser): string | null {
        const subject = this.subject;
        if (this.pos >= subject.length || subject.charCodeAt(this.pos) !== 0x5b)
          return null;

        const match = subject.slice(this.pos).match(reLinkLabel);
        if (match) {
          this.pos += match[0].length;
          return match[0];
        }
        return null;
      },
    );
    return (InlineParser.prototype.parseLinkLabel as Function).apply(this, params);
  }

  // #endregion

  // #region 自动链接

  /**
   * 解析尖括号形式的 URL 或邮件地址自动链接。
   */
  public parseAutolink(block: Node): boolean;
  public parseAutolink(...params: unknown[]): any {
    InlineParser.prototype.parseAutolink = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        const subject = this.subject;
        let match: RegExpMatchArray | null;

        match = subject.slice(this.pos).match(reAutolink);
        if (match) {
          const uri = match[0].substring(1, match[0].length - 1);
          const node = new Node("link");
          node.destination = normalizeURI(uri);
          node.title = "";
          node.appendChild(this.text(uri));
          block.appendChild(node);
          this.pos += match[0].length;
          return true;
        }

        match = subject.slice(this.pos).match(reEmailAutolink);
        if (match) {
          const email = match[0].substring(1, match[0].length - 1);
          const node = new Node("link");
          node.destination = normalizeURI("mailto:" + email);
          node.title = "";
          node.appendChild(this.text(email));
          block.appendChild(node);
          this.pos += match[0].length;
          return true;
        }

        return false;
      },
    );
    return (InlineParser.prototype.parseAutolink as Function).apply(this, params);
  }

  // #endregion

  // #region 原始 HTML

  /**
   * 解析行内 HTML 标签。
   */
  public parseHtmlTag(block: Node): boolean;
  public parseHtmlTag(...params: unknown[]): any {
    InlineParser.prototype.parseHtmlTag = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        const match = this.subject.slice(this.pos).match(reHtmlTagInline);
        if (match) {
          const node = new Node("html_inline");
          node.literal = match[0];
          block.appendChild(node);
          this.pos += match[0].length;
          return true;
        }
        return false;
      },
    );
    return (InlineParser.prototype.parseHtmlTag as Function).apply(this, params);
  }

  // #endregion

  // #region 实体

  /**
   * 解析 HTML 字符实体引用（如 &amp;、&#123; 等）。
   */
  public parseEntity(block: Node): boolean;
  public parseEntity(...params: unknown[]): any {
    InlineParser.prototype.parseEntity = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        const match = this.subject.slice(this.pos).match(reEntityHere);
        if (match) {
          block.appendChild(this.text(unescapeString(match[0])));
          this.pos += match[0].length;
          return true;
        }
        return false;
      },
    );
    return (InlineParser.prototype.parseEntity as Function).apply(this, params);
  }

  // #endregion

  // #region 纯文本

  /**
   * 解析普通文本内容，合并连续的非特殊字符。
   */
  public parseString(block: Node): boolean;
  public parseString(...params: unknown[]): any {
    InlineParser.prototype.parseString = overload(
      [Node],
      function (this: InlineParser, block: Node): boolean {
        let end = this.pos + 1;
        const subject = this.subject;

        // 尽可能消耗不会开始特殊行内元素的文本
        while (end < subject.length) {
          const ch = subject.charCodeAt(end);
          if (
            ch === 0x0a || // \n
            ch === 0x5c || // \
            ch === 0x60 || // `
            ch === 0x2a || // *
            ch === 0x5f || // _
            ch === 0x5b || // [
            ch === 0x5d || // ]
            ch === 0x21 || // !
            ch === 0x3c || // <
            ch === 0x26 || // &
            this.#pluginTriggerChars.has(ch)
          ) {
            break;
          }
          end++;
        }

        if (end > this.pos) {
          const content = subject.substring(this.pos, end);
          this.pos = end;
          block.appendChild(this.text(content));
          return true;
        }

        return false;
      },
    );
    return (InlineParser.prototype.parseString as Function).apply(this, params);
  }

  // #endregion

  // #region 辅助方法

  /**
   * 创建内容为 s 的文本节点并返回。
   */
  public text(s: string): Node;
  public text(...params: unknown[]): any {
    InlineParser.prototype.text = overload(
      [String],
      function (this: InlineParser, s: string): Node {
        const node = new Node("text");
        node.literal = s;
        return node;
      },
    );
    return (InlineParser.prototype.text as Function).apply(this, params);
  }

  /**
   * 跳过零个或多个空格以及可选的单个换行符（含行首空格）。
   */
  public spnl(): boolean;
  public spnl(...params: unknown[]): any {
    InlineParser.prototype.spnl = overload(
      [],
      function (this: InlineParser): boolean {
        const subject = this.subject;
        let pos = this.pos;

        // 跳过空格
        while (pos < subject.length && subject.charCodeAt(pos) === 0x20) {
          pos++;
        }

        // 可选换行符
        if (pos < subject.length && subject.charCodeAt(pos) === 0x0a) {
          pos++;
          // 跳过换行后的空格
          while (pos < subject.length && subject.charCodeAt(pos) === 0x20) {
            pos++;
          }
        }

        this.pos = pos;
        return true;
      },
    );
    return (InlineParser.prototype.spnl as Function).apply(this, params);
  }

  // #endregion
}

// #endregion

function isAsciiPunct(code: number): boolean {
  return (
    (code >= 0x21 && code <= 0x2f) ||
    (code >= 0x3a && code <= 0x40) ||
    (code >= 0x5b && code <= 0x60) ||
    (code >= 0x7b && code <= 0x7e)
  );
}
