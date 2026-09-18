import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "../server/storage.js";
import { renderSharePage } from "../server/share.js";
import type { Issue, Project, Version } from "../shared/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionId = process.argv[2];
const output = path.resolve(process.argv[3] || path.join(root, "site"));

if (!versionId) {
  throw new Error("用法：npm run export:pages -- <版本ID> [输出目录]");
}

const store = new Storage(path.resolve(process.env.HANDOFF_DATA_DIR || path.join(root, "data")));
await store.init();
const version = store.version(versionId);
const project = store.state.projects.find((item) => item.id === version.projectId);
if (!project) throw new Error("项目不存在");

function reviewMarkdown(currentProject: Project, currentVersion: Version) {
  return [
    `# ${currentProject.name} · ${currentVersion.label} 走查清单`,
    "",
    `版本 ID：${currentVersion.id}`,
    `设计：${currentProject.figmaUrl || "未提供"}`,
    "",
    "请在对应版本源代码中落实以下建议，重新构建并上传新版本。预览样式建议不等于源代码已修改。",
    "",
    ...currentVersion.issues.flatMap((issue: Issue, index) => [
      `## ${index + 1}. ${issue.label}`,
      `- 页面：${currentVersion.pages.find((page) => page.id === issue.pageId)?.path || issue.pageId}`,
      `- 元素：\`${issue.selector}\``,
      `- 状态：${{ todo: "待修改", recheck: "待复查", passed: "已通过" }[issue.status]}`,
      `- 提交人：${issue.author}`,
      `- 意见：${issue.note || "样式调整，见下方"}`,
      "```json",
      JSON.stringify(issue.styles, null, 2),
      "```",
      "",
    ]),
  ].join("\n");
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, ".nojekyll"), "");

const versionContent = path.join(store.directory(version.id), "content");
const previewDestination = path.join(output, "preview", "v", version.id, version.previewKey);
const previewRoot = path.resolve(versionContent, version.previewRoot);
await fs.cp(previewRoot, previewDestination, { recursive: true });
await fs.copyFile(path.join(store.directory(version.id), "package.zip"), path.join(output, "delivery.zip"));
await fs.writeFile(path.join(output, "feedback.md"), reviewMarkdown(project, version));
await fs.writeFile(
  path.join(output, "data.json"),
  JSON.stringify({ project, version }, null, 2),
);

const html = renderSharePage({
  project,
  version,
  previewOrigin: "./preview",
  shareOrigin: ".",
})
  .replace(`./share/${version.id}/download`, "./delivery.zip")
  .replace("打开管理站", "返回交付首页");
await fs.writeFile(path.join(output, "index.html"), html);

console.log(`GitHub Pages 静态站已导出：${output}`);
console.log(`公开入口：${path.join(output, "index.html")}`);
