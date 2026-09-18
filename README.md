# 海外 H5 交付站

这是一个给设计同事和前端同事使用的交付站：**代码继续在 Codex 里生成，网站负责归档、预览、标注、复查和下载**。它不在网页端生成代码，也不会覆盖上传的原始交付包。

团队默认采用局域网交付：由一台固定电脑运行交付站，同事通过内网地址访问；GitHub Pages 只作为可选的只读备份，不是日常工作入口。

## 使用方式

```bash
npm install
npm run build
HANDOFF_ACCESS_CODE='团队访问码（部署到局域网时设置）' npm start
```

本地开发：

```bash
npm run dev
```

默认管理站：`http://127.0.0.1:4328`，预览服务：`http://127.0.0.1:4329`。

在运行服务的这台电脑上访问 `127.0.0.1:4328`、`localhost:4328` 或 `::1:4328` 时会自动免登录；同事通过局域网 IP 或域名访问时仍需要输入 `HANDOFF_ACCESS_CODE`。

## 分享交付页

在版本的“交付文件”页点击“复制分享链接”，得到：

```text
http://<站点地址>/share/<版本ID>
```

这个链接是只读交付页，不要求技术同事登录管理站。页面包含页面状态、真实 H5 预览、Figma 链接、已保存的走查气泡内容和交付 ZIP 下载。左侧切换页面时，中间 iframe 会切换到对应 H5 状态；右侧反馈清单会保留当前版本的待修改、待复查和已通过记录。

分享页读取当前版本归档，不会把标注建议伪装成源代码修改。Codex 继续在代码侧修复，修复后上传新版本并重新分享新版本链接。

分享给技术时，直接发送 `http://内网IP:4328/share/<版本ID>`。分享页不要求登录；只有需要上传、标注、修改走查状态时才进入管理站并输入团队访问码。

局域网部署时至少设置：

```bash
HOST=0.0.0.0
HANDOFF_ACCESS_CODE='至少 12 位的团队访问码'
```

将 `HANDOFF_DATA_DIR` 指到持久磁盘目录。不要把 `data/` 提交到代码仓库；它包含项目目录、版本和上传文件。

## 部署成同事可打开的网站

这个项目不是只能在 `127.0.0.1` 打开的页面，而是一个需要 Node 服务和持久化磁盘的交付站。管理站和 H5 预览服务必须一起部署，分享页才会在其他电脑上正常显示真实 H5。

### Docker 部署

在部署机器上复制 `.env.example` 为 `.env`（不要提交到仓库）：

```env
SITE_ORIGIN=http://192.168.6.27:4328
PREVIEW_ORIGIN=http://192.168.6.27:4329
HANDOFF_ACCESS_CODE=替换为至少12位的团队访问码
```

把两个地址中的 IP 换成部署机器在公司内网的 IP，然后执行：

```bash
docker compose up -d --build
```

同事打开 `http://内网IP:4328`，输入访问码即可使用；版本分享链接是 `http://内网IP:4328/share/<版本ID>`。`./data` 会挂载到容器并持续保存项目、版本和标注，升级容器不会丢数据。

### 不使用 Docker

```bash
npm install
npm run build
HOST=0.0.0.0 \
SITE_ORIGIN=http://内网IP:4328 \
PREVIEW_ORIGIN=http://内网IP:4329 \
HANDOFF_ACCESS_CODE='至少12位的团队访问码' \
npm start
```

如果需要公网访问，还需要把 4328、4329 反向代理到一个公司域名，并将 `SITE_ORIGIN` 和 `PREVIEW_ORIGIN` 改成实际的 HTTPS 地址。当前工程没有绑定具体云厂商，因此不会把域名、账号或密钥写死在项目里。

## 免费发布到 GitHub Pages

GitHub Pages 适合发布只读交付快照，不运行管理站 API。导出当前版本：

```bash
npm run export:pages -- <版本ID>
```

脚本会生成 `site/`，包含静态交付页、真实 H5 资源、标注清单、版本数据和完整交付 ZIP。将 `site/` 提交到 GitHub 后，仓库里的 `.github/workflows/pages.yml` 会自动发布；第一次使用时在仓库 Settings → Pages 中将 Source 设为 GitHub Actions。

公开地址通常是：

```text
https://<账号>.github.io/<仓库名>/
```

静态页不会保存新的标注。标注更新后重新运行导出脚本并推送 `site/`，GitHub Actions 会重新发布最新快照。

## Codex 交付包

上传 ZIP。最简单的包结构：

```text
handoff.json          # 推荐，列出页面/状态和设计链接
standalone.html       # 或构建后的 index.html
assets/
styles.css
standalone.js
source.zip            # 可选，给前端下载的源码包
```

`handoff.json` 示例：

```json
{
  "schemaVersion": 1,
  "name": "幸运霸主",
  "version": "v1",
  "figmaUrl": "https://www.figma.com/design/…",
  "previewRoot": ".",
  "sourceArchive": "source.zip",
  "pages": [
    {"id":"home","name":"活动首页","path":"standalone.html","width":402,"height":903},
    {"id":"leaderboard","name":"今日榜单","path":"standalone.html#leaderboard","width":402,"height":1367}
  ]
}
```

React 项目应先构建为相对路径预览再上传：`vite build --base=./`。上传检查会拒绝 `node_modules`、`.git`、环境配置、越界资源、缺失图片/字体和重复版本号。

### 图片体积优化

Figma 导出的 `@2x` 图片可以在打包前做无损 PNG 重编码，保留原始像素和尺寸，只优化压缩流：

```bash
npm run optimize:png -- <交付目录>
npm run pack -- <交付目录> <输出ZIP> [handoff.json]
```

优化命令只会替换体积更小的 PNG，不会降低分辨率或改变图片内容。当前示例版本已完成这一步，预览资源和下载 ZIP 使用的是压缩后的图片。

## 走查规则

- “浏览”模式操作真实 H5；“标注”模式点击元素、写意见和调整样式。
- 保存后的样式只是给 Codex 的修改建议，网站不会伪装成已修改源代码。
- 在“走查记录”里更新待修改、待复查、已通过；导出反馈包交给 Codex。
- 导出反馈包后将版本推进到“已导出给 Codex”，可在交付页标记“Codex 修复中”；Codex 修复后上传新版本自动进入“待复查”。
- Codex 修复后上传新版本；预览、标注和下载始终绑定同一个版本。
- 原始上传包保留，旧版本不会被新版本覆盖。

## 目录

- `src/`：交付站界面与预览走查面板
- `server/`：ZIP 导入、版本目录、预览隔离、标注 API
- `server/share.ts`：只读交付分享页 HTML 生成器
- `shared/`：目录和版本类型
- `scripts/`：交付包辅助脚本
