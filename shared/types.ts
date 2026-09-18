export type Page = {
  id: string;
  name: string;
  path: string;
  width: number;
  height: number;
  note?: string;
};
export type Patch = {
  selector: string;
  label: string;
  styles: Record<string, string>;
  note?: string;
  position?: { left: number; top: number };
};
export type Issue = Patch & {
  id: string;
  pageId: string;
  author: string;
  status: "todo" | "recheck" | "passed";
  createdAt: string;
  updatedAt: string;
};
export type WorkflowStatus = "reviewing" | "exported" | "fixing" | "ready";
export type FileEntry = { path: string; size: number };
export type Version = {
  id: string;
  projectId: string;
  label: string;
  notes: string;
  createdAt: string;
  previewKey: string;
  previewRoot: string;
  pages: Page[];
  files: FileEntry[];
  sourceArchive?: string;
  archiveSize: number;
  status: "reviewing" | "approved";
  workflowStatus?: WorkflowStatus;
  revision: number;
  issues: Issue[];
};
export type Project = {
  id: string;
  name: string;
  figmaUrl: string;
  createdAt: string;
};
export type Snapshot = { projects: Project[]; versions: Version[] };
export type Manifest = {
  schemaVersion: 1;
  name: string;
  version: string;
  notes?: string;
  figmaUrl?: string;
  previewRoot?: string;
  sourceArchive?: string;
  pages: Page[];
};
