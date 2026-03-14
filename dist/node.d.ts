/**
 * CommonMark 0.31.2 的 AST 节点类型与树结构。
 */
/**
 * CommonMark 所有节点类型的联合类型
 */
export type NodeType = "document" | "block_quote" | "list" | "item" | "paragraph" | "heading" | "code_block" | "html_block" | "thematic_break" | "text" | "softbreak" | "linebreak" | "emph" | "strong" | "link" | "image" | "code" | "html_inline";
export declare const isContainer: import("@jyostudio/overload").OverloadBuilder<[(args_0: string) => boolean]>;
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
export declare class NodeWalker {
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
    constructor(root: Node);
    /**
     * 将遍历游标重置到指定节点和进入方向。
     */
    resumeAt(node: Node, entering: boolean): void;
    /**
     * 返回遍历序列中的下一个事件，遍历结束时返回 null。
     */
    next(): NodeWalkerEvent | null;
}
export declare class Node {
    /**
     * 节点类型
     */
    readonly type: NodeType;
    /**
     * 父节点
     */
    parent: Node | null;
    /**
     * 第一个子节点
     */
    firstChild: Node | null;
    /**
     * 最后一个子节点
     */
    lastChild: Node | null;
    /**
     * 前一个兄弟节点
     */
    prev: Node | null;
    /**
     * 后一个兄弟节点
     */
    next: Node | null;
    /**
     * 源码位置（行列范围）
     */
    sourcepos: [[number, number], [number, number]] | null;
    /**
     * 节点是否仍处于打开状态（解析中）
     */
    open: boolean;
    /**
     * 块解析阶段积累的字符串内容
     */
    stringContent: string;
    /**
     * 最后一行是否为空行
     */
    lastLineBlank: boolean;
    /**
     * 最后一行是否已检查
     */
    lastLineChecked: boolean;
    /**
     * 叶节点的字面量内容
     */
    literal: string | null;
    /**
     * 链接或图片的目标 URL
     */
    destination: string | null;
    /**
     * 链接或图片的标题
     */
    title: string | null;
    /**
     * 标题级别（1–6）
     */
    level: number;
    /**
     * 列表数据
     */
    listData: ListData | null;
    /**
     * 代码块的信息字符串（如语言标记）
     */
    info: string | null;
    /**
     * 是否为围栏式代码块
     */
    isFenced: boolean;
    /**
     * 围栏字符（\` 或 ~）
     */
    fenceChar: string | null;
    /**
     * 围栏字符的数量
     */
    fenceLength: number;
    /**
     * 围栏的缩进偏移
     */
    fenceOffset: number;
    /**
     * HTML 块的类型（1–7）
     */
    htmlBlockType: number;
    constructor(type: NodeType, sourcepos?: [[number, number], [number, number]]);
    /**
     * 判断当前节点是否为容器类型（可以包含子节点）。
     */
    get isContainer(): boolean;
    /**
     * 将 child 追加为当前节点的最后一个子节点。
     */
    appendChild(child: Node): void;
    /**
     * 将 child 插入为当前节点的第一个子节点。
     */
    prependChild(child: Node): void;
    /**
     * 将当前节点从树中断开，清空父节点和兄弟节点引用。
     */
    unlink(): void;
    /**
     * 在当前节点之后插入 sibling 作为下一个兄弟节点。
     */
    insertAfter(sibling: Node): void;
    /**
     * 在当前节点之前插入 sibling 作为上一个兄弟节点。
     */
    insertBefore(sibling: Node): void;
    /**
     * 创建并返回以当前节点为根的 NodeWalker 遍历器。
     */
    walker(): NodeWalker;
}
//# sourceMappingURL=node.d.ts.map