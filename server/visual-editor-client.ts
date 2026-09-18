// Adapted from the existing overseas visual inspector; original remains unchanged.
export const visualEditorClient = String.raw`
(() => {
  if (window.__overseaVisualEditorLoaded) return;
  window.__overseaVisualEditorLoaded = true;

  const editableStyleKeys = [
    "left",
    "top",
    "position",
    "width",
    "height",
    "fontSize",
    "lineHeight",
    "letterSpacing",
    "color",
    "fontWeight",
    "backgroundColor",
    "background",
    "backgroundImage",
    "backgroundClip",
    "WebkitBackgroundClip",
    "WebkitTextFillColor",
    "border",
    "borderColor",
    "borderWidth",
    "borderStyle",
    "boxShadow",
    "textShadow",
    "WebkitTextStrokeWidth",
    "WebkitTextStrokeColor",
    "borderRadius",
    "opacity",
    "display",
    "flexDirection",
    "justifyContent",
    "alignItems",
    "gap",
    "padding",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "rowGap",
    "columnGap",
    "paddingBlock",
    "paddingInline",
    "flexWrap",
    "gridTemplateColumns",
    "textAlign",
  ];
  const state = {
    enabled: false,
    selected: null,
    patches: [],
    originals: new Map(),
    history: [],
  };

  const root = document.createElement("div");
  root.id = "oversea-visual-editor";
  root.innerHTML = [
    '<style>',
    '#oversea-visual-editor{position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1f2522}',
    '#ove-box{position:absolute;border:2px solid #19a463;background:rgba(25,164,99,.08);box-shadow:0 0 0 9999px rgba(0,0,0,.03);display:none;pointer-events:none}',
    '.ove-handle{position:absolute;z-index:2;width:10px;height:10px;display:none;border:2px solid #fff;border-radius:50%;background:#19a463;box-shadow:0 0 0 1px #167c4b;pointer-events:auto;touch-action:none}.ove-handle[data-dir="n"],.ove-handle[data-dir="s"]{cursor:ns-resize}.ove-handle[data-dir="e"],.ove-handle[data-dir="w"]{cursor:ew-resize}.ove-handle[data-dir="ne"],.ove-handle[data-dir="sw"]{cursor:nesw-resize}.ove-handle[data-dir="nw"],.ove-handle[data-dir="se"]{cursor:nwse-resize}',
    '#ove-launch{display:none!important}#ove-panel{display:none!important}',
    '#ove-panel-header{display:flex;align-items:center;gap:6px;margin:-3px -3px 7px;padding:3px;cursor:grab;touch-action:none}#ove-panel-header:active{cursor:grabbing}#ove-panel h3{margin:0;font-size:12px;line-height:1.2}#ove-target{font-size:10px;color:#65706a;margin-bottom:8px;word-break:break-all}',
    '.ove-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.ove-field{min-width:0}.ove-field label{display:block;font-size:9px;color:#66716a;margin:0 0 2px}.ove-field input{box-sizing:border-box;width:100%;height:26px;border:1px solid #d7ddd8;border-radius:5px;background:#fff;padding:0 6px;font-size:11px;color:#1e2521}',
    '.ove-note{width:100%;min-height:54px;box-sizing:border-box;resize:vertical;border:1px solid #d7ddd8;border-radius:5px;background:#fff;padding:6px;font:11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1e2521;margin-top:7px}.ove-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.ove-actions button,.ove-download{height:28px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:#235f43;color:#fff;font-size:11px;font-weight:700;cursor:pointer;padding:0 9px;text-decoration:none}.ove-actions button.secondary{background:#e9eee9;color:#37423b}.ove-download{background:#e9eee9;color:#37423b}.ove-mode{margin-left:auto;background:#e9eee9!important;color:#37423b!important}.ove-mode.active{background:#235f43!important;color:#fff!important}#ove-collapse{margin-left:0}',
    '.ove-hint{margin-top:7px;font-size:9px;line-height:1.45;color:#7a837e}',
    '</style>',
    '<div id="ove-box"></div>',
    '<button id="ove-launch" title="展开标注编辑面板" aria-label="展开标注编辑面板">Edit</button>',
    '<div id="ove-panel">',
    '<div id="ove-panel-header"><h3>预览标注编辑</h3><button class="ove-mode active" id="ove-pick" title="切换元素选择或正常浏览">选择</button><button class="ove-mode" id="ove-collapse" title="收起编辑面板">收起</button></div>',
    '<div id="ove-target">点击页面元素开始调整</div>',
    '<div class="ove-grid" id="ove-controls"></div>',
    '<textarea class="ove-note" id="ove-note" placeholder="添加走查批注（可选）"></textarea>',
    '<div class="ove-actions"><button id="ove-save">保存改动</button><button class="secondary" id="ove-undo">撤销当前</button><button class="secondary" id="ove-clear">清空选择</button><a class="ove-download" id="ove-download" hidden>下载交接包</a></div>',
    '<div class="ove-hint">选择模式下点击元素即可编辑。切换到浏览后可正常操作页面；保存会写入当前项目的样式覆盖和走查记录。</div>',
    '</div>',
  ].join("");
  document.documentElement.appendChild(root);

  const handleDirections = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const handles = handleDirections.map((direction) => {
    const handle = document.createElement("div");
    handle.className = "ove-handle";
    handle.dataset.dir = direction;
    root.appendChild(handle);
    return handle;
  });

  const box = root.querySelector("#ove-box");
  const targetText = root.querySelector("#ove-target");
  const controls = root.querySelector("#ove-controls");
  const noteInput = root.querySelector("#ove-note");
  const launchButton = root.querySelector("#ove-launch");
  const panel = root.querySelector("#ove-panel");
  const query = new URLSearchParams(window.location.search);
  const reviewId = query.get("reviewId") || "";
  const downloadLink = root.querySelector("#ove-download");
  if (reviewId) {
    downloadLink.hidden = false;
    downloadLink.href = "/api/html-reviews/" + encodeURIComponent(reviewId) + "/export";
  }

  function kebab(key) {
    return key.replace(/[A-Z]/g, (value) => "-" + value.toLowerCase());
  }

  function makeDraggable(handle, target, onDragged) {
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const rect = target.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
      target.style.left = rect.left + "px";
      target.style.top = rect.top + "px";
      target.style.right = "auto";
      target.style.bottom = "auto";
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const left = drag.left + event.clientX - drag.x;
      const top = drag.top + event.clientY - drag.y;
      const rect = target.getBoundingClientRect();
      target.style.left = Math.max(0, Math.min(window.innerWidth - rect.width, left)) + "px";
      target.style.top = Math.max(0, Math.min(window.innerHeight - rect.height, top)) + "px";
      if (Math.abs(event.clientX - drag.x) > 4 || Math.abs(event.clientY - drag.y) > 4) drag.moved = true;
    });
    handle.addEventListener("pointerup", (event) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      if (moved && onDragged) onDragged();
    });
  }

  function cssPath(element) {
    if (!(element instanceof Element)) return "";
    const editId = element.getAttribute("data-edit-id");
    if (editId) return '[data-edit-id="' + editId.replace(/"/g, '\\"') + '"]';
    if (element.id) return "#" + CSS.escape(element.id);
    const classes = Array.from(element.classList || []).filter((name) => !name.startsWith("ove-"));
    if (classes.length) {
      const candidate = "." + classes.map((name) => CSS.escape(name)).join(".");
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    }
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 5) {
      const parent = node.parentElement;
      const tag = node.tagName.toLowerCase();
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const siblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
      const index = siblings.indexOf(node) + 1;
      parts.unshift(tag + ":nth-of-type(" + index + ")");
      node = parent;
    }
    return parts.join(" > ");
  }

  function valueFor(element, key) {
    const computed = window.getComputedStyle(element);
    const inline = element.style[key];
    return inline || computed.getPropertyValue(kebab(key));
  }

  function visibleCssValue(value) {
    if (!value) return false;
    const normalized = String(value).trim();
    return normalized
      && normalized !== "normal"
      && normalized !== "auto"
      && normalized !== "none"
      && normalized !== "0px"
      && normalized !== "rgba(0, 0, 0, 0)"
      && normalized !== "transparent";
  }

  function inspectEntries(element, keys) {
    return keys
      .map((key) => [key, valueFor(element, key)])
      .filter(([, value]) => visibleCssValue(value));
  }

  function isTransparentColor(value) {
    return !value || value === "transparent" || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/i.test(value);
  }

  function addToken(tokens, type, value) {
    if (!value || isTransparentColor(value)) return;
    const normalized = String(value).trim();
    if (!tokens.some((item) => item.type === type && item.value === normalized)) tokens.push({ type, value: normalized });
  }

  function currentColorTokens(element) {
    if (element instanceof HTMLImageElement || assetFor(element)) return [];
    const computed = window.getComputedStyle(element);
    const tokens = [];
    const text = (element.textContent || "").trim();
    const backgroundImage = computed.backgroundImage || "";
    if (text) {
      addToken(tokens, "Text", computed.color);
      if (Number.parseFloat(computed.webkitTextStrokeWidth || "0") > 0) {
        addToken(tokens, "Stroke", computed.webkitTextStrokeColor);
      }
      const shadowMatch = (computed.textShadow || "").match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/i);
      if (shadowMatch) addToken(tokens, "Shadow", shadowMatch[0]);
      if (/gradient\(/i.test(backgroundImage)) addToken(tokens, "Text gradient", backgroundImage);
    } else {
      if (/gradient\(/i.test(backgroundImage)) addToken(tokens, "Fill gradient", backgroundImage);
      addToken(tokens, "Fill", computed.backgroundColor);
    }
    if (Number.parseFloat(computed.borderTopWidth || "0") > 0) addToken(tokens, "Stroke", computed.borderTopColor);
    return tokens.slice(0, 8);
  }

  function inspectMeta(element) {
    const layoutKeys = ["display", "position", "left", "top", "width", "height", "flexDirection", "justifyContent", "alignItems", "gap", "padding", "borderRadius"];
    const typographyKeys = ["fontFamily", "fontSize", "fontStyle", "fontWeight", "lineHeight", "letterSpacing", "textAlign"];
    const styleKeys = [
      "color",
      "background",
      "backgroundColor",
      "backgroundImage",
      "backgroundClip",
      "WebkitBackgroundClip",
      "WebkitTextFillColor",
      "border",
      "borderWidth",
      "borderStyle",
      "borderColor",
      "boxShadow",
      "textShadow",
      "WebkitTextStrokeWidth",
      "WebkitTextStrokeColor",
      "opacity",
    ];
    return {
      isImage: element instanceof HTMLImageElement || Boolean(assetFor(element)),
      hasText: Boolean((element.textContent || "").trim()),
      groups: {
        layout: inspectEntries(element, layoutKeys),
        typography: inspectEntries(element, typographyKeys),
        style: inspectEntries(element, styleKeys),
      },
      colors: currentColorTokens(element),
    };
  }

  function updateBox() {
    if (!state.selected) {
      box.style.display = "none";
      handles.forEach((handle) => { handle.style.display = "none"; });
      return;
    }
    const rect = state.selected.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = rect.left + "px";
    box.style.top = rect.top + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
    handles.forEach((handle) => {
      const direction = handle.dataset.dir || "";
      const left = direction.includes("e") ? rect.right : direction.includes("w") ? rect.left : rect.left + rect.width / 2;
      const top = direction.includes("s") ? rect.bottom : direction.includes("n") ? rect.top : rect.top + rect.height / 2;
      handle.style.display = "block";
      handle.style.left = left - 5 + "px";
      handle.style.top = top - 5 + "px";
    });
  }

  function post(type, extra) {
    window.parent.postMessage({
      source: "oversea-visual-editor",
      type,
      previewPath: new URLSearchParams(window.location.search).get("previewPath") || "",
      reviewId: reviewId || undefined,
      patches: state.patches,
      canUndo: state.history.length > 0,
      selected: state.selected ? {
        selector: cssPath(state.selected),
        label: labelFor(state.selected),
        styles: Object.fromEntries(editableStyleKeys.map((key) => [key, valueFor(state.selected, key)])),
        rect: (() => {
          const rect = state.selected.getBoundingClientRect();
          return { left: rect.left + window.scrollX, top: rect.top + window.scrollY, width: rect.width, height: rect.height };
        })(),
        colors: currentColorTokens(state.selected).map((item) => item.value),
        layout: layoutMeta(state.selected),
        inspect: inspectMeta(state.selected),
        layer: layerInfo(state.selected, true, 0),
        chain: layerChain(state.selected),
      } : null,
      ...(extra || {}),
    }, window.__HANDOFF_HOST_ORIGIN__);
  }

  function measureSelectors(selectors) {
    const measurements = {};
    (Array.isArray(selectors) ? selectors : []).forEach((selector) => {
      let element;
      try { element = document.querySelector(selector); } catch { return; }
      if (!(element instanceof HTMLElement)) return;
      const rect = element.getBoundingClientRect();
      measurements[selector] = {
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    });
    post("measured", { measurements, scrollY: window.scrollY });
  }

  window.addEventListener("scroll", () => {
    if (state.patches.length) measureSelectors(state.patches.map((patch) => patch.selector));
  }, { passive: true });

  function pageColors() {
    const colors = new Set();
    const properties = ["color", "backgroundColor", "borderTopColor"];
    document.querySelectorAll("body *").forEach((element) => {
      if (root.contains(element) || colors.size >= 24) return;
      const computed = window.getComputedStyle(element);
      properties.forEach((property) => {
        const value = computed[property];
        if (/^rgba?\(/.test(value) && !/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(value)) colors.add(value);
      });
    });
    return Array.from(colors);
  }

  async function saveChanges() {
    if (window.parent !== window) {
      post("save-requested");
      return;
    }
    const button = root.querySelector("#ove-save");
    button.disabled = true;
    button.textContent = "保存中...";
    try {
      const response = await fetch("/api/visual-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          previewPath: query.get("previewPath") || "",
          reviewId: reviewId || undefined,
          patches: state.patches,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "保存失败");
      button.textContent = "已保存";
      setTimeout(() => { button.textContent = "保存改动"; }, 1600);
    } catch (error) {
      button.textContent = error instanceof Error ? error.message : "保存失败";
    } finally {
      button.disabled = false;
    }
  }

  function labelFor(element) {
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    return [
      element.tagName.toLowerCase(),
      element.id ? "#" + element.id : "",
      element.className && typeof element.className === "string" ? "." + element.className.trim().split(/\s+/).slice(0, 3).join(".") : "",
      text ? ' "' + text.slice(0, 24) + '"' : "",
    ].join("");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  }

  function assetHints() {
    const hints = window.__OVERSEA_ASSET_HINTS__;
    return hints && typeof hints === "object" ? hints : { classMap: {}, classLists: {}, selectorMap: {} };
  }

  function assetFromClassList(element, className, assets) {
    if (!Array.isArray(assets) || !assets.length) return "";
    const peers = Array.from(document.querySelectorAll("." + CSS.escape(className)))
      .filter((item) => item instanceof Element && !root.contains(item));
    const index = Math.max(0, peers.indexOf(element));
    return assets[Math.min(index, assets.length - 1)] || assets[0] || "";
  }

  function hintedAssetForElement(element) {
    const direct = element.getAttribute("data-asset") || element.getAttribute("data-src");
    if (direct) return direct;
    const hints = assetHints();
    const selectorMap = hints.selectorMap || {};
    const classMap = hints.classMap || {};
    const classLists = hints.classLists || {};
    const selector = cssPath(element);
    if (selectorMap[selector]) return selectorMap[selector];
    for (const className of Array.from(element.classList || [])) {
      const listed = assetFromClassList(element, className, classLists[className]);
      if (listed) return listed;
      if (classMap[className]) return classMap[className];
    }
    let node = element.parentElement;
    while (node && node !== document.body) {
      for (const className of Array.from(node.classList || [])) {
        if (classMap[className]) return classMap[className];
      }
      node = node.parentElement;
    }
    return "";
  }

  function scriptAssetForElement(element) {
    const classNames = Array.from(element.classList || []).filter(Boolean);
    if (!classNames.length) return "";
    const source = Array.from(document.scripts || []).map((script) => script.textContent || "").join("\\n");
    if (!source) return "";
    for (const className of classNames) {
      const escaped = escapeRegExp(className);
      const patterns = [
        new RegExp('className:["\\\\\'][^"\\\\\']*\\\\b' + escaped + '\\\\b[^"\\\\\']*["\\\\\'][\\\\s\\\\S]{0,900}?src:[^,}]*[a-zA-Z_$][\\\\w$]*\\\\(["\\\\\']([^"\\\\\']+\\\\.(?:png|jpg|jpeg|webp|gif|svg))["\\\\\']\\\\)'),
        new RegExp('src:[^,}]*[a-zA-Z_$][\\\\w$]*\\\\(["\\\\\']([^"\\\\\']+\\\\.(?:png|jpg|jpeg|webp|gif|svg))["\\\\\']\\\\)[\\\\s\\\\S]{0,900}?className:["\\\\\'][^"\\\\\']*\\\\b' + escaped + '\\\\b[^"\\\\\']*["\\\\\']'),
        new RegExp('className:["\\\\\'][^"\\\\\']*\\\\b' + escaped + '\\\\b[^"\\\\\']*["\\\\\'][\\\\s\\\\S]{0,900}?src:["\\\\\']([^"\\\\\']+\\\\.(?:png|jpg|jpeg|webp|gif|svg))["\\\\\']'),
        new RegExp('src:["\\\\\']([^"\\\\\']+\\\\.(?:png|jpg|jpeg|webp|gif|svg))["\\\\\'][\\\\s\\\\S]{0,900}?className:["\\\\\'][^"\\\\\']*\\\\b' + escaped + '\\\\b[^"\\\\\']*["\\\\\']'),
      ];
      for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match?.[1]) return match[1];
      }
    }
    return "";
  }

  function assetFor(element) {
    const hinted = hintedAssetForElement(element);
    if (hinted) return hinted;
    const inferred = scriptAssetForElement(element);
    if (inferred) return inferred;
    if (element instanceof HTMLImageElement) {
      const src = element.getAttribute("src") || element.currentSrc || element.src || "";
      return /^data:|^blob:/i.test(src) ? "" : src;
    }
    const computed = window.getComputedStyle(element);
    const background = computed.backgroundImage || "";
    const match = background.match(/url\\(["']?([^"')]+)["']?\\)/);
    if (!match?.[1] || /^data:|^blob:/i.test(match[1])) return "";
    return match[1];
  }

  function layerInfo(element, current, depth) {
    const rect = element.getBoundingClientRect();
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    const className = element.className && typeof element.className === "string"
      ? element.className.trim().split(/\s+/).slice(0, 4).join(" ")
      : "";
    return {
      selector: cssPath(element),
      label: labelFor(element),
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      className,
      text: text ? text.slice(0, 40) : "",
      asset: assetFor(element),
      depth,
      current,
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  function layerChain(element) {
    const chain = [];
    let node = element;
    while (node && node instanceof Element && node !== document.documentElement && chain.length < 10) {
      if (!root.contains(node) && node !== document.body) chain.unshift(node);
      node = node.parentElement;
    }
    return chain.map((item, index) => layerInfo(item, item === element, index));
  }

  function recordPatch(element) {
    const selector = cssPath(element);
    const styles = {};
    editableStyleKeys.forEach((key) => {
      const value = element.style[key];
      const original = state.originals.get(selector);
      if (original && value !== original[key]) styles[key] = value;
    });
    const patch = {
      selector,
      label: labelFor(element),
      styles,
      note: noteInput.value.trim(),
      updatedAt: new Date().toISOString(),
    };
    const index = state.patches.findIndex((item) => item.selector === selector);
    if (!Object.keys(styles).length && !patch.note) {
      if (index >= 0) state.patches.splice(index, 1);
    } else if (index >= 0) state.patches[index] = patch;
    else state.patches.push(patch);
    post("patches-changed");
  }

  function renderControls(element) {
    targetText.textContent = labelFor(element);
    controls.innerHTML = "";
    const selector = cssPath(element);
    const existing = state.patches.find((item) => item.selector === selector);
    noteInput.value = existing && existing.note ? existing.note : "";
    editableStyleKeys.forEach((key) => {
      const wrap = document.createElement("div");
      wrap.className = "ove-field";
      const label = document.createElement("label");
      label.textContent = kebab(key);
      const input = document.createElement("input");
      input.value = valueFor(element, key);
      input.addEventListener("input", () => {
        rememberOriginal(element);
        element.style[key] = input.value;
        updateBox();
        recordPatch(element);
      });
      wrap.append(label, input);
      controls.appendChild(wrap);
    });
  }

  function rememberOriginal(element) {
    const selector = cssPath(element);
    if (state.originals.has(selector)) return;
    const styles = {};
    editableStyleKeys.forEach((key) => { styles[key] = element.style[key]; });
    state.originals.set(selector, styles);
  }

  function pushHistory(element) {
    state.history.push({ element, styles: Object.fromEntries(editableStyleKeys.map((key) => [key, element.style[key]])) });
    if (state.history.length > 80) state.history.shift();
  }

  function undoLastEdit() {
    const entry = state.history.pop();
    if (!entry || !(entry.element instanceof HTMLElement)) {
      post("undo-state");
      return;
    }
    state.selected = entry.element;
    Object.entries(entry.styles).forEach(([key, value]) => { entry.element.style[key] = value; });
    renderControls(entry.element);
    updateBox();
    recordPatch(entry.element);
  }

  function numericStyle(element, key, fallback) {
    const raw = element.style[key] || window.getComputedStyle(element).getPropertyValue(kebab(key));
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  // Dragging selection handles updates inline geometry and records the same patch as sidebar edits.
  function attachResizeHandle(handle) {
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !state.selected) return;
      const element = state.selected;
      const rect = element.getBoundingClientRect();
      const computed = window.getComputedStyle(element);
      drag = {
        element,
        direction: handle.dataset.dir || "",
        startX: event.clientX,
        startY: event.clientY,
        width: rect.width,
        height: rect.height,
        left: numericStyle(element, "left", rect.left),
        top: numericStyle(element, "top", rect.top),
        movable: /absolute|fixed|relative/.test(computed.position),
      };
      rememberOriginal(element);
      pushHistory(element);
      if (computed.display === "inline") element.style.display = "inline-block";
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const direction = drag.direction;
      const width = Math.max(8, drag.width + (direction.includes("e") ? dx : direction.includes("w") ? -dx : 0));
      const height = Math.max(8, drag.height + (direction.includes("s") ? dy : direction.includes("n") ? -dy : 0));
      if (direction.includes("e") || direction.includes("w")) drag.element.style.width = Math.round(width) + "px";
      if (direction.includes("n") || direction.includes("s")) drag.element.style.height = Math.round(height) + "px";
      if (drag.movable && direction.includes("w")) drag.element.style.left = Math.round(drag.left + dx) + "px";
      if (drag.movable && direction.includes("n")) drag.element.style.top = Math.round(drag.top + dy) + "px";
      updateBox();
      recordPatch(drag.element);
      event.preventDefault();
    });
    handle.addEventListener("pointerup", (event) => {
      if (!drag) return;
      drag = null;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    });
  }

  handles.forEach(attachResizeHandle);

  function selectElement(element) {
    if (!element || root.contains(element)) return;
    state.selected = element;
    renderControls(element);
    updateBox();
    launchButton.classList.add("has-selection");
    post("selected");
  }

  function layoutMeta(element) {
    const computed = window.getComputedStyle(element);
    const children = Array.from(element.children).filter((child) => !root.contains(child));
    const flowChildren = children.filter((child) => {
      const style = window.getComputedStyle(child);
      return style.display !== "none" && style.position !== "absolute" && style.position !== "fixed";
    });
    // Auto layout only makes sense for a container with multiple in-flow children.
    // Decorative H5 modules commonly position every child absolutely; flexing those
    // containers would corrupt the original Figma composition.
    return { available: flowChildren.length >= 2, children: children.length, flowChildren: flowChildren.length };
  }

  document.addEventListener("click", (event) => {
    if (!state.enabled) return;
    const target = event.target;
    if (!(target instanceof Element) || root.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(target);
  }, true);

  document.addEventListener("mouseover", (event) => {
    if (!state.enabled || state.selected) return;
    const target = event.target;
    if (!(target instanceof Element) || root.contains(target)) return;
    state.selected = target;
    updateBox();
    state.selected = null;
  }, true);

  noteInput.addEventListener("input", () => {
    if (state.selected) recordPatch(state.selected);
  });
  root.querySelector("#ove-pick").addEventListener("click", (event) => {
    state.enabled = !state.enabled;
    event.currentTarget.textContent = state.enabled ? "选择" : "浏览";
    event.currentTarget.classList.toggle("active", state.enabled);
    if (!state.enabled) {
      state.selected = null;
      updateBox();
    }
  });
  let suppressLaunchClick = false;
  makeDraggable(launchButton, launchButton, () => {
    suppressLaunchClick = true;
    setTimeout(() => { suppressLaunchClick = false; }, 0);
  });
  makeDraggable(root.querySelector("#ove-panel-header"), panel);
  launchButton.addEventListener("click", () => {
    if (suppressLaunchClick) return;
    post("editor-open");
  });
  root.querySelector("#ove-collapse").addEventListener("click", () => root.classList.remove("open"));
  root.querySelector("#ove-save").addEventListener("click", () => { void saveChanges(); });
  root.querySelector("#ove-undo").addEventListener("click", () => {
    if (!state.selected) return;
    const selector = cssPath(state.selected);
    const original = state.originals.get(selector);
    if (original) Object.entries(original).forEach(([key, value]) => { state.selected.style[key] = value; });
    state.patches = state.patches.filter((item) => item.selector !== selector);
    noteInput.value = "";
    renderControls(state.selected);
    updateBox();
    post("patches-changed");
  });
  root.querySelector("#ove-clear").addEventListener("click", () => {
    state.selected = null;
    targetText.textContent = "点击页面元素开始调整";
    controls.innerHTML = "";
    updateBox();
    launchButton.classList.remove("has-selection");
    post("selected");
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== window.__HANDOFF_HOST_ORIGIN__ || event.source !== window.parent) return;
    const payload = event.data || {};
    if (payload.source !== "oversea-visual-editor-host") return;
    if (payload.type === "undo-last") {
      undoLastEdit();
      return;
    }
    if (payload.type === "clear-history") {
      state.history = [];
      post("undo-state");
      return;
    }
    if (payload.type === "set-mode") {
      state.enabled = !!payload.enabled;
      state.patches.forEach(p => { let el; try { el = document.querySelector(p.selector); } catch {} if (!el) return; const original = state.originals.get(p.selector); if (original) Object.entries(original).forEach(([k,v]) => { el.style[k] = v; }); if (state.enabled) Object.entries(p.styles || {}).forEach(([k,v]) => { if (editableStyleKeys.includes(k)) el.style[k] = v; }); });
      if (!state.enabled) state.selected = null;
      updateBox(); return;
    }
    if (payload.type === "measure") {
      measureSelectors(payload.selectors);
      return;
    }
    if (payload.type === "restore") {
      const missing = [];
      state.patches = payload.patches || [];
      state.patches.forEach(p => { let el; try { el = document.querySelector(p.selector); } catch {} if (!el) { missing.push(p.selector); return; } rememberOriginal(el); if (state.enabled) Object.entries(p.styles || {}).forEach(([k,v]) => { if (editableStyleKeys.includes(k)) el.style[k] = v; }); });
      post("restored", {missing}); return;
    }
    let target; try { target = document.querySelector(payload.selector || ""); } catch { return; }
    if (payload.type === "focus" && target instanceof HTMLElement) { target.scrollIntoView({block:"center"}); selectElement(target); return; }
    if (payload.type === "set-note" && target instanceof HTMLElement) { state.selected = target; noteInput.value = String(payload.note || ""); recordPatch(target); return; }
    if (!(target instanceof HTMLElement)) return;
    if (payload.type === "select-parent") {
      selectElement(target.parentElement instanceof HTMLElement ? target.parentElement : target);
      return;
    }
    const element = target;
    if (payload.type === "set-layout-mode") {
      const meta = layoutMeta(element);
      if (!meta.available) {
        state.selected = element;
        post("layout-unavailable");
        return;
      }
      const mode = payload.mode;
      if (!["block", "column", "row", "grid"].includes(mode)) return;
      state.selected = element;
      rememberOriginal(element);
      pushHistory(element);
      if (mode === "block") {
        element.style.display = "block";
        element.style.flexDirection = "";
        element.style.gridTemplateColumns = "";
      } else if (mode === "grid") {
        element.style.display = "grid";
        element.style.flexDirection = "";
        element.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
      } else {
        element.style.display = "flex";
        element.style.flexDirection = mode;
        element.style.gridTemplateColumns = "";
      }
      renderControls(element);
      updateBox();
      recordPatch(element);
      return;
    }
    if (payload.type === "apply-styles" && payload.styles && typeof payload.styles === "object") {
      const styles = Object.entries(payload.styles).filter(([key, value]) => editableStyleKeys.includes(key) && typeof value === "string");
      if (!styles.length) return;
      state.selected = element;
      rememberOriginal(element);
      pushHistory(element);
      styles.forEach(([key, value]) => { element.style[key] = value; });
      noteInput.value = String(payload.note || noteInput.value || "");
      recordPatch(element);
      updateBox();
      return;
    }
    if (payload.type !== "apply-style" || !editableStyleKeys.includes(payload.key)) return;
    state.selected = element;
    rememberOriginal(element);
    pushHistory(element);
    element.style[payload.key] = String(payload.value || "");
    noteInput.value = String(payload.note || noteInput.value || "");
    recordPatch(element);
    updateBox();
  });
  window.addEventListener("resize", updateBox);
  window.addEventListener("scroll", updateBox, true);
  window.addEventListener("hashchange", () => post("page-state", {hash: location.hash}));
  post("ready", {hash: location.hash});
})();
`;
