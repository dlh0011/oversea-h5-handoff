import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { ZipArchive } from "archiver";
import { Storage, HttpError, safePath } from "./storage.js";
import { archiveSingleHtml, downloadHtmlUrl, importPackage } from "./import.js";
import { visualEditorClient } from "./visual-editor-client.js";
import { renderSharePage } from "./share.js";
import type { Issue } from "../shared/types.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4328),
  previewPort = Number(process.env.PREVIEW_PORT || port + 1),
  host = process.env.HOST || "127.0.0.1";
const siteOrigin = new URL(
  process.env.SITE_ORIGIN || `http://127.0.0.1:${port}`,
).origin;
const previewOrigin = new URL(
  process.env.PREVIEW_ORIGIN || `http://127.0.0.1:${previewPort}`,
).origin;
if (siteOrigin === previewOrigin) throw new Error("预览必须使用独立 origin");
const accessCode = process.env.HANDOFF_ACCESS_CODE || "";
if (!["127.0.0.1", "localhost", "::1"].includes(host) && accessCode.length < 6)
  throw new Error("团队部署请设置至少 6 位 HANDOFF_ACCESS_CODE");
const store = new Storage(
  path.resolve(process.env.HANDOFF_DATA_DIR || path.join(root, "data")),
);
await store.init();
const temp = path.join(store.root, "uploads");
await fs.mkdir(temp, { recursive: true });
const app = express(),
  preview = express();
app.disable("x-powered-by");
preview.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
const upload = multer({
  dest: temp,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
    fields: 5,
    fieldSize: 12000,
  },
});
const sessions = new Map<string, number>();
const attempts = new Map<string, { count: number; at: number }>();
function isLoopbackRequest(req: express.Request) {
  const address = req.socket.remoteAddress?.replace(/^::ffff:/, "");
  return address === "127.0.0.1" || address === "::1" || address === "localhost";
}
function loggedIn(req: express.Request) {
  if (!accessCode || isLoopbackRequest(req)) return true;
  const token = req.headers.cookie?.match(
    /(?:^|; )handoff_session=([^;]+)/,
  )?.[1];
  return !!token && (sessions.get(token) || 0) > Date.now();
}
app.get("/api/session", (req, res) =>
  res.json({ authenticated: loggedIn(req), local: !accessCode || isLoopbackRequest(req) }),
);
app.post("/api/login", (req, res) => {
  const ip = req.ip || "unknown";
  let attempt = attempts.get(ip);
  if (!attempt || Date.now() - attempt.at > 60000) {
    attempt = { count: 0, at: Date.now() };
    attempts.set(ip, attempt);
  }
  if (++attempt.count > 10)
    throw new HttpError(429, "尝试过多，请一分钟后重试");
  const actual = crypto
    .createHash("sha256")
    .update(String(req.body.code || ""))
    .digest();
  const expected = crypto.createHash("sha256").update(accessCode).digest();
  if (accessCode && !crypto.timingSafeEqual(actual, expected))
    throw new HttpError(401, "访问码不正确");
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + 7 * 86400000);
  res.setHeader(
    "Set-Cookie",
    `handoff_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${siteOrigin.startsWith("https:") ? "; Secure" : ""}`,
  );
  res.json({ ok: true });
});
app.use("/api", (req, res, next) => {
  if (!loggedIn(req)) {
    res.status(401).json({ error: "请先输入团队访问码" });
    return;
  }
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== siteOrigin
  ) {
    res.status(403).json({ error: "请求来源不匹配" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/catalog", (_req, res) =>
  res.json({ ...store.state, previewOrigin }),
);
app.post("/api/import", upload.single("file"), async (req, res) => {
  const file = req.file;
  const input = z
    .object({
      projectId: z.string().uuid().optional(),
      secondaryOf: z.string().uuid().optional(),
      name: z.string().max(120).optional(),
      label: z.string().max(80).optional(),
      notes: z.string().max(10000).optional(),
      url: z.string().max(2000).optional(),
    })
    .parse(req.body);
  const remoteUrl = input.url?.trim();
  if (!file && !remoteUrl) throw new HttpError(400, "请选择 ZIP、HTML 文件或填写 HTML 链接");
  if (file && remoteUrl) throw new HttpError(400, "请只选择文件或填写 HTML 链接其中一种方式");
  let archivePath = file?.path;
  let downloadedPath: string | undefined;
  try {
    if (!file) {
      downloadedPath = path.join(temp, `remote-${crypto.randomUUID()}.html`);
      archivePath = path.join(temp, `html-${crypto.randomUUID()}.zip`);
      await downloadHtmlUrl(remoteUrl!, downloadedPath);
      await archiveSingleHtml(downloadedPath, archivePath);
    } else {
      const extension = path.extname(file.originalname).toLowerCase();
      if (extension === ".html" || extension === ".htm") {
        archivePath = path.join(temp, `html-${crypto.randomUUID()}.zip`);
        await archiveSingleHtml(file.path, archivePath);
      } else if (extension !== ".zip") {
        throw new HttpError(400, "请上传 ZIP 交付包或单个 HTML 文件");
      }
    }
    if (!archivePath) throw new HttpError(400, "没有生成可预览的交付包");
    const version = await importPackage(store, archivePath, input);
    res.status(201).json({ version });
  } finally {
    if (file) await fs.rm(file.path, { force: true });
    if (downloadedPath) await fs.rm(downloadedPath, { force: true });
    if (archivePath && archivePath !== file?.path) await fs.rm(archivePath, { force: true });
  }
});
const patchSchema = z.object({
  selector: z.string().min(1).max(1200),
  label: z.string().max(500),
  styles: z.record(z.string().max(100), z.string().max(2000)),
  note: z.string().max(5000).optional(),
  position: z
    .object({ left: z.number().finite(), top: z.number().finite() })
    .optional(),
});
app.post("/api/versions/:id/issues", async (req, res) => {
  const body = z
    .object({
      revision: z.number().int(),
      pageId: z.string(),
      author: z.string().min(1).max(80),
      patches: z.array(patchSchema).max(300),
    })
    .parse(req.body);
  const id = String(req.params.id);
  store.version(id);
  const updated = await store.update((state) => {
    const v = state.versions.find((v) => v.id === id)!;
    if (v.revision !== body.revision)
      throw new HttpError(409, "其他同事已更新此版本，请刷新后再保存");
    if (!v.pages.some((p) => p.id === body.pageId))
      throw new HttpError(400, "页面不存在");
    const now = new Date().toISOString();
    let contentChanged = false;
    for (const patch of body.patches) {
      let issue = v.issues.find(
        (i) => i.pageId === body.pageId && i.selector === patch.selector,
      );
      if (issue) {
        const noteOrStyleChanged =
          issue.note !== (patch.note || "") ||
          JSON.stringify(issue.styles) !== JSON.stringify(patch.styles);
        const changed =
          noteOrStyleChanged ||
          (patch.position !== undefined &&
            JSON.stringify(issue.position || null) !==
              JSON.stringify(patch.position));
        if (noteOrStyleChanged) contentChanged = true;
        if (changed)
          Object.assign(issue, patch, {
            note: patch.note || "",
            status: noteOrStyleChanged ? "todo" : issue.status,
            author: body.author,
            updatedAt: now,
          });
      } else {
        contentChanged = true;
        issue = {
          ...patch,
          note: patch.note || "",
          id: crypto.randomUUID(),
          pageId: body.pageId,
          author: body.author,
          status: "todo",
          createdAt: now,
          updatedAt: now,
        };
        v.issues.push(issue);
      }
    }
    if (contentChanged) {
      v.status = "reviewing";
      v.workflowStatus = "reviewing";
    }
    v.revision++;
    return v;
  });
  res.json({ version: updated });
});
app.patch("/api/versions/:id/issues/:issueId", async (req, res) => {
  const body = z
      .object({
        revision: z.number().int(),
        status: z.enum(["todo", "recheck", "passed"]),
      })
      .parse(req.body),
    id = String(req.params.id);
  store.version(id);
  const version = await store.update((state) => {
    const v = state.versions.find((v) => v.id === id)!;
    if (v.revision !== body.revision)
      throw new HttpError(409, "版本已被更新，请刷新");
    const issue = v.issues.find((i) => i.id === req.params.issueId);
    if (!issue) throw new HttpError(404, "批注不存在");
    issue.status = body.status;
    issue.updatedAt = new Date().toISOString();
    v.revision++;
    if (body.status !== "passed") {
      v.status = "reviewing";
      v.workflowStatus = "reviewing";
    }
    return v;
  });
  res.json({ version });
});
app.patch("/api/versions/:id/workflow", async (req, res) => {
  const body = z
      .object({
        revision: z.number().int(),
        status: z.enum(["reviewing", "exported", "fixing", "ready"]),
      })
      .parse(req.body),
    id = String(req.params.id);
  store.version(id);
  const version = await store.update((state) => {
    const v = state.versions.find((item) => item.id === id)!;
    if (v.revision !== body.revision)
      throw new HttpError(409, "版本已被更新，请刷新");
    v.workflowStatus = body.status;
    v.revision++;
    return v;
  });
  res.json({ version });
});
app.post("/api/versions/:id/approve", async (req, res) => {
  const body = z
      .object({ revision: z.number().int(), approved: z.boolean() })
      .parse(req.body),
    id = String(req.params.id);
  store.version(id);
  const version = await store.update((state) => {
    const v = state.versions.find((v) => v.id === id)!;
    if (v.revision !== body.revision)
      throw new HttpError(409, "版本已被更新，请刷新");
    if (body.approved && v.issues.some((i) => i.status !== "passed"))
      throw new HttpError(400, "请先完成所有走查问题的复查");
    v.status = body.approved ? "approved" : "reviewing";
    v.workflowStatus = body.approved ? "ready" : "reviewing";
    v.revision++;
    return v;
  });
  res.json({ version });
});
app.get("/api/versions/:id/download", (req, res) => {
  const v = store.version(String(req.params.id));
  const file =
    req.query.kind === "source" && v.sourceArchive
      ? safePath(path.join(store.directory(v.id), "content"), v.sourceArchive)
      : path.join(store.directory(v.id), "package.zip");
  res.download(
    file,
    `${v.label}-${req.query.kind === "source" ? "source" : "delivery"}.zip`,
  );
});
app.get("/api/versions/:id/feedback", (req, res) => {
  const v = store.version(String(req.params.id)),
    project = store.state.projects.find((p) => p.id === v.projectId)!;
  const text = [
    `# ${project.name} · ${v.label} 走查清单`,
    "",
    `版本 ID：${v.id}`,
    `设计：${project.figmaUrl || "未提供"}`,
    "",
    "请在对应版本源代码中落实以下建议，重新构建并上传新版本。预览样式建议不等于源代码已修改。",
    "",
    ...v.issues.flatMap((i, n) => [
      `## ${n + 1}. ${i.label}`,
      `- 页面：${v.pages.find((p) => p.id === i.pageId)?.path}`,
      `- 元素：\`${i.selector}\``,
      `- 状态：${{ todo: "待修改", recheck: "待复查", passed: "已通过" }[i.status]}`,
      `- 提交人：${i.author}`,
      `- 意见：${i.note || "样式调整，见下方"}`,
      "```json",
      JSON.stringify(i.styles, null, 2),
      "```",
      "",
    ]),
  ].join("\n");
  res.attachment(`${v.label}-review.zip`);
  const zip = new ZipArchive({ zlib: { level: 9 } });
  zip.on("error", (e) => res.destroy(e));
  zip.pipe(res);
  zip.append(text, { name: "REVIEW.md" });
  zip.append(
    JSON.stringify(
      {
        project: project.name,
        version: v.label,
        versionId: v.id,
        pages: v.pages,
        issues: v.issues,
      },
      null,
      2,
    ),
    { name: "visual-edits.json" },
  );
  void zip.finalize();
});
app.get("/api/versions/:id/document", async (req, res) => {
  const v = store.version(String(req.params.id)),
    relative = String(req.query.path || "");
  if (
    !v.files.some((f) => f.path === relative) ||
    !/\.(md|txt|json)$/i.test(relative)
  )
    throw new HttpError(400, "只支持交付包内的文档");
  const file = safePath(path.join(store.directory(v.id), "content"), relative);
  const stat = await fs.stat(file);
  if (stat.size > 256000) throw new HttpError(400, "文档过大，请下载后查看");
  res.type("text/plain").send(await fs.readFile(file, "utf8"));
});
function sharedVersion(id: string) {
  const version = store.version(id);
  const project = store.state.projects.find((item) => item.id === version.projectId);
  if (!project) throw new HttpError(404, "项目不存在");
  return { project, version };
}
app.get("/share/:id", (req, res) => {
  const { project, version } = sharedVersion(String(req.params.id));
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(
    renderSharePage({ project, version, previewOrigin, shareOrigin: siteOrigin }),
  );
});
app.get("/share/:id/download", (req, res) => {
  const { version } = sharedVersion(String(req.params.id));
  const file =
    req.query.kind === "source" && version.sourceArchive
      ? safePath(path.join(store.directory(version.id), "content"), version.sourceArchive)
      : path.join(store.directory(version.id), "package.zip");
  res.download(
    file,
    `${version.label}-${req.query.kind === "source" ? "source" : "delivery"}.zip`,
  );
});
app.get("/share/:id/feedback", (req, res) => {
  const { project, version } = sharedVersion(String(req.params.id));
  const text = [
    `# ${project.name} · ${version.label} 走查清单`,
    "",
    `版本 ID：${version.id}`,
    `设计：${project.figmaUrl || "未提供"}`,
    "",
    "请在对应版本源代码中落实以下建议，重新构建并上传新版本。预览样式建议不等于源代码已修改。",
    "",
    ...version.issues.flatMap((issue, index) => [
      `## ${index + 1}. ${issue.label}`,
      `- 页面：${version.pages.find((page) => page.id === issue.pageId)?.path || issue.pageId}`,
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
  res.type("text/markdown").attachment(`${version.label}-review.md`).send(text);
});
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof multer.MulterError || error instanceof z.ZodError
          ? 400
          : 500;
    res.status(status).json({
      error:
        error instanceof HttpError
          ? error.message
          : error instanceof multer.MulterError
            ? "上传失败：文件限制为 100MB"
            : error instanceof z.ZodError
              ? "输入格式无效"
              : "操作失败，请重试",
    });
  },
);
if (process.env.NODE_ENV === "production")
  app.use(express.static(path.join(root, "dist")));
else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
// Preview runs on a separate origin. Uploaded scripts cannot access management cookies or API.
preview.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${siteOrigin}; sandbox allow-scripts allow-same-origin`,
  );
  next();
});
preview.get("/__inspector.js", (_req, res) =>
  res.type("text/javascript").send(visualEditorClient),
);
preview.use("/v/:id/:key", async (req, res, next) => {
  try {
    const v = store.version(String(req.params.id));
    if (req.params.key !== v.previewKey) throw new HttpError(404, "预览不存在");
    const previewRoot = safePath(
      path.join(store.directory(v.id), "content"),
      v.previewRoot,
    );
    const rel = decodeURIComponent(req.path).replace(/^\//, "");
    const file = safePath(previewRoot, rel);
    if (/\.html?$/i.test(file)) {
      let html = await fs.readFile(file, "utf8");
      const script = `<script>window.__HANDOFF_HOST_ORIGIN__=${JSON.stringify(siteOrigin)};</script><script src="/__inspector.js"></script>`;
      html = html.includes("</body>")
        ? html.replace("</body>", script + "</body>")
        : html + script;
      res.setHeader("Cache-Control", "no-store");
      res.type("html").send(html);
      return;
    }
    if (
      !/\.(css|js|mjs|json|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|map)$/i.test(
        file,
      )
    )
      throw new HttpError(404, "资源不可预览");
    res.sendFile(file, (e) => {
      if (e) next(e);
    });
  } catch (e) {
    next(e);
  }
});
preview.use((_req, res) => res.status(404).send("预览资源不存在"));
preview.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) =>
    res
      .status(error instanceof HttpError ? error.status : 404)
      .send(error instanceof HttpError ? error.message : "预览资源不存在"),
);
const server = app.listen(port, host, () =>
  console.log(`交付站 ${siteOrigin}`),
);
const previewServer = preview.listen(previewPort, host, () =>
  console.log(`预览服务 ${previewOrigin}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close();
    previewServer.close();
    process.exit(0);
  });
