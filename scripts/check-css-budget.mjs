/**
 * CSS 预算守门：`!important` 只许减少，不许增加。
 *
 * 背景：仓库现有 500+ 个 `!important`，绝大多数是为跨文件覆盖"抢胜负"而加的，
 * 属于历史债。整体迁移到 @layer 之前必须先把它们降下来（layer 中 !important 的
 * 优先级顺序与普通声明相反，直接加层会成片翻转）。所以先立闸门止血：
 * 任何新增的 `!important` 都会让这条检查失败。
 *
 * 删掉一条 `!important` 后，请把下面的预算同步调小，让刻度只往下走。
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STYLE_DIR = "src/styles";
const IMPORTANT_BUDGET = 509;

function collectCssFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...collectCssFiles(path));
        else if (entry.name.endsWith(".css")) files.push(path);
    }
    return files;
}

const files = collectCssFiles(STYLE_DIR);
let total = 0;
const offenders = [];

for (const file of files) {
    const count = (readFileSync(file, "utf8").match(/!important/g) ?? []).length;
    total += count;
    if (count > 0) offenders.push([count, file]);
}

offenders.sort((a, b) => b[0] - a[0]);

if (total > IMPORTANT_BUDGET) {
    console.error(`✗ CSS !important 超出预算：${total} > ${IMPORTANT_BUDGET}`);
    console.error("  处置建议：优先用媒体查询/层序或提高选择器语义表达，而不是再加 !important。");
    console.error("  主要集中在：");
    for (const [count, file] of offenders.slice(0, 5)) console.error(`    ${String(count).padStart(4)}  ${file}`);
    process.exit(1);
}

console.log(`✓ CSS !important: ${total} / 预算 ${IMPORTANT_BUDGET}`);
