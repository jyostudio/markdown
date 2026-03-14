/**
 * CommonMark 0.31.2 的行内级解析器。
 *
 * 处理：代码跨度、强调/加粗、链接、图片、自动链接、
 * 原始 HTML、硬/软换行、反斜杠转义、实体、文本。
 */
import { Node } from "./node";
import type { RefMap } from "./common";
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
export declare class InlineParser {
    /**
     * 当前正在解析的字符串内容
     */
    subject: string;
    /**
     * 当前解析位置（字符索引）
     */
    pos: number;
    /**
     * 分隔符链表头（用于强调/加粗处理）
     */
    delimiters: Delimiter | null;
    /**
     * 括号链表头（用于链接/图片处理）
     */
    brackets: Bracket | null;
    /**
     * 链接引用定义映射表
     */
    refmap: RefMap;
    /**
     * 解析块节点的 stringContent，将行内元素作为子节点追加，并执行强调后处理。
     */
    parse(block: Node, refmap: RefMap): void;
    /**
     * 返回当前位置字符的码点；到达字符串末尾则返回 -1。
     */
    peek(): number;
    /**
     * 识别并解析当前位置的单个行内元素，追加到块节点，返回是否解析成功。
     */
    parseInline(block: Node): boolean;
    /**
     * 解析换行符，根据前置内容生成软换行或硬换行节点。
     */
    parseNewline(block: Node): boolean;
    /**
     * 解析反斜杠转义序列或反斜杠硬换行。
     */
    parseBackslash(block: Node): boolean;
    /**
     * 解析反引号代码跨度（code span）。
     */
    parseBackticks(block: Node): boolean;
    /**
     * 处理强调/加粗分隔符（* 或 _），向分隔符链表注册节点。
     */
    handleDelim(cc: number, block: Node): boolean;
    /**
     * 扫描连续的分隔符数量，并判断其左/右侧翼合法性。
     */
    scanDelims(cc: number): {
        numdelims: number;
        canOpen: boolean;
        canClose: boolean;
    } | null;
    /**
     * 对分隔符链表执行强调匹配算法，生成 emph / strong 节点。
     */
    processEmphasis(stackBottom: Delimiter | null): void;
    /**
     * 将指定节点从分隔符链表中移除。
     */
    removeDelimiter(delim: Delimiter): void;
    /**
     * 解析左方括号 [，向括号链表注册当前位置。
     */
    parseOpenBracket(block: Node): boolean;
    /**
     * 解析感叹号 !，若紧跟 [ 则作为图片前缀处理。
     */
    parseBang(block: Node): boolean;
    /**
     * 在括号链表头部插入新的括号节点。
     */
    addBracket(node: Node, index: number, image: boolean): void;
    /**
     * 移除括号链表的头节点（最近一个未闭合的括号）。
     */
    removeBracket(): void;
    /**
     * 解析右方括号 ]，尝试组合链接或图片节点。
     */
    parseCloseBracket(block: Node): boolean;
    /**
     * 从当前位置解析行内链接目标地址，失败返回 null。
     */
    parseLinkDestination(): string | null;
    /**
     * 从当前位置解析行内链接标题，失败返回 null。
     */
    parseLinkTitle(): string | null;
    /**
     * 从当前位置解析链接标签（方括号内容），失败返回 null。
     */
    parseLinkLabel(): string | null;
    /**
     * 解析尖括号形式的 URL 或邮件地址自动链接。
     */
    parseAutolink(block: Node): boolean;
    /**
     * 解析行内 HTML 标签。
     */
    parseHtmlTag(block: Node): boolean;
    /**
     * 解析 HTML 字符实体引用（如 &amp;、&#123; 等）。
     */
    parseEntity(block: Node): boolean;
    /**
     * 解析普通文本内容，合并连续的非特殊字符。
     */
    parseString(block: Node): boolean;
    /**
     * 创建内容为 s 的文本节点并返回。
     */
    text(s: string): Node;
    /**
     * 跳过零个或多个空格以及可选的单个换行符（含行首空格）。
     */
    spnl(): boolean;
}
export {};
//# sourceMappingURL=inline-parser.d.ts.map