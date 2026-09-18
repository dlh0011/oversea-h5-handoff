# Lucky Boss H5 前端交付包

## 运行

在本目录启动静态服务器：

```bash
python3 -m http.server 4173
```

打开 `http://127.0.0.1:4173/standalone.html`。

## 状态

- 默认态：有人上榜
- `#leaderboard`：今日霸主榜单
- `#leaderboard-yesterday`：昨日霸主榜单
- 规则按钮：当前交付版本尚未接入规则弹窗（待完成）
- 默认态点击历史霸主打开历史弹窗

## 目录

- `standalone.html`：页面入口
- `standalone.js`：状态切换与交互
- `states.css`、`text-styles.css`：页面样式
- `assets/`：Figma 导出的 2x 图片资源

## 资源清理

仅保留 HTML、CSS、JS 引用的切图及字体，包含 JS 中 Today/Yesterday 切换资源。原始图片像素与尺寸保持不变；源项目保留完整原图。
