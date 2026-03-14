/**
 * CommonMark 解析与渲染的通用工具。
 */

import overload from "@jyostudio/overload";
import { ENTITIES } from "./entities";


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

// #region 字符分类

/**
 * 反斜杠字符的码点
 */
const C_BACKSLASH = 0x5c;


/**
 * 可转义字符正则（无锚点，用于单字符测试）
 */
const ESCAPABLE_RE = /[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]/;


/**
 * 可转义字符正则（锚定行首，用于前缀匹配）
 */
const reEscapable = /^[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]/;


/**
 * HTML 实体正则（锚定行首，用于识别实体引用）
 */
const reEntityHere =
  /^&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{0,31});/i;


/**
 * 匹配反斜杠转义字符或 HTML 实体（用于全局替换）
 */
const reEntityOrEscapedChar =
  /\\[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]|&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{0,31});/gi;


/**
 * HTML 标签名模式（字母开头，后续可含字母、数字、连字符）
 */
const TAGNAME = "[A-Za-z][A-Za-z0-9-]*";
/**
 * HTML 属性名模式
 */
const ATTRIBUTENAME = "[a-zA-Z_:][a-zA-Z0-9_.:-]*";
/**
 * 未引用属性值模式（不含特殊字符及空白）
 */
const UNQUOTEDVALUE = "[^\"'=<>`\\x00-\\x20]+";
/**
 * 单引号属性值模式
 */
const SINGLEQUOTEDVALUE = "'[^']*'";
/**
 * 双引号属性值模式
 */
const DOUBLEQUOTEDVALUE = '"[^"]*"';
/**
 * 属性值模式（三种引用形式的联合）
 */
const ATTRIBUTEVALUE = `(?:${UNQUOTEDVALUE}|${SINGLEQUOTEDVALUE}|${DOUBLEQUOTEDVALUE})`;
/**
 * 属性值规格模式（= 号加属性值）
 */
const ATTRIBUTEVALUESPEC = `(?:\\s*=\\s*${ATTRIBUTEVALUE})`;
/**
 * 单个 HTML 属性模式（属性名及可选属性值）
 */
const ATTRIBUTE = `(?:\\s+${ATTRIBUTENAME}${ATTRIBUTEVALUESPEC}?)`;
/**
 * HTML 开放标签模式字符串
 */
export const OPENTAG = `<${TAGNAME}${ATTRIBUTE}*\\s*/?>`;
/**
 * HTML 关闭标签模式字符串
 */
export const CLOSETAG = `</${TAGNAME}\\s*>`;

const reHtmlTag = new RegExp(
  `^(?:` +
    `${OPENTAG}|` +
    `${CLOSETAG}|` +
    `<!---->|<!--(?:-?[^>-])(?:-?[^-])*-->|` +
    `<[?][\\s\\S]*?[?]>|` +
    `<![A-Za-z]+[^>]*>|` +
    `<!\\[CDATA\\[[\\s\\S]*?\\]\\]>` +
    `)`,
);

export { reHtmlTag, reEntityHere, ESCAPABLE_RE as reEscapable_single };

// #endregion

// #region 实体解码

function decodeEntity(s: string): string {
  const inner = s.substring(1, s.length - 1); // 去除 & 和 ;
  if (inner.charCodeAt(0) === 0x23 /* # */) {
    if (inner.charCodeAt(1) === 0x78 || inner.charCodeAt(1) === 0x58) {
      // 十六进制
      const code = parseInt(inner.substring(2), 16);
      if (isNaN(code) || code === 0) return "\uFFFD";
      if (code > 0x10ffff) return "\uFFFD";
      return String.fromCodePoint(code);
    } else {
      // 十进制
      const code = parseInt(inner.substring(1), 10);
      if (isNaN(code) || code === 0) return "\uFFFD";
      if (code > 0x10ffff) return "\uFFFD";
      return String.fromCodePoint(code);
    }
  } else {
    return ENTITIES[inner] ?? s;
  }
}

// #endregion

// #region 字符串工具

/**
 * 将反斜杠转义和 HTML 实体替换为对应字符
 */
export const unescapeString = overload(
  [String],
  function (s: string): string {
    if (!s.includes("\\") && !s.includes("&")) return s;
    return s.replace(reEntityOrEscapedChar, (m) => {
      if (m.charCodeAt(0) === C_BACKSLASH) {
        return m.charAt(1);
      } else {
        return decodeEntity(m);
      }
    });
  },
);


/**
 * 转义 XML 特殊字符以用于 HTML 输出
 */
export const escapeXml = overload(
  [String],
  function (s: string): string {
    if (!/[&<>"]/.test(s)) return s;
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
);


/**
 * 规范化 URL：对需要的字符进行百分号编码，
 * 保留已有的合法百分号编码序列。
 */
export const normalizeURI = overload(
  [String],
  function (uri: string): string {
    try {
      return uri.replace(/%[0-9a-fA-F]{2}|[^!#$&-;=?-Z_a-z~]/g, (m) => {
        if (m.charAt(0) === "%" && m.length === 3) return m;
        return encodeURIComponent(m);
      });
    } catch {
      return uri;
    }
  },
);


/**
 * 规范化链接标签：去除外层方括号，折叠空白，转换为小写。
 */
export const normalizeReference = overload(
  [String],
  function (s: string): string {
    return s
      .slice(1, -1)
      .trim()
      .replace(/[ \t\r\n]+/g, " ")
      .toLowerCase()
      .replace(/\u00DF/g, "ss");
  },
);

// #endregion

// #region Unicode 分类

const rePunctuation = /\p{P}|\p{S}/u;
const reUnicodeWhitespaceChar = /\p{Zs}/u;

export const isUnicodePunctuation = overload(
  [Number],
  function (code: number): boolean {
    if (
      (code >= 0x21 && code <= 0x2f) ||
      (code >= 0x3a && code <= 0x40) ||
      (code >= 0x5b && code <= 0x60) ||
      (code >= 0x7b && code <= 0x7e)
    ) {
      return true;
    }
    if (code < 0x80) return false;
    return rePunctuation.test(String.fromCodePoint(code));
  },
);

export const isUnicodeWhitespace = overload(
  [Number],
  function (code: number): boolean {
    if (
      code === 0x20 ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0c ||
      code === 0x0d
    ) {
      return true;
    }
    if (code < 0x80) return false;
    return reUnicodeWhitespaceChar.test(String.fromCodePoint(code));
  },
);

// #endregion

// #region 块解析辅助工具

export const isBlank = overload(
  [String],
  function (s: string): boolean {
    return /^[ \t]*$/.test(s);
  },
);

export const isSpaceOrTab = overload(
  [Number],
  function (code: number): boolean {
    return code === 0x20 || code === 0x09;
  },
);

export const peek = overload(
  [String, Number],
  function (s: string, pos: number): number {
    return pos < s.length ? s.charCodeAt(pos) : -1;
  },
);


/**
 * 展开行中的制表符。CommonMark 规定制表符展开到
 * 下一个制表位（每 4 列）。
 */
export const detab = overload(
  [String],
  function (s: string): string {
    if (!s.includes("\t")) return s;
    let col = 0;
    let result = "";
    for (let i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) === 0x09) {
        const spaces = 4 - (col % 4);
        result += " ".repeat(spaces);
        col += spaces;
      } else {
        result += s.charAt(i);
        col++;
      }
    }
    return result;
  },
);

// #endregion

// #region 块解析正则表达式

/**
 * ATX 标题识别正则（1–6 个 # 号）
 */
const reATXHeading = /^#{1,6}(?:[ \t]+|$)/;
/**
 * Setext 标题下划线行正则（= 或 -）
 */
const reSetextHeadingLine = /^(?:=+|-+)[ \t]*$/;
/**
 * 分隔线识别正则（* - _ 各自三个及以上）
 */
const reThematicBreak =
  /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})[ \t]*$/;
/**
 * 围栏式代码块开始行正则（无语言标记的纯围栏行）
 */
const reFencedCodeStart = /^(`{3,}(?!.*`)|~{3,})[^\S\n]*$/;
/**
 * 围栏式代码块开始行正则（含语言信息字符串）
 */
const reFencedCodeStartFull = /^(`{3,}|~{3,})(.*)$/;
/**
 * 围栏标记正则（至少三个 ` 或 ~）
 */
const reCodeFence = /^`{3,}|^~{3,}/;
/**
 * 围栏式代码块关闭行正则
 */
const reClosingCodeFence = /^(?:`{3,}|~{3,})(?:\s*)$/;
/**
 * 无序列表标记正则（* + -）
 */
const reBulletListMarker = /^[*+\-]/;
/**
 * 有序列表标记正则（1–9 位数字加 . 或 )）
 */
const reOrderedListMarker = /^(\d{1,9})([.)])/;

export {
  reATXHeading,
  reSetextHeadingLine,
  reThematicBreak,
  reFencedCodeStart,
  reFencedCodeStartFull,
  reCodeFence,
  reClosingCodeFence,
  reBulletListMarker,
  reOrderedListMarker,
  reEscapable,
  reEntityOrEscapedChar,
};

// #endregion

// #region HTML 块模式

/**
 * 第 1 类 HTML 块开始正则（pre / script / style / textarea）
 */
const reHtmlBlockOpen1 = /^<(?:pre|script|style|textarea)(?:\s|>|$)/i;
/**
 * 第 1 类 HTML 块结束正则
 */
const reHtmlBlockClose1 = /<\/(?:pre|script|style|textarea)>/i;


/**
 * 第 2 类 HTML 块开始正则（HTML 注释 <!-- ... -->）
 */
const reHtmlBlockOpen2 = /^<!-{2}/;
/**
 * 第 2 类 HTML 块结束正则
 */
const reHtmlBlockClose2 = /-->/;


/**
 * 第 3 类 HTML 块开始正则（处理指令 <? ... ?>）
 */
const reHtmlBlockOpen3 = /^<[?]/;
/**
 * 第 3 类 HTML 块结束正则
 */
const reHtmlBlockClose3 = /\?>/;


/**
 * 第 4 类 HTML 块开始正则（声明 <!...>）
 */
const reHtmlBlockOpen4 = /^<![A-Za-z]/;
/**
 * 第 4 类 HTML 块结束正则
 */
const reHtmlBlockClose4 = />/;


/**
 * 第 5 类 HTML 块开始正则（CDATA 段 <![CDATA[...]]>）
 */
const reHtmlBlockOpen5 = /^<!\[CDATA\[/;
/**
 * 第 5 类 HTML 块结束正则
 */
const reHtmlBlockClose5 = /\]\]>/;


/**
 * CommonMark 规定的块级 HTML 标签名集合（用于识别第 6 类 HTML 块）
 */
const blockTagNames = new Set([
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul",
]);


/**
 * 第 6 类 HTML 块开始正则（块级标签）
 */
const reHtmlBlockOpen6 = new RegExp(
  `^</?(?:${[...blockTagNames].join("|")})(?:[\\s/>]|$)`,
  "i",
);


/**
 * 第 7 类 HTML 块开始正则（单独一行的完整开放或关闭标签）
 */
const reHtmlBlockOpen7 = new RegExp(`^(?:${OPENTAG}|${CLOSETAG})\\s*$`);

export {
  reHtmlBlockOpen1,
  reHtmlBlockClose1,
  reHtmlBlockOpen2,
  reHtmlBlockClose2,
  reHtmlBlockOpen3,
  reHtmlBlockClose3,
  reHtmlBlockOpen4,
  reHtmlBlockClose4,
  reHtmlBlockOpen5,
  reHtmlBlockClose5,
  reHtmlBlockOpen6,
  reHtmlBlockOpen7,
  blockTagNames,
};

// #endregion
