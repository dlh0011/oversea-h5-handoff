import type { Issue, Page, Project, Version } from "../shared/types.js";

const issueState: Record<Issue["status"], string> = {
  todo: "待修改",
  recheck: "待复查",
  passed: "已通过",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonForScript(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function pageUrl(previewOrigin: string, version: Version, page: Page) {
  const [file, hash = ""] = page.path.split("#");
  return `${previewOrigin}/v/${encodeURIComponent(version.id)}/${encodeURIComponent(version.previewKey)}/${file
    .split("/")
    .map(encodeURIComponent)
    .join("/")}${hash ? `#${hash}` : ""}`;
}

export function renderSharePage({
  project,
  version,
  previewOrigin,
  shareOrigin,
}: {
  project: Project;
  version: Version;
  previewOrigin: string;
  shareOrigin: string;
}) {
  const pages = version.pages.map((page) => ({
    ...page,
    previewUrl: pageUrl(previewOrigin, version, page),
  }));
  const issues = version.issues.map((issue) => ({
    ...issue,
    pageName: version.pages.find((page) => page.id === issue.pageId)?.name || issue.pageId,
  }));
  const initialPage = pages[0];
  const issueCount = issues.filter((issue) => issue.status !== "passed").length;
  const workflow = version.workflowStatus || (version.status === "approved" ? "ready" : "reviewing");
  const workflowLabel: Record<string, string> = {
    reviewing: "正在走查",
    exported: "已导出给 Codex",
    fixing: "Codex 修复中",
    ready: "待复查",
  };
  const payload = { pages, issues, workflow };
  const issueMarkup = issues.length
    ? issues
        .map(
          (issue, index) => `
          <article class="issue" data-page="${escapeHtml(issue.pageId)}">
            <div class="issue-index">${String(index + 1).padStart(2, "0")}</div>
            <div class="issue-body">
              <div class="issue-meta"><span>${escapeHtml(issue.pageName)}</span><b class="state state-${issue.status}">${issueState[issue.status]}</b></div>
              <h3>${escapeHtml(issue.note || issue.label || "样式调整建议")}</h3>
              <code>${escapeHtml(issue.selector)}</code>
              ${Object.keys(issue.styles).length ? `<dl>${Object.entries(issue.styles).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : ""}
              <small>${escapeHtml(issue.author)} · ${escapeHtml(new Date(issue.updatedAt).toLocaleDateString("zh-CN"))}</small>
            </div>
          </article>`,
        )
        .join("")
    : `<div class="empty"><strong>暂无走查标注</strong><span>当前版本还没有需要同步给技术的问题。</span></div>`;
  const pageMarkup = pages
    .map(
      (page, index) =>
        `<button class="page-tab ${index === 0 ? "active" : ""}" data-page-id="${escapeHtml(page.id)}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(page.name)}</button>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(project.name)} · ${escapeHtml(version.label)} · 交付页</title>
  <style>
    :root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC","Microsoft YaHei",sans-serif;color:#1d1d1f;background:#f5f5f7;font-synthesis:none}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% -10%,#fff 0,#f5f5f7 42%,#ececf0 100%);line-height:1.5}a{color:inherit}.shell{max-width:1400px;margin:auto;padding:28px 28px 56px}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:10px 0 30px}.kicker{font-size:12px;font-weight:700;letter-spacing:.12em;color:#86868b;text-transform:uppercase}.title{margin:8px 0 6px;font-size:clamp(30px,4vw,54px);line-height:1.02;letter-spacing:-.035em}.subtitle{margin:0;color:#6e6e73;font-size:15px}.top-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.button{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:999px;background:#1d1d1f;color:#fff;text-decoration:none;padding:11px 16px;font:600 13px inherit;cursor:pointer;box-shadow:0 4px 16px #00000014}.button.secondary{background:#fff;color:#1d1d1f;border:1px solid #d2d2d7;box-shadow:0 2px 8px #0000000a}.meta-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.pill{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #e2e2e7;border-radius:999px;padding:7px 11px;color:#6e6e73;font-size:12px}.pill strong{color:#1d1d1f}.layout{display:grid;grid-template-columns:210px minmax(0,1fr) 340px;gap:18px;align-items:start}.panel{background:#fff;border:1px solid #e5e5ea;border-radius:24px;box-shadow:0 18px 60px #0000000a}.side{padding:12px;position:sticky;top:20px}.side h2{font-size:12px;color:#86868b;margin:8px 10px 10px;font-weight:700}.page-tab{width:100%;display:flex;gap:10px;align-items:center;border:0;background:transparent;border-radius:14px;padding:12px 10px;text-align:left;font:600 13px inherit;color:#6e6e73;cursor:pointer}.page-tab span{font-variant-numeric:tabular-nums;color:#a1a1a6;font-size:11px}.page-tab.active{background:#f2f2f7;color:#1d1d1f}.page-tab.active span{color:#0071e3}.workspace{padding:18px;min-width:0}.workspace-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:3px 4px 16px}.workspace-head h2{font-size:17px;margin:0;letter-spacing:-.01em}.workspace-head span{font-size:12px;color:#86868b}.preview{background:#f5f5f7;border-radius:18px;min-height:620px;display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:26px}.preview iframe{display:block;border:0;background:#fff;border-radius:16px;box-shadow:0 16px 40px #0000001c;width:min(100%,402px);height:620px}.right{padding:20px;position:sticky;top:20px}.right h2{margin:0;font-size:20px;letter-spacing:-.02em}.right .lead{color:#6e6e73;font-size:13px;margin:6px 0 20px}.info{border-top:1px solid #e5e5ea;padding:16px 0}.info-label{color:#86868b;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.info p{font-size:13px;margin:6px 0 0;white-space:pre-wrap}.figma{color:#0071e3;text-decoration:none;font-size:13px;font-weight:600}.issue-list{display:grid;gap:10px;margin-top:12px}.issue{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;padding:13px;border:1px solid #e5e5ea;border-radius:16px;background:#fbfbfd}.issue-index{font-size:11px;color:#86868b;font-variant-numeric:tabular-nums;padding-top:2px}.issue-meta{display:flex;justify-content:space-between;gap:8px;color:#86868b;font-size:11px}.issue-meta b{font-size:10px;border-radius:999px;padding:2px 7px;font-weight:700}.state-todo{background:#fff0e5;color:#c45100}.state-recheck{background:#fff8d9;color:#8b6500}.state-passed{background:#e8f7ed;color:#18794e}.issue h3{font-size:13px;line-height:1.4;margin:8px 0}.issue code{display:block;color:#86868b;font-size:10px;overflow-wrap:anywhere}.issue dl{margin:9px 0 0;display:grid;gap:3px}.issue dl div{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#6e6e73}.issue dt,.issue dd{margin:0}.issue dd{color:#1d1d1f;text-align:right}.issue small{display:block;color:#a1a1a6;font-size:10px;margin-top:10px}.empty{padding:24px 8px;color:#6e6e73;display:grid;gap:5px;font-size:13px}.empty strong{color:#1d1d1f}.footer{display:flex;justify-content:space-between;gap:16px;align-items:center;color:#86868b;font-size:12px;padding:22px 2px 0}.footer a{color:#0071e3;text-decoration:none}.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1d1d1f;color:#fff;border-radius:999px;padding:10px 16px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s}.toast.show{opacity:1}@media (max-width:1080px){.layout{grid-template-columns:190px minmax(0,1fr)}.right{grid-column:1/-1;position:static}.issue-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:700px){.shell{padding:18px 14px 34px}.topbar{display:block}.top-actions{justify-content:flex-start;margin-top:18px}.layout{display:block}.side,.right{position:static;margin-top:12px}.side{padding:10px;overflow:auto;white-space:nowrap}.side h2{display:none}.page-tab{display:inline-flex;width:auto;margin-right:4px}.workspace{margin-top:12px;padding:10px}.workspace-head{padding:7px 4px 14px}.preview{min-height:520px;padding:16px 10px}.preview iframe{height:560px}.right{padding:16px}.issue-list{grid-template-columns:1fr}.footer{display:block;line-height:1.8}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div><div class="kicker">H5 HANDOFF · SHARE VIEW</div><h1 class="title">${escapeHtml(project.name)}</h1><p class="subtitle">${escapeHtml(version.label)} · ${escapeHtml(version.notes || "设计交付与走查归档")}</p><div class="meta-row"><span class="pill"><strong>${escapeHtml(workflowLabel[workflow] || workflow)}</strong></span><span class="pill">${pages.length} 个页面状态</span><span class="pill">${issueCount} 条待处理反馈</span></div></div>
      <div class="top-actions"><a class="button secondary" href="${escapeHtml(project.figmaUrl || "#")}" target="_blank" rel="noreferrer">打开 Figma ↗</a><a class="button" href="${escapeHtml(shareOrigin)}/share/${escapeHtml(version.id)}/download">下载交付 ZIP ↓</a></div>
    </header>
    <section class="layout">
      <nav class="panel side"><h2>页面与状态</h2>${pageMarkup}</nav>
      <section class="panel workspace"><div class="workspace-head"><h2 id="page-title">${escapeHtml(initialPage.name)}</h2><span id="page-size">${initialPage.width} × ${initialPage.height}</span></div><div class="preview"><iframe id="preview" title="H5 预览" src="${escapeHtml(initialPage.previewUrl)}"></iframe></div></section>
      <aside class="panel right"><h2>交付说明</h2><p class="lead">这是一份可直接转发给设计和技术同事的只读交付页。</p><div class="info"><div class="info-label">版本说明</div><p>${escapeHtml(version.notes || "暂无额外说明")}</p></div><div class="info"><div class="info-label">页面行为</div><p>左侧切换页面状态，中间查看真实 H5，右侧查看已保存的走查反馈。预览样式建议不会伪装成源代码改动。</p></div><div class="info"><div class="info-label">走查反馈 <span id="issue-count">${issues.length}</span></div><div class="issue-list">${issueMarkup}</div></div><div class="info"><a class="figma" href="${escapeHtml(project.figmaUrl || "#")}" target="_blank" rel="noreferrer">在 Figma 中定位设计 ↗</a></div></aside>
    </section>
    <footer class="footer"><span>由海外 H5 交付站生成 · ${escapeHtml(new Date(version.createdAt).toLocaleDateString("zh-CN"))}</span><a href="${escapeHtml(shareOrigin)}">打开管理站</a></footer>
  </main>
  <div class="toast" id="toast"></div>
  <script>const DATA=${jsonForScript(payload)};const tabs=[...document.querySelectorAll('.page-tab')];const iframe=document.querySelector('#preview');const title=document.querySelector('#page-title');const size=document.querySelector('#page-size');const issues=[...document.querySelectorAll('.issue')];function selectPage(id){const page=DATA.pages.find(item=>item.id===id)||DATA.pages[0];iframe.src=page.previewUrl;title.textContent=page.name;size.textContent=page.width+' × '+page.height;tabs.forEach(tab=>tab.classList.toggle('active',tab.dataset.pageId===page.id));issues.forEach(item=>item.hidden=item.dataset.page!==page.id)}tabs.forEach(tab=>tab.addEventListener('click',()=>selectPage(tab.dataset.pageId)));selectPage(DATA.pages[0].id);</script>
</body></html>`;
}

