/**
 * CommonMark 0.31.2 的块级解析器。
 *
 * 实现两阶段解析算法：
 *   第一阶段：构建块结构（本文件）
 *   第二阶段：解析行内内容（inline-parser.ts）
 */
import { Node, type ListData, type NodeType } from "./node";
import { type RefMap } from "./common";
import { InlineParser } from "./inline-parser";
export declare class BlockParser {
    /**
     * 文档根节点
     */
    doc: Node;
    /**
     * 当前最内层打开块节点（解析末端）
     */
    tip: Node;
    /**
     * 处理当前行前的末端节点
     */
    oldtip: Node;
    /**
     * 最后一个与当前行匹配的容器节点
     */
    lastMatchedContainer: Node;
    /**
     * 当前正在处理的行
     */
    currentLine: string;
    /**
     * 当前行号（从 1 开始）
     */
    lineNumber: number;
    /**
     * 当前行的字符偏移量
     */
    offset: number;
    /**
     * 当前列号（制表符已展开）
     */
    column: number;
    /**
     * 下一个非空白字符的偏移量
     */
    nextNonspace: number;
    /**
     * 下一个非空白字符的列号
     */
    nextNonspaceColumn: number;
    /**
     * 当前块的缩进级别
     */
    indent: number;
    /**
     * 当前行是否满足缩进代码块条件（≥4 空格）
     */
    indented: boolean;
    /**
     * 当前行是否为空行
     */
    blank: boolean;
    /**
     * 上一次 advanceOffset 是否部分消耗了制表符
     */
    partiallyConsumedTab: boolean;
    /**
     * 所有未匹配的打开块是否已终结
     */
    allClosed: boolean;
    /**
     * 上一行的字符长度
     */
    lastLineLength: number;
    /**
     * 链接引用定义映射表
     */
    refmap: RefMap;
    /**
     * 行内解析器实例
     */
    inlineParser: InlineParser;
    constructor();
    /**
     * 解析 Markdown 字符串，构建并返回 AST 文档根节点。
     */
    parse(input: string): Node;
    /**
     * 处理单行输入，更新块级树结构。
     */
    processLine(line: string): void;
    /**
     * 检查容器块是否可延续当前行。
     * 返回 0 表示继续，1 表示中断，2 表示行已被消耗。
     */
    blockContinue(container: Node): number;
    /**
     * 在当前位置尝试开始新的块结构。
     * 返回 0 表示无匹配，1 表示容器块已创建，2 表示叶子块已创建。
     */
    tryBlockStart(container: Node): number;
    /**
     * 判断节点类型是否接受行内容（段落、代码块、HTML 块）。
     */
    acceptsLines(type: NodeType): boolean;
    /**
     * 尝试在当前行解析列表标记，成功时返回列表数据，否则返回 null。
     */
    parseListMarker(tipNode: Node): ListData | null;
    /**
     * 根据列表数据向树中插入列表节点与列表项节点。
     */
    addListItem(listData: ListData): void;
    /**
     * 判断两组列表数据是否属于同一类型（类型、分隔符、标记字符相同）。
     */
    listsMatch(a: ListData, b: ListData): boolean;
    /**
     * 向当前 tip 节点追加指定类型的子节点，并将 tip 更新为新节点。
     */
    addChild(type: NodeType, offset: number): Node;
    /**
     * 判断父节点类型是否允许包含指定子节点类型。
     */
    canContain(parentType: NodeType, childType: NodeType): boolean;
    /**
     * 将当前行的剩余内容追加到 tip 节点的 stringContent 中。
     */
    addLine(): void;
    /**
     * 关闭所有未能与当前行匹配的打开块节点。
     */
    closeUnmatchedBlocks(): void;
    /**
     * 终结指定块节点：关闭节点、设置源码位置并执行后处理逻辑。
     */
    finalize(block: Node, lineNumber: number): void;
    /**
     * 终结段落节点：提取链接引用定义，若段落为空则从树中移除。
     */
    finalizeParagraph(block: Node): void;
    /**
     * 终结代码块节点：提取代码内容到 literal，并清空 stringContent。
     */
    finalizeCodeBlock(block: Node): void;
    /**
     * 终结列表节点：根据各列表项末尾是否为空行判断是否为紧凑列表。
     */
    finalizeList(block: Node): void;
    /**
     * 检查给定块节点（含嵌套列表末端）是否以空行结尾。
     */
    endsWithBlankLine(block: Node): boolean;
    /**
     * 从字符串开头尝试解析链接引用定义，成功时返回剩余字符串，否则返回 null。
     */
    parseLinkRefDef(s: string): string | null;
    /**
     * 从字符串的指定位置解析链接目标地址，失败返回 null。
     */
    parseLinkDestination(s: string, pos: number): {
        destination: string;
        pos: number;
    } | null;
    /**
     * 从字符串的指定位置解析链接标题，失败返回 null。
     */
    parseLinkTitle(s: string, pos: number): {
        title: string;
        pos: number;
    } | null;
    /**
     * 遍历 AST，对所有段落和标题节点执行行内元素解析。
     */
    processInlines(block: Node): void;
    /**
     * 扫描当前行，定位下一个非空白字符并更新相关状态字段。
     */
    findNextNonspace(): void;
    /**
     * 按字符数或列数推进当前行的解析偏移量。
     */
    advanceOffset(count: number, columns: boolean): void;
}
//# sourceMappingURL=block-parser.d.ts.map