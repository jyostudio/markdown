/**
 * CommonMark 解析与渲染的通用工具。
 */
/**
 * 链接引用定义映射表。
 *
 * 键为规范化后的链接标签（小写、折叠空白），值为对应的链接目标与标题。
 */
export interface RefMap {
    /**
     * 规范化后的链接标签（小写、折叠空白）→ 链接目标与标题
     */
    [label: string]: {
        /**
         * 链接目标 URL
         */
        destination: string;
        /**
         * 链接标题
         */
        title: string;
    };
}
/**
 * 可转义字符正则（无锚点，用于单字符测试）
 */
declare const ESCAPABLE_RE: RegExp;
/**
 * 可转义字符正则（锚定行首，用于前缀匹配）
 */
declare const reEscapable: RegExp;
/**
 * HTML 实体正则（锚定行首，用于识别实体引用）
 */
declare const reEntityHere: RegExp;
/**
 * 匹配反斜杠转义字符或 HTML 实体（用于全局替换）
 */
declare const reEntityOrEscapedChar: RegExp;
/**
 * HTML 开放标签模式字符串
 */
export declare const OPENTAG = "<[A-Za-z][A-Za-z0-9-]*(?:\\s+[a-zA-Z_:][a-zA-Z0-9_.:-]*(?:\\s*=\\s*(?:[^\"'=<>`\\x00-\\x20]+|'[^']*'|\"[^\"]*\"))?)*\\s*/?>";
/**
 * HTML 关闭标签模式字符串
 */
export declare const CLOSETAG = "</[A-Za-z][A-Za-z0-9-]*\\s*>";
declare const reHtmlTag: RegExp;
export { reHtmlTag, reEntityHere, ESCAPABLE_RE as reEscapable_single };
/**
 * 将反斜杠转义和 HTML 实体替换为对应字符
 */
export declare const unescapeString: import("@jyostudio/overload").OverloadBuilder<[(args_0: string) => string]>;
/**
 * 转义 XML 特殊字符以用于 HTML 输出
 */
export declare const escapeXml: import("@jyostudio/overload").OverloadBuilder<[(args_0: string) => string]>;
/**
 * 规范化 URL：对需要的字符进行百分号编码，
 * 保留已有的合法百分号编码序列。
 */
export declare const normalizeURI: import("@jyostudio/overload").OverloadBuilder<[(args_0: string) => string]>;
/**
 * 规范化链接标签：去除外层方括号，折叠空白，转换为小写。
 */
export declare const normalizeReference: import("@jyostudio/overload").OverloadBuilder<[(args_0: string) => string]>;
export declare const isUnicodePunctuation: import("@jyostudio/overload").OverloadBuilder<[(args_0: number) => boolean]>;
export declare const isUnicodeWhitespace: import("@jyostudio/overload").OverloadBuilder<[(args_0: number) => boolean]>;
export declare const isBlank: import("@jyostudio/overload").OverloadBuilder<[(args_0: string) => boolean]>;
export declare const isSpaceOrTab: import("@jyostudio/overload").OverloadBuilder<[(args_0: number) => boolean]>;
export declare const peek: import("@jyostudio/overload").OverloadBuilder<[(args_0: string, args_1: number) => number]>;
/**
 * 展开行中的制表符。CommonMark 规定制表符展开到
 * 下一个制表位（每 4 列）。
 */
export declare const detab: import("@jyostudio/overload").OverloadBuilder<[(args_0: string) => string]>;
/**
 * ATX 标题识别正则（1–6 个 # 号）
 */
declare const reATXHeading: RegExp;
/**
 * Setext 标题下划线行正则（= 或 -）
 */
declare const reSetextHeadingLine: RegExp;
/**
 * 分隔线识别正则（* - _ 各自三个及以上）
 */
declare const reThematicBreak: RegExp;
/**
 * 围栏式代码块开始行正则（无语言标记的纯围栏行）
 */
declare const reFencedCodeStart: RegExp;
/**
 * 围栏式代码块开始行正则（含语言信息字符串）
 */
declare const reFencedCodeStartFull: RegExp;
/**
 * 围栏标记正则（至少三个 ` 或 ~）
 */
declare const reCodeFence: RegExp;
/**
 * 围栏式代码块关闭行正则
 */
declare const reClosingCodeFence: RegExp;
/**
 * 无序列表标记正则（* + -）
 */
declare const reBulletListMarker: RegExp;
/**
 * 有序列表标记正则（1–9 位数字加 . 或 )）
 */
declare const reOrderedListMarker: RegExp;
export { reATXHeading, reSetextHeadingLine, reThematicBreak, reFencedCodeStart, reFencedCodeStartFull, reCodeFence, reClosingCodeFence, reBulletListMarker, reOrderedListMarker, reEscapable, reEntityOrEscapedChar, };
/**
 * 第 1 类 HTML 块开始正则（pre / script / style / textarea）
 */
declare const reHtmlBlockOpen1: RegExp;
/**
 * 第 1 类 HTML 块结束正则
 */
declare const reHtmlBlockClose1: RegExp;
/**
 * 第 2 类 HTML 块开始正则（HTML 注释 <!-- ... -->）
 */
declare const reHtmlBlockOpen2: RegExp;
/**
 * 第 2 类 HTML 块结束正则
 */
declare const reHtmlBlockClose2: RegExp;
/**
 * 第 3 类 HTML 块开始正则（处理指令 <? ... ?>）
 */
declare const reHtmlBlockOpen3: RegExp;
/**
 * 第 3 类 HTML 块结束正则
 */
declare const reHtmlBlockClose3: RegExp;
/**
 * 第 4 类 HTML 块开始正则（声明 <!...>）
 */
declare const reHtmlBlockOpen4: RegExp;
/**
 * 第 4 类 HTML 块结束正则
 */
declare const reHtmlBlockClose4: RegExp;
/**
 * 第 5 类 HTML 块开始正则（CDATA 段 <![CDATA[...]]>）
 */
declare const reHtmlBlockOpen5: RegExp;
/**
 * 第 5 类 HTML 块结束正则
 */
declare const reHtmlBlockClose5: RegExp;
/**
 * CommonMark 规定的块级 HTML 标签名集合（用于识别第 6 类 HTML 块）
 */
declare const blockTagNames: Set<string>;
/**
 * 第 6 类 HTML 块开始正则（块级标签）
 */
declare const reHtmlBlockOpen6: RegExp;
/**
 * 第 7 类 HTML 块开始正则（单独一行的完整开放或关闭标签）
 */
declare const reHtmlBlockOpen7: RegExp;
export { reHtmlBlockOpen1, reHtmlBlockClose1, reHtmlBlockOpen2, reHtmlBlockClose2, reHtmlBlockOpen3, reHtmlBlockClose3, reHtmlBlockOpen4, reHtmlBlockClose4, reHtmlBlockOpen5, reHtmlBlockClose5, reHtmlBlockOpen6, reHtmlBlockOpen7, blockTagNames, };
//# sourceMappingURL=common.d.ts.map