import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { minifyTemplatesPlugin } from "./esbuild-plugin-minify-templates.js";

const isDev = process.argv.includes("--dev");

const distDir = "./dist";
const entryPoints = ["./dist/index.js"];
const tempOutput = "./dist/_bundle.js";
const finalOutput = "./dist/index.js";

const options = {
    entryPoints,
    outfile: tempOutput,
    format: "esm",
    keepNames: true,
    bundle: true,
    minify: !isDev,
    sourcemap: isDev,
    metafile: true,
    target: "esnext",
    treeShaking: true,
    legalComments: "none",
    plugins: isDev ? [] : [minifyTemplatesPlugin()]
}

const result = await esbuild.build(options);
const text = await esbuild.analyzeMetafile(result.metafile, { verbose: true });
console.log(text);

// 清理中间文件，只保留 .d.ts 类型声明文件和临时打包文件
const tempOutputResolved = path.resolve(tempOutput);

function cleanDist(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const resolvedPath = path.resolve(fullPath);
        if (item.isDirectory()) {
            cleanDist(fullPath);
            // 删除空目录
            if (fs.readdirSync(fullPath).length === 0) {
                fs.rmdirSync(fullPath);
            }
        } else if (item.isFile()) {
            // 保留 .d.ts 和 .d.ts.map 文件，以及临时打包文件
            const keepFile = item.name.endsWith(".d.ts") ||
                item.name.endsWith(".d.ts.map") ||
                resolvedPath === tempOutputResolved;
            if (!keepFile) {
                fs.unlinkSync(fullPath);
            }
        }
    }
}

cleanDist(distDir);

// 重命名临时文件为最终输出
fs.renameSync(tempOutput, finalOutput);

console.log("\n✓ Build complete: dist/index.js");