/**
 * esbuild 插件：压缩模板字符串中的 CSS、HTML 和 JS
 * 处理 /* css *\/``、/* html *\/`` 和 /* js *\/`` 标记的模板字符串
 */

import * as esbuild from 'esbuild';
import { minify as minifyHTMLTerser } from 'html-minifier-terser';

/**
 * 使用 esbuild 压缩 CSS 字符串
 * @param {string} css 
 * @returns {Promise<string>}
 */
async function minifyCSS(css) {
    try {
        const result = await esbuild.transform(css, {
            minify: true,
            loader: 'css',
        });
        return result.code.trim();
    } catch (error) {
        console.warn('CSS minification failed, returning original:', error.message);
        return css;
    }
}

/**
 * 使用 html-minifier-terser 压缩 HTML 字符串
 * @param {string} html 
 * @returns {Promise<string>}
 */
async function minifyHTML(html) {
    try {
        const result = await minifyHTMLTerser(html, {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeEmptyAttributes: true,
            minifyCSS: true,
            minifyJS: true,
        });
        return result.trim();
    } catch (error) {
        console.warn('HTML minification failed, returning original:', error.message);
        return html;
    }
}

/**
 * 使用 esbuild 压缩 JavaScript 字符串
 * @param {string} js 
 * @returns {Promise<string>}
 */
async function minifyJS(js) {
    try {
        const result = await esbuild.transform(js, {
            minify: true,
            loader: 'js',
            target: 'esnext',
        });
        // 移除末尾的换行符
        return result.code.trim();
    } catch (error) {
        console.warn('JS minification failed, returning original:', error.message);
        return js;
    }
}

/**
 * 处理模板字符串中的表达式占位符（异步版本）
 * 在压缩前保护 ${...} 表达式，压缩后恢复
 * @param {string} content
 * @param {(s: string) => Promise<string>} minifyFn
 * @param {string} placeholderWrapper - 占位符包装格式，用于不同类型的内容
 * @returns {Promise<string>}
 */
async function processTemplateWithExpressionsAsync(content, minifyFn, placeholderWrapper = '__PLACEHOLDER_%d__') {
    const placeholders = [];
    // 保护 ${...} 表达式
    const protectedContent = content.replace(/\$\{[^}]+\}/g, (match) => {
        placeholders.push(match);
        const placeholder = placeholderWrapper.replace('%d', String(placeholders.length - 1));
        return placeholder;
    });

    // 执行压缩
    const minified = await minifyFn(protectedContent);

    // 恢复表达式
    const placeholderRegex = new RegExp(placeholderWrapper.replace('%d', '(\\d+)'), 'g');
    return minified.replace(placeholderRegex, (_, index) => {
        return placeholders[parseInt(index)];
    });
}

/**
 * 创建压缩模板字符串的 esbuild 插件
 * @returns {import('esbuild').Plugin}
 */
export function minifyTemplatesPlugin() {
    return {
        name: 'minify-templates',
        setup(build) {
            build.onLoad({ filter: /\.(js|ts|mjs|mts)$/ }, async (args) => {
                const fs = await import('fs');
                const path = await import('path');

                let contents = await fs.promises.readFile(args.path, 'utf8');
                let modified = false;

                // 匹配 /* css */`...` 或 /* css */ `...`
                // 支持模板字符串中的表达式 ${...}
                const cssMatches = [...contents.matchAll(/\/\*\s*css\s*\*\/\s*`([\s\S]*?)`/g)];
                for (const match of cssMatches) {
                    const [fullMatch, cssContent] = match;
                    const minified = await processTemplateWithExpressionsAsync(cssContent, minifyCSS, '__CSS_PH_%d__');
                    contents = contents.replace(fullMatch, `/* css */\`${minified}\``);
                    modified = true;
                }

                // 匹配 /* html */`...` 或 /* html */ `...`
                const htmlMatches = [...contents.matchAll(/\/\*\s*html\s*\*\/\s*`([\s\S]*?)`/g)];
                for (const match of htmlMatches) {
                    const [fullMatch, htmlContent] = match;
                    const minified = await processTemplateWithExpressionsAsync(htmlContent, minifyHTML, '__HTML_PH_%d__');
                    contents = contents.replace(fullMatch, `/* html */\`${minified}\``);
                    modified = true;
                }

                // 匹配 /* js */`...` 或 /* js */ `...`
                // 使用 esbuild 进行压缩
                const jsMatches = [...contents.matchAll(/\/\*\s*js\s*\*\/\s*`([\s\S]*?)`/g)];
                for (const match of jsMatches) {
                    const [fullMatch, jsContent] = match;
                    const minified = await processTemplateWithExpressionsAsync(jsContent, minifyJS, '"__JS_PH_%d__"');
                    contents = contents.replace(fullMatch, `/* js */\`${minified}\``);
                    modified = true;
                }

                if (modified) {
                    return {
                        contents,
                        loader: path.extname(args.path).slice(1)
                    };
                }

                return null;
            });
        }
    };
}

export default minifyTemplatesPlugin;
