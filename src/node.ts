/**
 * CommonMark 0.31.2 的 AST 节点类型与树结构。
 */

import overload from "@jyostudio/overload";


/**
 * CommonMark 所有节点类型的联合类型
 */
export type NodeType =
  | "document"
  | "block_quote"
  | "list"
  | "item"
  | "paragraph"
  | "heading"
  | "code_block"
  | "html_block"
  | "thematic_break"
  | "text"
  | "softbreak"
  | "linebreak"
  | "emph"
  | "strong"
  | "link"
  | "image"
  | "code"
  | "html_inline";


/**
 * 可包含子节点的容器类型集合
 */
const CONTAINER_TYPES: Set<NodeType> = new Set([
  "document",
  "block_quote",
  "list",
  "item",
  "paragraph",
  "heading",
  "emph",
  "strong",
  "link",
  "image",
]);

export const isContainer = overload(
  [String],
  function (type: string): boolean {
    return CONTAINER_TYPES.has(type as NodeType);
  },
);


/**
 * 列表节点的附加数据，描述列表的类型与样式。
 */
export interface ListData {
  /**
   * 列表类型：无序（bullet）或有序（ordered）
   */
  type: "bullet" | "ordered";

  /**
   * 是否为紧凑列表（列表项之间无空行）
   */
  tight: boolean;

  /**
   * 无序列表标记字符（* + -）
   */
  bulletChar: string;

  /**
   * 有序列表的起始编号
   */
  start: number;

  /**
   * 有序列表分隔符（. 或 )）
   */
  delimiter: string;

  /**
   * 列表项内容相对于标记的缩进量
   */
  padding: number;

  /**
   * 标记相对于列偏移量
   */
  markerOffset: number;
}

/**
 * NodeWalker 每次调用 next() 返回的事件对象。
 */
export interface NodeWalkerEvent {
  /**
   * true 表示进入节点，false 表示离开节点
   */
  entering: boolean;

  /**
   * 当前事件对应的节点
   */
  node: Node;
}

export class NodeWalker {
  /**
   * 当前迭代到的节点
   */
  current: Node | null;


  /**
   * 遍历起始的根节点
   */
  root: Node;


  /**
   * 是否正在进入节点（true 为进入，false 为离开）
   */
  entering: boolean;

  constructor(root: Node) {
    this.current = root;
    this.root = root;
    this.entering = true;
  }

  /**
   * 将遍历游标重置到指定节点和进入方向。
   */
  public resumeAt(node: Node, entering: boolean): void;
  public resumeAt(...params: unknown[]): any {
    NodeWalker.prototype.resumeAt = overload(
      [Node, Boolean],
      function (this: NodeWalker, node, entering) {
        this.current = node;
        this.entering = entering;
      },
    );
    return (NodeWalker.prototype.resumeAt as Function).apply(this, params);
  }

  /**
   * 返回遍历序列中的下一个事件，遍历结束时返回 null。
   */
  public next(): NodeWalkerEvent | null;
  public next(...params: unknown[]): any {
    NodeWalker.prototype.next = overload(
      [],
      function (this: NodeWalker): NodeWalkerEvent | null {
        const cur = this.current;
        const entering = this.entering;

        if (cur === null) {
          return null;
        }

        const container = isContainer(cur.type);

        if (entering && container) {
          if (cur.firstChild) {
            this.current = cur.firstChild;
            this.entering = true;
          } else {
            this.entering = false;
          }
        } else if (cur === this.root) {
          this.current = null;
        } else if (cur.next === null) {
          this.current = cur.parent;
          this.entering = false;
        } else {
          this.current = cur.next;
          this.entering = true;
        }

        return { entering, node: cur };
      },
    );
    return (NodeWalker.prototype.next as Function).apply(this, params);
  }
}

export class Node {
  /**
   * 节点类型
   */
  readonly type: NodeType;


  /**
   * 父节点
   */
  parent: Node | null = null;


  /**
   * 第一个子节点
   */
  firstChild: Node | null = null;


  /**
   * 最后一个子节点
   */
  lastChild: Node | null = null;


  /**
   * 前一个兄弟节点
   */
  prev: Node | null = null;


  /**
   * 后一个兄弟节点
   */
  next: Node | null = null;


  /**
   * 源码位置（行列范围）
   */
  sourcepos: [[number, number], [number, number]] | null = null;

  // 块级状态（解析过程中使用）

  /**
   * 节点是否仍处于打开状态（解析中）
   */
  open = true;


  /**
   * 块解析阶段积累的字符串内容
   */
  stringContent = "";


  /**
   * 最后一行是否为空行
   */
  lastLineBlank = false;


  /**
   * 最后一行是否已检查
   */
  lastLineChecked = false;

  // 叶节点内容

  /**
   * 叶节点的字面量内容
   */
  literal: string | null = null;

  // 链接 / 图片

  /**
   * 链接或图片的目标 URL
   */
  destination: string | null = null;


  /**
   * 链接或图片的标题
   */
  title: string | null = null;

  // 标题

  /**
   * 标题级别（1–6）
   */
  level = 0;

  // 列表

  /**
   * 列表数据
   */
  listData: ListData | null = null;

  // 代码块

  /**
   * 代码块的信息字符串（如语言标记）
   */
  info: string | null = null;


  /**
   * 是否为围栏式代码块
   */
  isFenced = false;


  /**
   * 围栏字符（\` 或 ~）
   */
  fenceChar: string | null = null;


  /**
   * 围栏字符的数量
   */
  fenceLength = 0;


  /**
   * 围栏的缩进偏移
   */
  fenceOffset = 0;

  // HTML 块

  /**
   * HTML 块的类型（1–7）
   */
  htmlBlockType = 0;

  constructor(
    type: NodeType,
    sourcepos?: [[number, number], [number, number]],
  ) {
    this.type = type;
    if (sourcepos) {
      this.sourcepos = sourcepos;
    }
  }

  /**
   * 判断当前节点是否为容器类型（可以包含子节点）。
   */
  public get isContainer(): boolean {
    return isContainer(this.type);
  }

  /**
   * 将 child 追加为当前节点的最后一个子节点。
   */
  public appendChild(child: Node): void;
  public appendChild(...params: unknown[]): any {
    Node.prototype.appendChild = overload(
      [Node],
      function (this: Node, child) {
        child.unlink();
        child.parent = this;
        if (this.lastChild) {
          this.lastChild.next = child;
          child.prev = this.lastChild;
          this.lastChild = child;
        } else {
          this.firstChild = child;
          this.lastChild = child;
        }
      },
    );
    return (Node.prototype.appendChild as Function).apply(this, params);
  }

  /**
   * 将 child 插入为当前节点的第一个子节点。
   */
  public prependChild(child: Node): void;
  public prependChild(...params: unknown[]): any {
    Node.prototype.prependChild = overload(
      [Node],
      function (this: Node, child) {
        child.unlink();
        child.parent = this;
        if (this.firstChild) {
          this.firstChild.prev = child;
          child.next = this.firstChild;
          this.firstChild = child;
        } else {
          this.firstChild = child;
          this.lastChild = child;
        }
      },
    );
    return (Node.prototype.prependChild as Function).apply(this, params);
  }

  /**
   * 将当前节点从树中断开，清空父节点和兄弟节点引用。
   */
  public unlink(): void;
  public unlink(...params: unknown[]): any {
    Node.prototype.unlink = overload(
      [],
      function (this: Node) {
        if (this.prev) {
          this.prev.next = this.next;
        } else if (this.parent) {
          this.parent.firstChild = this.next;
        }
        if (this.next) {
          this.next.prev = this.prev;
        } else if (this.parent) {
          this.parent.lastChild = this.prev;
        }
        this.parent = null;
        this.next = null;
        this.prev = null;
      },
    );
    return (Node.prototype.unlink as Function).apply(this, params);
  }

  /**
   * 在当前节点之后插入 sibling 作为下一个兄弟节点。
   */
  public insertAfter(sibling: Node): void;
  public insertAfter(...params: unknown[]): any {
    Node.prototype.insertAfter = overload(
      [Node],
      function (this: Node, sibling) {
        sibling.unlink();
        sibling.next = this.next;
        if (sibling.next) {
          sibling.next.prev = sibling;
        }
        sibling.prev = this;
        this.next = sibling;
        sibling.parent = this.parent;
        if (!sibling.next && sibling.parent) {
          sibling.parent.lastChild = sibling;
        }
      },
    );
    return (Node.prototype.insertAfter as Function).apply(this, params);
  }

  /**
   * 在当前节点之前插入 sibling 作为上一个兄弟节点。
   */
  public insertBefore(sibling: Node): void;
  public insertBefore(...params: unknown[]): any {
    Node.prototype.insertBefore = overload(
      [Node],
      function (this: Node, sibling) {
        sibling.unlink();
        sibling.prev = this.prev;
        if (sibling.prev) {
          sibling.prev.next = sibling;
        }
        sibling.next = this;
        this.prev = sibling;
        sibling.parent = this.parent;
        if (!sibling.prev && sibling.parent) {
          sibling.parent.firstChild = sibling;
        }
      },
    );
    return (Node.prototype.insertBefore as Function).apply(this, params);
  }

  /**
   * 创建并返回以当前节点为根的 NodeWalker 遍历器。
   */
  public walker(): NodeWalker;
  public walker(...params: unknown[]): any {
    Node.prototype.walker = overload(
      [],
      function (this: Node): NodeWalker {
        return new NodeWalker(this);
      },
    );
    return (Node.prototype.walker as Function).apply(this, params);
  }
}
