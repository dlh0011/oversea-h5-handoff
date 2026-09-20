import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  FolderOpen,
  Layers,
  Loader2,
  MessageSquare,
  MousePointer2,
  Package,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Smartphone,
  Undo2,
  UploadCloud,
  X,
} from "lucide-react";
import type {
  Issue,
  Page,
  Patch,
  Project,
  Snapshot,
  Version,
  WorkflowStatus,
} from "../shared/types";
type Catalog = Snapshot & { previewOrigin: string };
type Selected = {
  selector: string;
  label: string;
  styles: Record<string, string>;
  chain?: { label: string; selector: string }[];
  layer?: { asset?: string };
  inspect?: unknown;
  rect?: { left: number; top: number; width: number; height: number };
};
type MarkerPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};
const states = { todo: "待修改", recheck: "待复查", passed: "已通过" };
const workflowStates: Record<WorkflowStatus, string> = {
  reviewing: "正在走查",
  exported: "已导出给 Codex",
  fixing: "Codex 修复中",
  ready: "待复查",
};
function workflowStatus(version: Version): WorkflowStatus {
  return version.workflowStatus ||
    (version.status === "approved" ? "ready" : "reviewing");
}
const fields = [
  ["fontSize", "字号"],
  ["lineHeight", "行高"],
  ["color", "文字颜色"],
  ["fontWeight", "字重"],
  ["left", "水平位置"],
  ["top", "垂直位置"],
  ["width", "宽度"],
  ["height", "高度"],
  ["backgroundColor", "背景颜色"],
  ["borderRadius", "圆角"],
  ["opacity", "透明度"],
  ["letterSpacing", "字间距"],
] as const;
const bytes = (n: number) =>
  n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
const date = (s: string) =>
  new Date(s).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }) +
  " " +
  new Date(s).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("session-expired"));
    throw Error(data.error || "请求失败");
  }
  return data;
}
export default function App() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [catalog, setCatalog] = useState<Catalog>({
      projects: [],
      versions: [],
      previewOrigin: "",
    });
  const [projectId, setProjectId] = useState(
      new URLSearchParams(location.search).get("project") || "",
    ),
    [versionId, setVersionId] = useState(
      new URLSearchParams(location.search).get("version") || "",
    );
  const [section, setSection] = useState("preview"),
    [upload, setUpload] = useState(false),
    [toast, setToast] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const project = catalog.projects.find((p) => p.id === projectId);
  const versions = catalog.versions
    .filter((v) => v.projectId === projectId)
    .slice()
    .reverse();
  const version = versions.find((v) => v.id === versionId) || versions[0];
  async function reload() {
    try {
      setCatalog(await api<Catalog>("/api/catalog"));
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  useEffect(() => {
    api<{ authenticated: boolean }>("/api/session")
      .then((r) => setAuth(r.authenticated))
      .catch(() => setToast("无法连接服务"));
    const expired = () => setAuth(false);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (auth) void reload();
  }, [auth]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const query = new URLSearchParams();
    if (projectId) query.set("project", projectId);
    if (version) query.set("version", version.id);
    history.replaceState(null, "", query.size ? "?" + query : "/");
  }, [projectId, version?.id]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function navigate(fn: () => void) {
    if (dirty) {
      setToast("请先保存当前标注，或撤销未保存的调整，再切换页面");
      return;
    }
    fn();
  }
  function update(v: Version) {
    setCatalog((c) => ({
      ...c,
      versions: c.versions.map((old) => (old.id === v.id ? v : old)),
    }));
  }
  async function approve() {
    if (!version) return;
    setBusy(true);
    try {
      const r = await api<{ version: Version }>(
        `/api/versions/${version.id}/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            revision: version.revision,
            approved: version.status !== "approved",
          }),
        },
      );
      update(r.version);
      setToast(
        r.version.status === "approved" ? "此版本已确认交付" : "已重新进入走查",
      );
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setWorkflow(status: WorkflowStatus) {
    if (!version || workflowStatus(version) === status) return;
    setBusy(true);
    try {
      const r = await api<{ version: Version }>(
        `/api/versions/${version.id}/workflow`,
        {
          method: "PATCH",
          body: JSON.stringify({ revision: version.revision, status }),
        },
      );
      update(r.version);
      setToast(`反馈状态已更新为「${workflowStates[status]}」`);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportFeedback(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (!version) return;
    if (busy) return;
    setBusy(true);
    try {
      if (workflowStatus(version) !== "exported") {
        const r = await api<{ version: Version }>(
          `/api/versions/${version.id}/workflow`,
          {
            method: "PATCH",
            body: JSON.stringify({
              revision: version.revision,
              status: "exported",
            }),
          },
        );
        update(r.version);
      }
      window.location.href = `/api/versions/${version.id}/feedback`;
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (auth === null)
    return (
      <div className="loading-screen">
        <Loader2 className="spin" />
        正在打开交付站…
      </div>
    );
  if (!auth) return <Login onLogin={() => setAuth(true)} />;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate(() => {
              setProjectId("");
              setSection("preview");
            });
          }}
        >
          <span className="brand-icon">
            <Layers size={21} />
          </span>
          <span>
            PAGE<span className="brand-sub">海外 H5 交付站</span>
          </span>
        </a>
        <button
          className="workspace-switch"
          onClick={() =>
            navigate(() => {
              setProjectId("");
              setSection("preview");
            })
          }
        >
          <span className="workspace-avatar">O</span>
          <span>
            海外设计组<small>项目交付</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <p className="nav-caption">工作空间</p>
        <button
          className={`nav-item ${!project && section !== "guide" ? "active" : ""}`}
          onClick={() =>
            navigate(() => {
              setProjectId("");
              setSection("preview");
            })
          }
        >
          <FolderOpen size={18} />
          全部项目<span className="count">{catalog.projects.length}</span>
        </button>
        {project && (
          <>
            <p className="nav-caption project-caption">当前项目</p>
            <div className="project-nav-title">{project.name}</div>
            {[
              ["preview", Layers, "页面与预览"],
              ["issues", MessageSquare, "走查记录"],
              ["delivery", Package, "交付文件"],
            ].map(([key, Icon, label]) => {
              const I = Icon as typeof Layers;
              return (
                <button
                  key={String(key)}
                  className={`nav-item ${section === key ? "active" : ""}`}
                  onClick={() => navigate(() => setSection(String(key)))}
                >
                  <I size={18} />
                  {String(label)}
                  {key === "issues" && (
                    <span className="count">
                      {version?.issues.filter((i) => i.status !== "passed")
                        .length || 0}
                    </span>
                  )}
                </button>
              );
            })}
          </>
        )}
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${section === "guide" ? "active" : ""}`}
            onClick={() => navigate(() => setSection("guide"))}
          >
            <FileText size={18} />
            使用指南
          </button>
          <div className="member">
            <span>DS</span>
            <div>
              海外项目<small>Design workspace</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            工作空间
            <ChevronRight size={14} />
            <span>{project ? project.name : "全部项目"}</span>
            {project && (
              <>
                <ChevronRight size={14} />
                <b>
                  {section === "issues"
                    ? "走查记录"
                    : section === "delivery"
                      ? "交付文件"
                      : section === "guide"
                        ? "使用指南"
                        : "页面与预览"}
                </b>
              </>
            )}
          </div>
          <div className="top-actions">
            <span className="save-hint">
              <span className="dot" />
              {dirty ? "有未保存标注" : "工作空间"}
            </span>
            <button
              className="icon-button"
              title="刷新项目"
              onClick={() => navigate(() => void reload())}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        {section === "guide" ? (
          <Guide />
        ) : !project ? (
          <ProjectLibrary
            catalog={catalog}
            search={search}
            setSearch={setSearch}
            onUpload={() => setUpload(true)}
            onOpen={(id, version) => {
              setProjectId(id);
              setVersionId(version);
              setSection("preview");
            }}
          />
        ) : version ? (
          <>
            <div className="project-heading">
              <div>
                <button
                  className="back-link"
                  onClick={() => navigate(() => setProjectId(""))}
                >
                  <ArrowLeft size={13} />
                  全部项目
                </button>
                <div className="project-title">
                  <h1>{project.name}</h1>
                  <Badge status={version.status} />
                  <WorkflowBadge status={workflowStatus(version)} />
                </div>
                <p>{version.notes || "暂无版本说明"}</p>
              </div>
              <div className="project-actions">
                {project.figmaUrl && (
                  <a
                    className="button"
                    href={project.figmaUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开 Figma
                    <ArrowUpRight size={15} />
                  </a>
                )}
                <button
                  className="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(location.href)
                      .then(() =>
                        setToast("项目链接已复制；同事需能访问此部署地址"),
                      )
                      .catch(() => setToast("复制失败，请复制浏览器地址栏"));
                  }}
                >
                  <Copy size={15} />
                  分享
                </button>
                <button
                  className="primary"
                  onClick={() => navigate(() => setUpload(true))}
                >
                  <UploadCloud size={16} />
                  上传新版本
                </button>
              </div>
            </div>
            <div className="version-bar">
              <div className="version-select">
                <span className="version-dot" />
                <select
                  aria-label="选择版本"
                  value={version.id}
                  onChange={(e) => navigate(() => setVersionId(e.target.value))}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                      {v.id === versions[0]?.id ? " · 最新版本" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <span>{date(version.createdAt)} 上传</span>
              <span className="divider" />
              <span>{version.pages.length} 个页面状态</span>
              <div className="version-end">
                <a
                  href={`/api/versions/${version.id}/feedback`}
                  onClick={(event) => void exportFeedback(event)}
                >
                  <ClipboardList size={15} />
                  导出走查
                </a>
                <button
                  className="version-workflow-link"
                  type="button"
                  disabled={busy}
                  onClick={() => void setWorkflow("fixing")}
                >
                  标记修复中
                </button>
                <a href={`/api/versions/${version.id}/download`}>
                  <Download size={15} />
                  下载交付包
                </a>
              </div>
            </div>
            {section === "preview" ? (
              <Preview
                key={version.id}
                project={project}
                version={version}
                origin={catalog.previewOrigin}
                update={update}
                toast={setToast}
                onDirty={setDirty}
              />
            ) : section === "issues" ? (
              <IssueList version={version} update={update} toast={setToast} />
            ) : (
              <Delivery
                project={project}
                version={version}
                toast={setToast}
                setWorkflow={setWorkflow}
                busy={busy}
                exportFeedback={exportFeedback}
              />
            )}
            <footer className="project-footer">
              <span>
                <ShieldCheck size={15} />
                {version.label} ·{" "}
                {version.issues.filter((i) => i.status !== "passed").length}{" "}
                项待处理
              </span>
              <button
                className={version.status === "approved" ? "button" : "primary"}
                disabled={
                  busy ||
                  dirty ||
                  version.issues.some((i) => i.status !== "passed")
                }
                onClick={() => void approve()}
              >
                <CheckCheck size={16} />
                {version.status === "approved" ? "重新走查" : "确认此版本交付"}
              </button>
            </footer>
          </>
        ) : (
          <div className="empty-state">这个项目还没有版本。</div>
        )}
      </div>
      {upload && (
        <UploadDialog
          project={project}
          latest={versions[0]}
          close={() => setUpload(false)}
          done={async (v) => {
            setUpload(false);
            await reload();
            setProjectId(v.projectId);
            setVersionId(v.id);
            setSection("preview");
            setToast("上传完成，预览与交付包已归档");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <MessageSquare size={16} />
          {toast}
          <button onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
function ProjectLibrary({
  catalog,
  search,
  setSearch,
  onUpload,
  onOpen,
}: {
  catalog: Catalog;
  search: string;
  setSearch: (s: string) => void;
  onUpload: () => void;
  onOpen: (id: string, version: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const rows = catalog.projects.map((project) => ({
    project,
    version: catalog.versions.filter((v) => v.projectId === project.id).at(-1),
  }));
  const shown = rows.filter(
    ({ project, version }) =>
      project.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" || version?.status === filter),
  );
  return (
    <main className="dashboard">
      <div className="page-heading">
        <div>
          <h1>项目交付</h1>
          <p>
            {rows.length} 个项目 · {catalog.versions.length} 个归档版本
          </p>
        </div>
        <button className="primary" onClick={onUpload}>
          <Plus size={16} />
          新建项目
        </button>
      </div>
      <div className="library-toolbar">
        <div className="library-tabs" role="tablist" aria-label="项目状态">
          {[
            ["all", "全部项目"],
            ["reviewing", "走查中"],
            ["approved", "已交付"],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
              <span>
                {
                  rows.filter((r) => key === "all" || r.version?.status === key)
                    .length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={15} />
          <input
            aria-label="搜索项目"
            placeholder="搜索项目…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="project-columns" aria-hidden="true">
        <span>项目</span>
        <span>状态</span>
        <span>待处理</span>
        <span>最近更新</span>
        <span />
      </div>
      <div className="project-rows">
        {shown.map(({ project, version }) => (
          <button
            key={project.id}
            className="project-row"
            onClick={() => onOpen(project.id, version?.id || "")}
          >
            <span className="project-identity">
              <span className="project-thumbnail" aria-hidden="true">
                {version ? (
                  <iframe
                    title={project.name + "缩略预览"}
                    tabIndex={-1}
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin"
                    src={
                      catalog.previewOrigin +
                      "/v/" +
                      version.id +
                      "/" +
                      version.previewKey +
                      "/" +
                      version.pages[0].path
                    }
                    style={{
                      width: version.pages[0].width,
                      height: version.pages[0].height,
                      transform: "scale(" + 76 / version.pages[0].width + ")",
                    }}
                  />
                ) : (
                  <Layers size={24} />
                )}
              </span>
              <span className="project-info">
                <strong>{project.name}</strong>
                <span>{version?.label || "暂无版本"}</span>
                <small>{version?.pages.length || 0} 个页面状态</small>
              </span>
            </span>
            <Badge status={version?.status || "reviewing"} />
            <span className="project-pending">
              <MessageSquare size={14} />
              {version?.issues.filter((i) => i.status !== "passed").length || 0}
            </span>
            <time className="project-date">
              {version ? date(version.createdAt) : "—"}
            </time>
            <ArrowUpRight size={17} className="project-open" />
          </button>
        ))}
        {!shown.length && (
          <div className="large-empty">
            <FolderOpen size={25} />
            <h3>
              {search || filter !== "all" ? "没有匹配的项目" : "暂无项目"}
            </h3>
            {search || filter !== "all" ? (
              <button
                className="button"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                清除筛选
              </button>
            ) : (
              <button className="primary" onClick={onUpload}>
                <Plus size={16} />
                新建项目
              </button>
            )}
          </div>
        )}
      </div>
      <div className="library-summary">
        <span>{shown.length} 个项目</span>
        <span>
          <FileArchive size={14} />
          {catalog.versions.length} 个版本已归档
        </span>
      </div>
    </main>
  );
}
function Badge({ status }: { status: Version["status"] }) {
  return (
    <span className={`badge ${status}`}>
      {status === "approved" ? <Check size={12} /> : <span />}
      {status === "approved" ? "已确认交付" : "走查中"}
    </span>
  );
}
function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  return (
    <span className={`workflow-badge ${status}`}>
      <span />
      {workflowStates[status]}
    </span>
  );
}
function Preview({
  project,
  version,
  origin,
  update,
  toast,
  onDirty,
}: {
  project: Project;
  version: Version;
  origin: string;
  update: (v: Version) => void;
  toast: (s: string) => void;
  onDirty: (v: boolean) => void;
}) {
  const [pageId, setPageId] = useState(version.pages[0].id),
    [mode, setMode] = useState(false),
    [selected, setSelected] = useState<Selected | null>(null),
    [patches, setPatches] = useState<Patch[]>([]),
    [note, setNote] = useState(""),
    [dirty, setDirty] = useState(false),
    [author, setAuthor] = useState(
      localStorage.getItem("review-author") || "设计同事",
    ),
    [saving, setSaving] = useState(false),
    [ready, setReady] = useState(false),
    [width, setWidth] = useState(0),
    [reloadKey, setReloadKey] = useState(0),
    [inspectorTab, setInspectorTab] = useState("note"),
    [markerPositions, setMarkerPositions] = useState<
      Record<string, MarkerPosition>
    >({}),
    [previewScrollY, setPreviewScrollY] = useState(0);
  const [placedMarkers, setPlacedMarkers] = useState<
    Record<string, { left: number; top: number }>
  >({});
  const [hoveredMarker, setHoveredMarker] = useState<{
    issue: Issue;
    number: number;
    left: number;
    top: number;
    above: boolean;
  } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(tooltipTimer.current), []);
  const frame = useRef<HTMLIFrameElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const markerDrag = useRef<{
    selector: string;
    startX: number;
    startY: number;
    left: number;
    top: number;
    moved: boolean;
    previous?: { left: number; top: number };
  } | null>(null);
  const suppressMarkerClick = useRef(false);
  const [availableWidth, setAvailableWidth] = useState(640);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(entry.contentRect.width),
    );
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  const current = useRef({ version, pageId, mode, dirty, patches });
  current.current = { version, pageId, mode, dirty, patches };
  const page = version.pages.find((p) => p.id === pageId)!;
  const frameWidth = width || page.width;
  const frameHeight = Math.min(page.height, 760);
  const scale = Math.min(1, Math.max(200, availableWidth) / frameWidth);
  const issues = version.issues.filter((i) => i.pageId === pageId);
  const file = page.path.split("#")[0];
  const hash = page.path.includes("#")
    ? "#" + page.path.split("#").slice(1).join("#")
    : "";
  const url = `${origin}/v/${version.id}/${version.previewKey}/${file.split("/").map(encodeURIComponent).join("/")}${hash}`;
  function send(data: Record<string, unknown>) {
    frame.current?.contentWindow?.postMessage(
      { source: "oversea-visual-editor-host", ...data },
      origin,
    );
  }
  function mark(value: boolean) {
    setDirty(value);
    onDirty(value);
  }
  useEffect(() => () => onDirty(false), []);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.source !== "oversea-visual-editor"
      )
        return;
      const data = event.data,
        c = current.current;
      if (data.type === "ready") {
        setReady(true);
        send({ type: "set-mode", enabled: c.mode });
        const saved = c.version.issues.filter((i) => i.pageId === c.pageId);
        send({ type: "restore", patches: saved });
        send({
          type: "measure",
          selectors: saved.map((issue) => issue.selector),
        });
        setPatches(saved);
        setMarkerPositions({});
        setPlacedMarkers(
          Object.fromEntries(
            saved
              .filter((issue) => issue.position)
              .map((issue) => [
                issue.selector,
                {
                  left: issue.position!.left,
                  top: issue.position!.top,
                },
              ]),
          ),
        );
        return;
      }
      if (data.type === "restored" && data.missing?.length)
        toast(`${data.missing.length} 处标注无法定位，请根据清单核对`);
      if (data.type === "selected") {
        setSelected(data.selected);
        if (data.selected?.rect) {
          setMarkerPositions((current) => ({
            ...current,
            [data.selected.selector]: data.selected.rect,
          }));
        }
        const p = (data.patches || []).find(
          (p: Patch) => p.selector === data.selected?.selector,
        );
        setNote(p?.note || "");
      }
      if (data.type === "patches-changed") {
        setPatches(data.patches || []);
        mark(true);
        if (data.selected) setSelected(data.selected);
      }
      if (data.type === "measured") {
        if (typeof data.scrollY === "number") setPreviewScrollY(data.scrollY);
        setMarkerPositions(data.measurements || {});
      }
      if (data.type === "page-state") {
        const activePage = c.version.pages.find(
          (p) =>
            p.path.split("#")[0] === file &&
            (p.path.includes("#")
              ? "#" + p.path.split("#").slice(1).join("#")
              : "") === data.hash,
        );
        if (activePage && activePage.id !== c.pageId) {
          if (c.dirty) {
            toast("请保存当前标注后再切换状态");
            return;
          }
          setPageId(activePage.id);
          setSelected(null);
          setPatches([]);
          setPlacedMarkers({});
          setMarkerPositions({});
          setHoveredMarker(null);
          setPreviewScrollY(0);
          setReady(false);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [origin, file]);
  function changePage(id: string) {
    if (dirty) {
      toast("请先保存标注，或撤销未保存的调整");
      return;
    }
    setPageId(id);
    setSelected(null);
    setPatches([]);
    setMarkerPositions({});
    setPlacedMarkers({});
    setHoveredMarker(null);
    setPreviewScrollY(0);
    setNote("");
    setReady(false);
    setWidth(0);
  }
  useEffect(() => {
    if (!ready || !issues.length) return;
    send({ type: "measure", selectors: issues.map((issue) => issue.selector) });
  }, [ready, pageId, version.revision, issues.length, width, mode]);
  function toggleMode() {
    setMode(!mode);
    send({ type: "set-mode", enabled: !mode });
    setSelected(null);
  }
  function markerPosition(issue: Issue) {
    return (
      placedMarkers[issue.selector] ||
      issue.position ||
      markerPositions[issue.selector]
    );
  }
  function showMarkerText(
    event: React.SyntheticEvent<HTMLButtonElement>,
    issue: Issue,
    number: number,
  ) {
    if (markerDrag.current) return;
    clearTimeout(tooltipTimer.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const above = window.innerHeight - rect.bottom < 250 && rect.top > 250;
    setHoveredMarker({
      issue,
      number,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 312)),
      top: above ? rect.top - 10 : rect.bottom + 10,
      above,
    });
  }
  function hideMarkerText() {
    clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setHoveredMarker(null), 140);
  }
  function startMarkerDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    issue: Issue,
  ) {
    if (event.button !== 0 || saving) return;
    const position = markerPosition(issue);
    if (!position) return;
    markerDrag.current = {
      selector: issue.selector,
      startX: event.clientX,
      startY: event.clientY,
      left: position.left,
      top: position.top,
      moved: false,
      previous: placedMarkers[issue.selector],
    };
    setHoveredMarker(null);
    suppressMarkerClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveMarkerDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    issue: Issue,
  ) {
    const drag = markerDrag.current;
    if (!drag || drag.selector !== issue.selector) return;
    if (
      Math.abs(event.clientX - drag.startX) > 3 ||
      Math.abs(event.clientY - drag.startY) > 3
    )
      drag.moved = true;
    if (!drag.moved) return;
    const left = drag.left + (event.clientX - drag.startX) / scale;
    const top = drag.top + (event.clientY - drag.startY) / scale;
    setPlacedMarkers((current) => ({
      ...current,
      [issue.selector]: { left, top },
    }));
  }
  function endMarkerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = markerDrag.current;
    markerDrag.current = null;
    if (drag?.moved) {
      suppressMarkerClick.current = true;
      mark(true);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function cancelMarkerDrag() {
    const drag = markerDrag.current;
    if (!drag) return;
    setPlacedMarkers((positions) => {
      const next = { ...positions };
      if (drag.previous) next[drag.selector] = drag.previous;
      else delete next[drag.selector];
      return next;
    });
    markerDrag.current = null;
    suppressMarkerClick.current = true;
  }
  function style(key: string, value: string) {
    if (!selected) return;
    if (["left", "top"].includes(key) && selected.styles.position === "static")
      send({
        type: "apply-style",
        selector: selected.selector,
        key: "position",
        value: "relative",
      });
    send({ type: "apply-style", selector: selected.selector, key, value });
    setSelected({ ...selected, styles: { ...selected.styles, [key]: value } });
  }
  async function save() {
    setSaving(true);
    try {
      const r = await api<{ version: Version }>(
        `/api/versions/${version.id}/issues`,
        {
          method: "POST",
          body: JSON.stringify({
            revision: version.revision,
            pageId,
            author: author.trim() || "设计同事",
            patches: patches
              .map((patch) => {
                const position =
                  placedMarkers[patch.selector] ||
                  issues.find((issue) => issue.selector === patch.selector)
                    ?.position;
                return position
                  ? {
                      ...patch,
                      position: { left: position.left, top: position.top },
                    }
                  : patch;
              })
              .concat(
                issues
                  .filter(
                    (issue) =>
                      placedMarkers[issue.selector] &&
                      !patches.some(
                        (patch) => patch.selector === issue.selector,
                      ),
                  )
                  .map((issue) => ({
                    ...issue,
                    position: placedMarkers[issue.selector],
                  })),
              ),
          }),
        },
      );
      update(r.version);
      mark(false);
      send({ type: "clear-history" });
      localStorage.setItem("review-author", author);
      toast("标注已保存，可导出给 Codex 修改源代码");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="review-workspace">
      <aside className="page-list">
        <div className="panel-title">
          页面与状态<span>{version.pages.length}</span>
        </div>
        {version.pages.map((p, n) => (
          <button
            key={p.id}
            className={`page-item ${p.id === pageId ? "active" : ""}`}
            onClick={() => changePage(p.id)}
          >
            <span className="page-number">
              {String(n + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{p.name}</strong>
              <small>
                {p.width} × {p.height}
                {version.issues.some(
                  (i) => i.pageId === p.id && i.status !== "passed",
                )
                  ? " · 有待处理标注"
                  : ""}
              </small>
            </span>
            {p.id === pageId && <ChevronRight size={14} />}
          </button>
        ))}
        <div className="page-list-bottom">
          <FileArchive size={17} />
          <span>
            {version.label}
            <small>{version.pages.length} 个页面状态</small>
          </span>
        </div>
      </aside>
      <section className="canvas-panel">
        <div className="canvas-toolbar">
          <div className="segmented">
            <button
              className={!mode ? "active" : ""}
              onClick={() => mode && toggleMode()}
            >
              <MousePointer2 size={14} />
              浏览
            </button>
            <button
              className={mode ? "active" : ""}
              onClick={() => !mode && toggleMode()}
            >
              <PenLine size={14} />
              标注
            </button>
          </div>
          <div className="canvas-tools">
            <Smartphone size={15} />
            <select
              aria-label="预览宽度"
              value={width || page.width}
              onChange={(e) => setWidth(Number(e.target.value))}
            >
              {[...new Set([page.width, 375, 390, 430])]
                .sort((a, b) => a - b)
                .map((w) => (
                  <option key={w} value={w}>
                    {w} px
                  </option>
                ))}
            </select>
            <a href={url} target="_blank" rel="noreferrer" title="独立打开预览">
              <ExternalLink size={15} />
            </a>
          </div>
        </div>
        <div className="canvas" ref={canvas}>
          <div className="preview-caption">
            <span className="dot" />
            {page.name}
            <span>
              {Math.round(scale * 100)}% · {mode ? "标注" : "预览"}
            </span>
          </div>
          <div
            className="preview-stage"
            style={{ width: frameWidth * scale, height: frameHeight * scale }}
          >
            <div
              className="device"
              style={{ width: frameWidth * scale, height: frameHeight * scale }}
            >
              {!ready && (
                <div className="preview-loading">
                  <Loader2 size={18} className="spin" />
                  正在载入预览
                </div>
              )}
              <iframe
                ref={frame}
                key={`${pageId}-${reloadKey}`}
                title={`${project.name} ${page.name}预览`}
                src={url}
                sandbox="allow-scripts allow-same-origin"
                style={{
                  width: frameWidth,
                  height: frameHeight,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
            <div className="annotation-layer" aria-label="预览标注">
              {issues.map((issue, index) => {
                const position = markerPosition(issue);
                if (!position) return null;
                const gutter = Math.max(
                  0,
                  (availableWidth - frameWidth * scale) / 2,
                );
                const left = Math.max(
                  -gutter + 18,
                  Math.min(
                    frameWidth * scale + gutter - 18,
                    position.left * scale,
                  ),
                );
                const top = (position.top - previewScrollY) * scale;
                return (
                  <button
                    key={issue.id}
                    className={"annotation-marker " + issue.status}
                    style={{ left, top }}
                    aria-label={"打开第 " + (index + 1) + " 条标注"}
                    aria-description={states[issue.status]}
                    aria-describedby={
                      hoveredMarker?.issue.id === issue.id
                        ? "annotation-tooltip"
                        : undefined
                    }
                    disabled={saving}
                    onPointerEnter={(event) =>
                      showMarkerText(event, issue, index + 1)
                    }
                    onPointerLeave={hideMarkerText}
                    onFocus={(event) => showMarkerText(event, issue, index + 1)}
                    onBlur={hideMarkerText}
                    onPointerDown={(event) => startMarkerDrag(event, issue)}
                    onPointerMove={(event) => moveMarkerDrag(event, issue)}
                    onPointerUp={(event) => endMarkerDrag(event)}
                    onPointerCancel={cancelMarkerDrag}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setHoveredMarker(null);
                        return;
                      }
                      const delta = {
                        ArrowLeft: [-1, 0],
                        ArrowRight: [1, 0],
                        ArrowUp: [0, -1],
                        ArrowDown: [0, 1],
                      }[event.key];
                      if (!delta) return;
                      event.preventDefault();
                      const step = event.shiftKey ? 10 : 1;
                      setPlacedMarkers((positions) => ({
                        ...positions,
                        [issue.selector]: {
                          left: position.left + (delta[0] * step) / scale,
                          top: position.top + (delta[1] * step) / scale,
                        },
                      }));
                      setHoveredMarker(null);
                      mark(true);
                    }}
                    onClick={() => {
                      if (suppressMarkerClick.current) {
                        suppressMarkerClick.current = false;
                        return;
                      }
                      if (!mode) {
                        setMode(true);
                        send({ type: "set-mode", enabled: true });
                      }
                      send({ type: "focus", selector: issue.selector });
                      setInspectorTab("note");
                    }}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="canvas-footnote">{page.note}</p>
        </div>
      </section>
      {hoveredMarker &&
        createPortal(
          <div
            id="annotation-tooltip"
            role="tooltip"
            className="annotation-tooltip"
            style={{
              left: hoveredMarker.left,
              top: hoveredMarker.top,
              transform: hoveredMarker.above ? "translateY(-100%)" : undefined,
            }}
            onPointerEnter={() => clearTimeout(tooltipTimer.current)}
            onPointerLeave={hideMarkerText}
          >
            <div className="annotation-tooltip-heading">
              <strong>标注 {hoveredMarker.number}</strong>
              <span>{states[hoveredMarker.issue.status]}</span>
            </div>
            <p>
              {patches.find(
                (patch) => patch.selector === hoveredMarker.issue.selector,
              )?.note ||
                hoveredMarker.issue.note ||
                "样式调整建议"}
            </p>
            <small>{hoveredMarker.issue.author}</small>
          </div>,
          document.body,
        )}
      <aside className="inspector">
        <div className="panel-title">
          <span>
            <PenLine size={16} />
            走查标注
          </span>
          <span className="small-count">{issues.length}</span>
        </div>
        <div className="inspector-tabs">
          <button
            className={inspectorTab === "note" ? "active" : ""}
            onClick={() => setInspectorTab("note")}
          >
            标注与调整
          </button>
          <button
            className={inspectorTab === "list" ? "active" : ""}
            onClick={() => setInspectorTab("list")}
          >
            本页记录 <span>{issues.length}</span>
          </button>
        </div>
        <div className="inspector-scroll">
          {inspectorTab === "list" ? (
            <>
              {issues.length ? (
                issues.map((issue) => (
                  <button
                    className="issue-mini"
                    key={issue.id}
                    onClick={() => {
                      if (!mode) {
                        setMode(true);
                        send({ type: "set-mode", enabled: true });
                      }
                      send({ type: "focus", selector: issue.selector });
                      setInspectorTab("note");
                    }}
                  >
                    <span className={`issue-state ${issue.status}`}>
                      {states[issue.status]}
                    </span>
                    <strong>{issue.note || issue.label}</strong>
                    <small>
                      {issue.author} · {date(issue.updatedAt)}
                    </small>
                  </button>
                ))
              ) : (
                <div className="inspector-empty">
                  <CheckCheck size={20} />
                  <h3>本页还没有标注</h3>
                </div>
              )}
            </>
          ) : selected ? (
            <>
              <div className="selected-layer">
                <span>已选择元素</span>
                <strong>{selected.label}</strong>
                <code>{selected.selector}</code>
                {selected.chain && selected.chain.length > 1 && (
                  <button
                    className="text-button"
                    onClick={() =>
                      send({
                        type: "select-parent",
                        selector: selected.selector,
                      })
                    }
                  >
                    选择父容器
                    <ArrowUpRight size={12} />
                  </button>
                )}
              </div>
              {selected.layer?.asset && (
                <div className="asset-reference">
                  <span>关联资源</span>
                  <code>{selected.layer.asset}</code>
                </div>
              )}
              <div className="inspector-section">
                <h3>修改意见</h3>
                <textarea
                  aria-label="修改意见"
                  placeholder="例如：用户名被裁剪，请按设计稿还原行高与容器高度。"
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    send({
                      type: "set-note",
                      selector: selected.selector,
                      note: e.target.value,
                    });
                  }}
                />
                <label className="author-field">
                  标注人
                  <input
                    value={author}
                    aria-label="标注人"
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </label>
              </div>
              <div className="inspector-section">
                <h3>
                  样式建议 <span>即时预览</span>
                </h3>
                <div className="property-grid">
                  {fields.map(([key, label]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        aria-label={label}
                        value={selected.styles[key] || ""}
                        onChange={(e) => style(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="inspector-empty">
              <MousePointer2 size={22} />
              <h3>{mode ? "未选择元素" : "当前为浏览模式"}</h3>
              {!mode && (
                <button className="button" onClick={toggleMode}>
                  <PenLine size={14} />
                  开启标注
                </button>
              )}
            </div>
          )}
        </div>
        <div className="inspector-footer">
          <div>
            <span className={dirty ? "unsaved" : ""}>
              {dirty ? "有未保存的标注" : "标注已同步"}
            </span>
            <button
              className="icon-button"
              title="撤销上一步样式调整"
              disabled={!dirty}
              onClick={() => send({ type: "undo-last" })}
            >
              <Undo2 size={15} />
            </button>
            {dirty && (
              <button
                className="text-button"
                onClick={() => {
                  mark(false);
                  setReady(false);
                  setSelected(null);
                  setReloadKey((n) => n + 1);
                }}
              >
                放弃未保存
              </button>
            )}
          </div>
          <button
            className="primary"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            保存标注
          </button>
        </div>
      </aside>
    </div>
  );
}
function IssueList({
  version,
  update,
  toast,
}: {
  version: Version;
  update: (v: Version) => void;
  toast: (s: string) => void;
}) {
  const [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState("");
  async function status(issue: Issue, value: string) {
    setBusy(issue.id);
    try {
      const r = await api<{ version: Version }>(
        `/api/versions/${version.id}/issues/${issue.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ revision: version.revision, status: value }),
        },
      );
      update(r.version);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="content-panel">
      <div className="section-heading">
        <div>
          <h2>走查记录</h2>
          <p>
            {version.label} · {version.issues.length} 条记录
          </p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">全部状态</option>
          {Object.entries(states).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {version.issues.filter((i) => filter === "all" || i.status === filter)
        .length ? (
        <div className="issue-table">
          {version.issues
            .filter((i) => filter === "all" || i.status === filter)
            .map((i, n) => (
              <div
                className={
                  "issue-row " + (i.status === "passed" ? "is-passed" : "")
                }
                key={i.id}
              >
                <span className="issue-index">
                  {String(n + 1).padStart(2, "0")}
                </span>
                <div>
                  <span className="issue-page">
                    {version.pages.find((p) => p.id === i.pageId)?.name}
                  </span>
                  <h3>{i.note || "样式调整建议"}</h3>
                  <code>{i.selector}</code>
                  {Object.keys(i.styles).length > 0 && (
                    <div className="style-tags">
                      {Object.entries(i.styles).map(([k, v]) => (
                        <span key={k}>
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                  <small>
                    {i.author} · {date(i.updatedAt)}
                  </small>
                </div>
                <button
                  className={
                    "issue-check " + (i.status === "passed" ? "checked" : "")
                  }
                  type="button"
                  disabled={!!busy}
                  aria-label={
                    (i.status === "passed" ? "恢复" : "确认") +
                    "第 " +
                    (n + 1) +
                    " 条标注"
                  }
                  title={i.status === "passed" ? "恢复待处理" : "确认已完成"}
                  onClick={() =>
                    void status(i, i.status === "passed" ? "todo" : "passed")
                  }
                >
                  {i.status === "passed" ? <Check size={15} /> : null}
                </button>
              </div>
            ))}
        </div>
      ) : (
        <div className="large-empty">
          <MessageSquare size={24} />
          <h3>暂无走查记录</h3>
        </div>
      )}
    </div>
  );
}
function Delivery({
  project,
  version,
  toast,
  setWorkflow,
  busy,
  exportFeedback,
}: {
  project: Project;
  version: Version;
  toast: (s: string) => void;
  setWorkflow: (status: WorkflowStatus) => Promise<void>;
  busy: boolean;
  exportFeedback: (event: React.MouseEvent<HTMLAnchorElement>) => Promise<void>;
}) {
  const [doc, setDoc] = useState(""),
    [title, setTitle] = useState("");
  const shareUrl = `${window.location.origin}/share/${version.id}`;
  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("分享链接已复制，技术打开后无需登录");
    } catch {
      toast(shareUrl);
    }
  }
  async function read(file: string) {
    try {
      const r = await fetch(
        `/api/versions/${version.id}/document?path=${encodeURIComponent(file)}`,
      );
      if (!r.ok) throw Error("无法读取文档");
      setDoc(await r.text());
      setTitle(file);
    } catch (e) {
      toast((e as Error).message);
    }
  }
  const docs = version.files.filter((f) => /\.(md|txt)$/i.test(f.path));
  return (
    <div className="content-panel">
      <div className="section-heading">
        <div>
          <h2>交付文件</h2>
          <p>
            {project.name} · {version.label} · {version.files.length} 个文件 ·{" "}
            {bytes(version.archiveSize)}
          </p>
        </div>
        <div className="section-heading-actions">
          <button className="button" type="button" onClick={() => void copyShareUrl()}>
            <Share2 size={15} />
            复制分享链接
          </button>
          <Badge status={version.status} />
        </div>
      </div>
      <div className="workflow-panel">
        <div className="workflow-panel-heading">
          <div>
            <span className="eyebrow">CODEX FEEDBACK LOOP</span>
            <h3>反馈闭环</h3>
          </div>
          <WorkflowBadge status={workflowStatus(version)} />
        </div>
        <div className="workflow-steps">
          {([
            ["reviewing", "走查"],
            ["exported", "导出反馈"],
            ["fixing", "Codex 修复"],
            ["ready", "上传待复查"],
          ] as [WorkflowStatus, string][]).map(([key, label], index) => {
            const currentIndex = ["reviewing", "exported", "fixing", "ready"].indexOf(
              workflowStatus(version),
            );
            return (
              <button
                className={`workflow-step ${
                  index <= currentIndex ? "complete" : ""
                } ${key === workflowStatus(version) ? "current" : ""}`}
                key={key}
                type="button"
                disabled={busy}
                onClick={() => void setWorkflow(key)}
              >
                <span>{index + 1}</span>
                {label}
              </button>
            );
          })}
        </div>
        <p className="workflow-copy">
          导出走查包后，Codex 按 `visual-edits.json` 修复源代码；上传新版本会自动进入待复查。
        </p>
      </div>
      <div className="download-grid">
        <button className="download-card share-card" type="button" onClick={() => void copyShareUrl()}>
          <span><Share2 size={25} /></span>
          <h3>只读交付页</h3>
          <p>页面、预览、Figma 和走查内容的可转发链接</p>
          <strong>复制分享链接 <ArrowUpRight size={16} /></strong>
        </button>
        <a
          className="download-card"
          href={`/api/versions/${version.id}/download`}
        >
          <span>
            <Package size={25} />
          </span>
          <h3>完整交付包</h3>
          <p>原始上传内容，包含预览与项目文件</p>
          <strong>
            下载 ZIP
            <ArrowDownToLine size={16} />
          </strong>
        </a>
        {version.sourceArchive && (
          <a
            className="download-card"
            href={`/api/versions/${version.id}/download?kind=source`}
          >
            <span>
              <Code2 size={25} />
            </span>
            <h3>前端源代码</h3>
            <p>对应当前预览版本的独立源码包</p>
            <strong>
              下载源码
              <ArrowDownToLine size={16} />
            </strong>
          </a>
        )}
        <a
          className="download-card"
          href={`/api/versions/${version.id}/feedback`}
          onClick={(event) => void exportFeedback(event)}
        >
          <span>
            <ClipboardList size={25} />
          </span>
          <h3>走查反馈包</h3>
          <p>修改清单与元素定位，交给 Codex 继续修复</p>
          <strong>
            导出 {version.issues.length} 条标注
            <ArrowDownToLine size={16} />
          </strong>
        </a>
      </div>
      <div className="delivery-note">
        <ShieldCheck size={18} />
        <div>
          <strong>下载的是归档原件</strong>
          <p>
            在线样式建议保存在走查反馈中，原始文件不会被覆盖。修复由 Codex
            合并，作为新版本上传。
          </p>
        </div>
      </div>
      <h3 className="files-heading">项目说明</h3>
      {docs.length ? (
        docs.map((f) => (
          <button
            className="document-row"
            key={f.path}
            onClick={() => void read(f.path)}
          >
            <FileText size={18} />
            <span>{f.path}</span>
            <small>{bytes(f.size)}</small>
            <ChevronRight size={15} />
          </button>
        ))
      ) : (
        <p className="muted">此交付包未包含 Markdown 或文本说明。</p>
      )}
      <details className="file-details">
        <summary>查看全部 {version.files.length} 个文件</summary>
        {version.files.map((f) => (
          <div key={f.path}>
            <code>{f.path}</code>
            <span>{bytes(f.size)}</span>
          </div>
        ))}
      </details>
      {title && (
        <div className="modal-backdrop">
          <section className="modal document-modal">
            <div className="modal-heading">
              <h2>{title}</h2>
              <button
                className="icon-button"
                title="关闭文档"
                aria-label="关闭文档"
                onClick={() => setTitle("")}
              >
                <X size={20} />
              </button>
            </div>
            <pre>{doc}</pre>
          </section>
        </div>
      )}
    </div>
  );
}
function UploadDialog({
  project,
  latest,
  close,
  done,
}: {
  project?: Project;
  latest?: Version;
  close: () => void;
  done: (v: Version) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [name, setName] = useState(project?.name || ""),
    [label, setLabel] = useState(""),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function pick(f?: File) {
    if (!f) return;
    const extension = f.name.toLowerCase().split(".").pop();
    if (extension !== "zip" && extension !== "html" && extension !== "htm") {
      setError("请选择 ZIP 交付包或 HTML 文件");
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setError("交付包需小于 100MB");
      return;
    }
    setError("");
    setFile(f);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("请先选择交付包");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    if (project) form.append("projectId", project.id);
    if (name.trim()) form.append("name", name.trim());
    if (label.trim()) form.append("label", label.trim());
    if (notes.trim()) form.append("notes", notes.trim());
    try {
      const r = await api<{ version: Version }>("/api/import", {
        method: "POST",
        body: form,
      });
      await done(r.version);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <h2>{project ? "上传新版本" : "创建项目交付"}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="关闭上传窗口"
            aria-label="关闭上传窗口"
            disabled={busy}
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <p className="modal-description">
          可上传 Codex 交付 ZIP，也可以直接上传技术给你的单个 HTML 做二次走查。
        </p>
        <label className="form-label">
          项目名称
          <input
            required={!project}
            disabled={!!project || busy}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：幸运霸主"
            maxLength={120}
          />
        </label>
        <div
          className={`dropzone ${drag ? "dragging" : ""} ${file ? "has-file" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!busy) pick(e.dataTransfer.files[0]);
          }}
        >
          <input
            ref={input}
            type="file"
            aria-label="选择交付 ZIP 或 HTML"
            accept=".zip,.html,.htm"
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <UploadCloud size={32} />
          <strong>{file ? file.name : "拖入 ZIP / HTML，或点击选择文件"}</strong>
          <span>
            {file
              ? bytes(file.size)
              : "ZIP 交付包，或资源已内联的单个 HTML · 最大 100MB"}
          </span>
        </div>
        <div className="form-row">
          <label className="form-label">
            版本名称
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                latest
                  ? `上个版本：${latest.label}`
                  : "留空则读取交付清单，如 v1"
              }
              maxLength={80}
            />
          </label>
        </div>
        <label className="form-label">
          这次更新了什么
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="例如：修复昵称裁剪，补充规则弹窗交互"
            rows={3}
            maxLength={10000}
          />
        </label>
        <div className="form-tip">
            <FileArchive size={16} />
            <span>
            单个 HTML 如果依赖旁边的图片、CSS 或 JS，请把 HTML 和资源一起打成 ZIP；完整资源会随版本保存，请排除 node_modules、密钥和无关文件。
          </span>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button type="submit" className="primary" disabled={busy || !file}>
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <UploadCloud size={16} />
            )}{" "}
            {busy ? "正在上传并检查资源…" : "上传并打开预览"}
          </button>
        </div>
      </form>
    </div>
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [code, setCode] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="login-screen">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/login", {
              method: "POST",
              body: JSON.stringify({ code }),
            });
            onLogin();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <span className="brand-icon">
          <Layers size={24} />
        </span>
        <h1>登录交付空间</h1>
        <p>海外 H5 · 团队工作空间</p>
        <input
          type="password"
          aria-label="团队访问码"
          placeholder="团队访问码"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <p className="form-error">{error}</p>}
        <button className="primary">
          进入工作空间
          <ArrowUpRight size={16} />
        </button>
      </form>
    </div>
  );
}
function Guide() {
  return (
    <div className="guide">
      <h1>使用指南</h1>
      {[
        [
          "01",
          "上传交付包",
          "代码继续在 Codex 中制作。将预览 HTML、图片字体和源码打成 ZIP；技术临时给你的资源已内联 HTML 也可以直接上传，在项目里选择「上传新版本」后继续走查。React 项目需要先构建预览。",
        ],
        [
          "02",
          "预览与标注",
          "打开真实 H5 测试按钮和滚动。切换「标注」模式，点击有问题的元素，写明修改意见，也可以调整样式查看效果。点击「保存标注」，同事刷新后可见。",
        ],
        [
          "03",
          "复查与交付",
          "导出走查反馈包给 Codex，修复后上传新的版本。原版本及标注继续保留。复查通过后，确认交付，前端下载该版本的代码。",
        ],
      ].map(([n, title, body]) => (
        <section key={n}>
          <span>{n}</span>
          <div>
            <h2>{title}</h2>
            <p>{body}</p>
          </div>
        </section>
      ))}
      <div className="guide-note">
        <ShieldCheck size={22} />
        <div>
          <h3>版本与归档</h3>
          <p>
            页面与弹窗由交付清单列出；标注按版本和页面保存；预览的样式调整是修改建议；原始交付包不会被网站改写。新版本需要重新验收。
          </p>
        </div>
      </div>
    </div>
  );
}
