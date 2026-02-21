const DEFAULT_ICON_CONFIG = {
  ".txt": "https://dl.malwarewatch.org/theme/images/icons/txt.png",
  "folder": "https://dl.malwarewatch.org/theme/images/icons/folder.png",
  ".zip": "https://dl.malwarewatch.org/theme/images/icons/zip.png",
  ".7z": "https://dl.malwarewatch.org/theme/images/icons/zip.png",
  ".rar": "https://dl.malwarewatch.org/theme/images/icons/zip.png",
  ".iso": "https://dl.malwarewatch.org/theme/images/icons/iso.png",
  ".exe": "https://dl.malwarewatch.org/theme/images/icons/exe.png",
  "other/any": "https://dl.malwarewatch.org/theme/images/icons/exe.png"
};

const IS_FILE_PROTOCOL = window.location.protocol === "file:";
const ASSET_BASE = IS_FILE_PROTOCOL ? "" : "/";
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".log", ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml", ".toml",
  ".ini", ".cfg", ".conf", ".properties", ".sarr", ".html", ".htm", ".css", ".js",
  ".ts", ".jsx", ".tsx", ".mjs", ".cjs", ".c", ".cpp", ".cc", ".h", ".hpp", ".py",
  ".rb", ".go", ".rs", ".java", ".cs", ".php", ".sh", ".bash", ".zsh", ".bat",
  ".cmd", ".ps1", ".psm1", ".sql", ".lua", ".r", ".swift", ".kt", ".dockerfile"
]);
const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".avif", ".svg", ".ico", ".tif", ".tiff"
]);
const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".webm", ".ogv", ".mov", ".m4v", ".mkv"
]);
const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"
]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const HIDDEN_INDEX_FILES = new Set([".gitkeep", ".keep"]);
const MOBILE_MEDIA_QUERY = window.matchMedia("(max-width: 900px), (pointer: coarse)");

let iconConfig = { ...DEFAULT_ICON_CONFIG };

const indexEntries = Array.isArray(window.__FILE_INDEX__) ? window.__FILE_INDEX__ : [];
const normalizedEntries = normalizeIndex(indexEntries);

const pathDisplay = document.getElementById("pathDisplay");
const searchInput = document.getElementById("searchInput");
const fileTableBody = document.getElementById("fileTableBody");
const tableWrap = document.querySelector(".table-wrap");
const homeButton = document.getElementById("homeButton");
const explorerWindow = document.getElementById("explorerWindow");
const titlebar = document.getElementById("windowTitlebar");
const windowLayer = document.getElementById("windowLayer");

let currentPath = "";
let selectedPath = "";
let dragX = 0;
let dragY = 0;
let dragRot = 0;
let dragState = null;
let folderTransitionTimer = null;
let recenterTimer = null;
let viewerSeed = 0;
let viewerZCounter = 40;
const openViewerWindows = new Map();
let isMobileUI = MOBILE_MEDIA_QUERY.matches;


searchInput.addEventListener("input", () => {
  renderTable();
});

if (homeButton) {
  homeButton.addEventListener("click", () => {
    navigateToPath("", true);
  });
}

initWindowDragging();
initFileViewer();
initResponsiveMode();

fileTableBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-path]");
  if (!row) {
    return;
  }

  selectedPath = row.dataset.path;
  for (const item of fileTableBody.querySelectorAll("tr")) {
    item.classList.remove("is-selected");
  }
  row.classList.add("is-selected");
});

fileTableBody.addEventListener("dblclick", (event) => {
  const row = event.target.closest("tr[data-path]");
  if (!row) {
    return;
  }

  if (row.dataset.parent === "true") {
    navigateToPath(getParentPath(currentPath), true);
    return;
  }

  if (row.dataset.type === "directory") {
    navigateToPath(row.dataset.path, true);
    return;
  }

  openFile(row.dataset.path);
});

init();

async function init() {
  iconConfig = await loadIconConfig();

  if (!IS_FILE_PROTOCOL) {
    navigateToPath(getPathFromUrl(), false);
    window.addEventListener("popstate", () => {
      navigateToPath(getPathFromUrl(), false);
    });
  }

  renderTable();
}

async function loadIconConfig() {
  try {
    const response = await fetch(`${ASSET_BASE}config.sarr`, { cache: "no-store" });
    if (!response.ok) {
      return { ...DEFAULT_ICON_CONFIG };
    }

    const text = await response.text();
    return {
      ...DEFAULT_ICON_CONFIG,
      ...parseSarrConfig(text)
    };
  } catch (_error) {
    return { ...DEFAULT_ICON_CONFIG };
  }
}

function parseSarrConfig(content) {
  const output = {};
  const blockRegex = /\(([\s\S]*?)\)/g;
  let match = blockRegex.exec(content);

  while (match) {
    const lines = match[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length >= 2) {
      const key = normalizeIconKey(lines[0]);
      let iconValue = "";

      if (lines[1].toLowerCase().startsWith("icon=")) {
        iconValue = lines[1].slice(5).trim();
      } else {
        iconValue = lines[1].trim();
      }

      if (key && iconValue) {
        output[key] = iconValue;
      }
    }

    match = blockRegex.exec(content);
  }

  return output;
}

function normalizeIconKey(rawKey) {
  const key = (rawKey || "").trim().toLowerCase();
  if (!key) {
    return "";
  }

  if (key === "folder" || key === "other/any") {
    return key;
  }

  if (key.startsWith(".")) {
    return key;
  }

  return "";
}

function getIconForEntry(entry) {
  if (entry.type === "directory") {
    return iconConfig.folder || DEFAULT_ICON_CONFIG.folder;
  }

  const name = entry.name || "";
  const dotIndex = name.lastIndexOf(".");
  const extension = dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";

  if (extension && iconConfig[extension]) {
    return iconConfig[extension];
  }

  return iconConfig["other/any"] || DEFAULT_ICON_CONFIG["other/any"];
}

function normalizeIndex(entries) {
  const output = [];

  for (const entry of entries) {
    if (!entry || typeof entry.path !== "string") {
      continue;
    }

    let normalizedPath = entry.path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
    if (!normalizedPath) {
      continue;
    }

    const type = entry.type === "directory" ? "directory" : "file";
    const name = normalizedPath.split("/").pop();

    if (type === "file" && HIDDEN_INDEX_FILES.has(name.toLowerCase())) {
      continue;
    }

    const size = Number.isFinite(Number(entry.size)) ? Math.max(0, Number(entry.size)) : 0;
    const modifiedAt = new Date(entry.modified || 0);
    const modifiedMs = Number.isNaN(modifiedAt.getTime()) ? 0 : modifiedAt.getTime();

    output.push({
      path: normalizedPath,
      name,
      type,
      size,
      modifiedMs,
      modifiedText: modifiedMs ? formatDate(modifiedMs) : "-"
    });
  }

  return output;
}

function renderTable() {
  const query = searchInput.value.trim().toLowerCase();
  const entries = getDirectEntries(currentPath).filter((entry) => {
    return !query || entry.name.toLowerCase().includes(query);
  });

  pathDisplay.textContent = `/Files${currentPath ? `/${currentPath}` : ""}`;

  fileTableBody.innerHTML = "";

  if (currentPath) {
    fileTableBody.appendChild(createRow({
      path: getParentPath(currentPath),
      name: "..",
      type: "directory",
      size: 0,
      modifiedText: "-"
    }, true));
  }

  if (!entries.length) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = isMobileUI ? 1 : 3;
    emptyCell.className = "is-muted";
    if (query) {
      emptyCell.textContent = "No files matched your search.";
    } else if (normalizedEntries.length === 0 && !currentPath) {
      emptyCell.textContent = "No files found. Add content into Files, then run Scripts/build.ps1 or Scripts/build.sh.";
    } else {
      emptyCell.textContent = "This folder is empty.";
    }
    emptyCell.style.padding = "14px 10px";
    emptyRow.appendChild(emptyCell);
    fileTableBody.appendChild(emptyRow);
    return;
  }

  for (const entry of entries) {
    fileTableBody.appendChild(createRow(entry, false));
  }
}

function getDirectEntries(folderPath) {
  const prefix = folderPath ? `${folderPath}/` : "";
  const folders = new Map();
  const files = [];

  for (const entry of normalizedEntries) {
    if (!entry.path.startsWith(prefix)) {
      continue;
    }

    const remaining = entry.path.slice(prefix.length);
    if (!remaining) {
      continue;
    }

    const separatorIndex = remaining.indexOf("/");

    if (separatorIndex !== -1) {
      const childName = remaining.slice(0, separatorIndex);
      const childPath = `${prefix}${childName}`;
      const existing = folders.get(childPath);

      if (existing) {
        if (entry.modifiedMs > existing.modifiedMs) {
          existing.modifiedMs = entry.modifiedMs;
          existing.modifiedText = entry.modifiedText;
        }
      } else {
        folders.set(childPath, {
          path: childPath,
          name: childName,
          type: "directory",
          size: 0,
          modifiedMs: entry.modifiedMs,
          modifiedText: entry.modifiedText
        });
      }

      continue;
    }

    if (entry.type === "directory") {
      folders.set(entry.path, {
        path: entry.path,
        name: entry.name,
        type: "directory",
        size: 0,
        modifiedMs: entry.modifiedMs,
        modifiedText: entry.modifiedText
      });
      continue;
    }

    files.push(entry);
  }

  const sortByName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  return [...folders.values()].sort(sortByName).concat(files.sort(sortByName));
}

function createRow(entry, isParentRow) {
  const row = document.createElement("tr");
  row.dataset.path = entry.path;
  row.dataset.type = entry.type;

  if (isParentRow) {
    row.dataset.parent = "true";
  }

  const nameCell = document.createElement("td");
  const nameWrap = document.createElement("div");
  nameWrap.className = "name-cell";

  const icon = document.createElement("img");
  icon.className = "file-icon";
  icon.src = getIconForEntry(entry);
  icon.alt = "";

  const label = document.createElement("span");
  label.className = "name-label";
  label.textContent = entry.name;

  nameWrap.append(icon, label);
  nameCell.appendChild(nameWrap);

  const sizeCell = document.createElement("td");
  sizeCell.textContent = entry.type === "directory" ? "-" : formatBytes(entry.size);

  const dateCell = document.createElement("td");
  dateCell.textContent = entry.modifiedText || "-";

  row.append(nameCell, sizeCell, dateCell);

  if (selectedPath === entry.path && !isParentRow) {
    row.classList.add("is-selected");
  }

  return row;
}

function getParentPath(path) {
  if (!path || !path.includes("/")) {
    return "";
  }

  return path.split("/").slice(0, -1).join("/");
}

function openFile(filePath) {
  openFileInViewer(filePath);
}

function openFileInViewer(filePath) {
  if (isMobileUI) {
    const fileUrl = buildFileUrl(filePath);
    const popup = window.open(fileUrl, "_blank", "noopener");
    if (!popup) {
      window.location.href = fileUrl;
    }
    return;
  }

  if (!windowLayer) {
    const fileUrl = buildFileUrl(filePath);
    window.open(fileUrl, "_blank", "noopener");
    return;
  }

  const existing = openViewerWindows.get(filePath);
  if (existing && existing.root.isConnected) {
    if (existing.closeTimer) {
      clearTimeout(existing.closeTimer);
      existing.closeTimer = null;
      existing.root.classList.remove("is-closing");
      existing.root.classList.add("is-open");
    }
    bringViewerToFront(existing);
    return;
  }

  const viewer = createViewerWindow(filePath);
  openViewerWindows.set(filePath, viewer);
  bringViewerToFront(viewer);

  viewer.requestId += 1;
  const requestId = viewer.requestId;

  const loading = document.createElement("div");
  loading.className = "file-viewer-loading";
  loading.textContent = "Loading preview...";
  setViewerContent(viewer, loading, requestId);

  renderFilePreview(viewer, filePath, viewer.fileUrl, requestId);
}

function createViewerWindow(filePath) {
  const root = document.createElement("section");
  root.className = "file-viewer-window";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "false");

  const titlebar = document.createElement("header");
  titlebar.className = "file-viewer-titlebar";

  const closeButton = document.createElement("button");
  closeButton.className = "file-viewer-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close file view");

  const meta = document.createElement("div");
  meta.className = "file-viewer-meta";

  const nameElement = document.createElement("h2");
  const pathElement = document.createElement("p");
  nameElement.textContent = filePath.split("/").pop() || filePath;
  pathElement.textContent = `/Files/${filePath}`;

  meta.append(nameElement, pathElement);
  titlebar.append(closeButton, meta);

  const body = document.createElement("section");
  body.className = "file-viewer-body";

  root.append(titlebar, body);
  windowLayer.appendChild(root);

  viewerSeed += 1;
  const spread = 26;
  const slot = ((viewerSeed - 1) % 7) - 3;

  const viewer = {
    path: filePath,
    fileUrl: buildFileUrl(filePath),
    root,
    titlebar,
    closeButton,
    body,
    offsetX: slot * spread,
    offsetY: slot * spread * 0.5,
    rot: 0,
    dragState: null,
    recenterTimer: null,
    closeTimer: null,
    requestId: 0
  };

  applyViewerTransform(viewer);

  closeButton.addEventListener("click", () => {
    closeViewerWindow(viewer, true);
  });

  root.addEventListener("pointerdown", () => {
    bringViewerToFront(viewer);
  });

  titlebar.addEventListener("pointerdown", (event) => {
    if (isMobileUI) {
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    viewer.dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      startX: viewer.offsetX,
      startY: viewer.offsetY
    };

    root.classList.add("is-dragging");
    root.classList.remove("is-recentering");
    titlebar.setPointerCapture(event.pointerId);
    bringViewerToFront(viewer);
    event.preventDefault();
  });

  titlebar.addEventListener("pointermove", (event) => {
    if (!viewer.dragState || event.pointerId !== viewer.dragState.pointerId) {
      return;
    }

    viewer.offsetX = viewer.dragState.startX + (event.clientX - viewer.dragState.startClientX);
    viewer.offsetY = viewer.dragState.startY + (event.clientY - viewer.dragState.startClientY);
    viewer.rot = clamp((event.clientX - viewer.dragState.lastClientX) * 0.14, -4, 4);
    viewer.dragState.lastClientX = event.clientX;
    applyViewerTransform(viewer);

    if (isViewerTouchingViewportEdge(viewer)) {
      recenterViewerWindow(viewer, false);
      finishViewerDrag(viewer, event);
    }
  });

  titlebar.addEventListener("pointerup", (event) => {
    finishViewerDrag(viewer, event);
  });

  titlebar.addEventListener("pointercancel", (event) => {
    finishViewerDrag(viewer, event);
  });

  titlebar.addEventListener("dblclick", (event) => {
    if (isMobileUI) {
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    viewer.dragState = null;
    recenterViewerWindow(viewer, true);
  });

  requestAnimationFrame(() => {
    root.classList.add("is-open");
  });

  return viewer;
}

function finishViewerDrag(viewer, event) {
  if (!viewer.dragState || event.pointerId !== viewer.dragState.pointerId) {
    return;
  }

  viewer.titlebar.releasePointerCapture(event.pointerId);
  viewer.dragState = null;
  viewer.rot = 0;
  viewer.root.classList.remove("is-dragging");
  applyViewerTransform(viewer);
}

function bringViewerToFront(viewer) {
  viewer.root.style.zIndex = String(++viewerZCounter);
}

function recenterViewerWindow(viewer, smooth) {
  viewer.offsetX = 0;
  viewer.offsetY = 0;
  viewer.rot = 0;
  viewer.root.classList.remove("is-dragging");

  if (smooth) {
    viewer.root.classList.add("is-recentering");
    if (viewer.recenterTimer) {
      clearTimeout(viewer.recenterTimer);
    }
    viewer.recenterTimer = window.setTimeout(() => {
      viewer.root.classList.remove("is-recentering");
      viewer.recenterTimer = null;
    }, 500);
  } else {
    viewer.root.classList.remove("is-recentering");
  }

  applyViewerTransform(viewer);
}

function isViewerTouchingViewportEdge(viewer) {
  const rect = viewer.root.getBoundingClientRect();
  const margin = 8;
  return (
    rect.left <= margin ||
    rect.top <= margin ||
    rect.right >= window.innerWidth - margin ||
    rect.bottom >= window.innerHeight - margin
  );
}

function applyViewerTransform(viewer) {
  viewer.root.style.setProperty("--viewer-x", `${viewer.offsetX}px`);
  viewer.root.style.setProperty("--viewer-y", `${viewer.offsetY}px`);
  viewer.root.style.setProperty("--viewer-rot", `${viewer.rot}deg`);
}

function closeViewerWindow(viewer, animate) {
  if (!viewer || !viewer.root.isConnected) {
    return;
  }

  viewer.requestId += 1;
  viewer.dragState = null;
  viewer.rot = 0;
  viewer.root.classList.remove("is-dragging");
  viewer.root.classList.remove("is-recentering");
  applyViewerTransform(viewer);

  if (viewer.closeTimer) {
    clearTimeout(viewer.closeTimer);
  }

  const finalizeClose = () => {
    openViewerWindows.delete(viewer.path);
    if (viewer.recenterTimer) {
      clearTimeout(viewer.recenterTimer);
      viewer.recenterTimer = null;
    }
    if (viewer.root.isConnected) {
      viewer.root.remove();
    }
    viewer.closeTimer = null;
  };

  if (!animate) {
    finalizeClose();
    return;
  }

  viewer.root.classList.add("is-closing");
  viewer.closeTimer = window.setTimeout(finalizeClose, 230);
}

async function renderFilePreview(viewer, filePath, fileUrl, requestId) {
  const extension = getFileExtension(filePath);
  const previewType = detectPreviewType(extension);

  try {
    if (previewType === "text") {
      await renderTextPreview(viewer, fileUrl, extension, requestId);
      return;
    }

    if (previewType === "image") {
      renderImagePreview(viewer, fileUrl, filePath, requestId);
      return;
    }

    if (previewType === "video") {
      renderVideoPreview(viewer, fileUrl, requestId);
      return;
    }

    if (previewType === "audio") {
      renderAudioPreview(viewer, fileUrl, requestId);
      return;
    }

    if (previewType === "pdf") {
      renderFramePreview(viewer, fileUrl, requestId, false);
      return;
    }

    if (previewType === "html") {
      renderFramePreview(viewer, fileUrl, requestId, true);
      return;
    }
  } catch (_error) {
    renderFallbackPreview(viewer, fileUrl, "Preview failed to load.", requestId);
    return;
  }

  renderFallbackPreview(viewer, fileUrl, "This file type is not previewable yet.", requestId);
}

function detectPreviewType(extension) {
  if (TEXT_EXTENSIONS.has(extension)) {
    if (extension === ".html" || extension === ".htm") {
      return "html";
    }
    return "text";
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }
  if (PDF_EXTENSIONS.has(extension)) {
    return "pdf";
  }
  return "unknown";
}

async function renderTextPreview(viewer, fileUrl, extension, requestId) {
  const response = await fetch(fileUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch text file");
  }

  let text = await response.text();
  if (extension === ".json") {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch (_error) {
      // Keep original text if json parse fails.
    }
  }

  const pre = document.createElement("pre");
  pre.className = "file-viewer-text";
  pre.textContent = text || "(Empty file)";
  setViewerContent(viewer, pre, requestId);
}

function renderImagePreview(viewer, fileUrl, filePath, requestId) {
  const image = document.createElement("img");
  image.className = "file-viewer-media";
  image.alt = filePath.split("/").pop() || "Image preview";
  image.src = fileUrl;
  image.loading = "eager";
  image.addEventListener("error", () => {
    renderFallbackPreview(viewer, fileUrl, "Could not render image preview.", requestId);
  });
  setViewerContent(viewer, image, requestId);
}

function renderVideoPreview(viewer, fileUrl, requestId) {
  const video = document.createElement("video");
  video.className = "file-viewer-media file-viewer-video";
  video.src = fileUrl;
  video.controls = true;
  video.preload = "metadata";
  video.addEventListener("error", () => {
    renderFallbackPreview(viewer, fileUrl, "Could not render video preview.", requestId);
  });
  setViewerContent(viewer, video, requestId);
}

function renderAudioPreview(viewer, fileUrl, requestId) {
  const audio = document.createElement("audio");
  audio.className = "file-viewer-audio";
  audio.src = fileUrl;
  audio.controls = true;
  audio.preload = "metadata";

  const wrapper = document.createElement("div");
  wrapper.className = "file-viewer-fallback";
  wrapper.append(audio);
  setViewerContent(viewer, wrapper, requestId);
}

function renderFramePreview(viewer, fileUrl, requestId, sandboxed) {
  const frame = document.createElement("iframe");
  frame.className = "file-viewer-frame";
  frame.src = fileUrl;
  frame.loading = "eager";
  if (sandboxed) {
    frame.setAttribute("sandbox", "");
  }
  frame.addEventListener("error", () => {
    renderFallbackPreview(viewer, fileUrl, "Could not render file preview.", requestId);
  });
  setViewerContent(viewer, frame, requestId);
}

function renderFallbackPreview(viewer, fileUrl, message, requestId) {
  const wrapper = document.createElement("div");
  wrapper.className = "file-viewer-fallback";

  const text = document.createElement("p");
  text.textContent = message;

  const link = document.createElement("a");
  link.href = fileUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open or Download File";

  wrapper.append(text, link);
  setViewerContent(viewer, wrapper, requestId);
}

function setViewerContent(viewer, node, requestId) {
  if (!viewer.body || !viewer.root.isConnected || requestId !== viewer.requestId) {
    return;
  }

  viewer.body.innerHTML = "";
  viewer.body.appendChild(node);
}

function buildFileUrl(filePath) {
  return `${ASSET_BASE}Files/${encodePath(filePath)}`;
}

function encodePath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function getFileExtension(filePath) {
  const fileName = filePath.split("/").pop() || "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) {
    return "";
  }
  return fileName.slice(dotIndex).toLowerCase();
}

function navigateToPath(rawPath, syncUrl) {
  const normalizedPath = normalizeRoutePath(rawPath);
  const exists = directoryExists(normalizedPath);
  const previousPath = currentPath;
  currentPath = exists ? normalizedPath : "";
  selectedPath = "";

  if (syncUrl && !IS_FILE_PROTOCOL) {
    setUrlPath(currentPath);
  } else if (!syncUrl && !IS_FILE_PROTOCOL && !exists && window.location.pathname !== "/") {
    window.history.replaceState({ path: "" }, "", "/");
  }

  renderTable();

  if (previousPath !== currentPath) {
    triggerFolderTransition();
  }
}

function getPathFromUrl() {
  const rawPath = window.location.pathname || "/";
  const trimmed = rawPath.replace(/^\/+/, "").replace(/\/+$/, "");

  if (!trimmed || trimmed.toLowerCase() === "index.html") {
    return "";
  }

  const segments = trimmed
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  return normalizeRoutePath(segments.join("/"));
}

function setUrlPath(path) {
  const target = path
    ? `/${path.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`
    : "/";

  if (window.location.pathname !== target) {
    window.history.pushState({ path }, "", target);
  }
}

function normalizeRoutePath(path) {
  return (path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function directoryExists(path) {
  if (!path) {
    return true;
  }

  const prefix = `${path}/`;
  return normalizedEntries.some((entry) => {
    return (entry.path === path && entry.type === "directory") || entry.path.startsWith(prefix);
  });
}

function initResponsiveMode() {
  applyResponsiveMode(MOBILE_MEDIA_QUERY.matches);

  const onResponsiveChange = () => {
    applyResponsiveMode(MOBILE_MEDIA_QUERY.matches);
  };

  if (typeof MOBILE_MEDIA_QUERY.addEventListener === "function") {
    MOBILE_MEDIA_QUERY.addEventListener("change", onResponsiveChange);
  } else if (typeof MOBILE_MEDIA_QUERY.addListener === "function") {
    MOBILE_MEDIA_QUERY.addListener(onResponsiveChange);
  }
}

function applyResponsiveMode(nextValue) {
  const wasMobile = isMobileUI;
  isMobileUI = Boolean(nextValue);

  if (isMobileUI) {
    recenterWindow(false);
    if (!wasMobile) {
      closeAllViewerWindows(false);
    }
  }

  if (wasMobile !== isMobileUI) {
    renderTable();
  }
}

function closeAllViewerWindows(animate) {
  const viewers = [...openViewerWindows.values()];
  for (const viewer of viewers) {
    closeViewerWindow(viewer, animate);
  }
}

function initFileViewer() {
  if (!windowLayer) {
    return;
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    const topViewer = getTopViewerWindow();
    if (topViewer) {
      closeViewerWindow(topViewer, true);
    }
  });
}

function getTopViewerWindow() {
  let topViewer = null;
  let topZ = -Infinity;

  for (const viewer of openViewerWindows.values()) {
    if (!viewer.root.isConnected) {
      continue;
    }

    const z = Number(viewer.root.style.zIndex || 0);
    if (z >= topZ) {
      topZ = z;
      topViewer = viewer;
    }
  }

  return topViewer;
}

function initWindowDragging() {
  if (!titlebar || !explorerWindow) {
    return;
  }

  titlebar.addEventListener("pointerdown", (event) => {
    if (isMobileUI) {
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      startX: dragX,
      startY: dragY
    };

    explorerWindow.classList.add("is-dragging");
    titlebar.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  titlebar.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const nextX = dragState.startX + (event.clientX - dragState.startClientX);
    const nextY = dragState.startY + (event.clientY - dragState.startClientY);
    const clamped = clampDragToBounds(nextX, nextY);

    dragX = clamped.x;
    dragY = clamped.y;

    const rawDeltaX = event.clientX - dragState.lastClientX;
    const targetRot = clamped.hitEdge ? 0 : clamp(rawDeltaX * 0.08, -1.8, 1.8);
    dragRot = (dragRot * 0.72) + (targetRot * 0.28);

    dragState.lastClientX = event.clientX;
    applyWindowDrag();
  });

  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    titlebar.releasePointerCapture(event.pointerId);
    dragState = null;
    dragRot = 0;
    applyWindowDrag();
    explorerWindow.classList.remove("is-dragging");
  };

  titlebar.addEventListener("pointerup", finishDrag);
  titlebar.addEventListener("pointercancel", finishDrag);

  titlebar.addEventListener("dblclick", (event) => {
    if (isMobileUI) {
      return;
    }

    if (isInteractiveTarget(event.target)) {
      return;
    }

    dragState = null;
    recenterWindow(true);
  });

  const syncWindowState = () => {
    constrainWindowToViewport();
    updateWindowCornerState();
  };

  window.addEventListener("resize", syncWindowState);
  window.addEventListener("load", syncWindowState, { once: true });

  requestAnimationFrame(() => {
    requestAnimationFrame(syncWindowState);
  });
}

function applyWindowDrag() {
  if (!explorerWindow) {
    return;
  }

  explorerWindow.style.setProperty("--drag-x", `${dragX}px`);
  explorerWindow.style.setProperty("--drag-y", `${dragY}px`);
  explorerWindow.style.setProperty("--drag-rot", `${dragRot}deg`);
  updateWindowCornerState();
}

function constrainWindowToViewport() {
  if (!explorerWindow || isMobileUI) {
    return;
  }

  const clamped = clampDragToBounds(dragX, dragY);
  dragX = clamped.x;
  dragY = clamped.y;

  if (clamped.hitEdge && dragRot !== 0) {
    dragRot = 0;
  }

  applyWindowDrag();
}

function clampDragToBounds(nextX, nextY) {
  if (!explorerWindow) {
    return { x: nextX, y: nextY, hitEdge: false };
  }

  const rect = explorerWindow.getBoundingClientRect();
  const bounds = getExplorerBounds();
  const margin = 0;

  const leftAtZero = rect.left - dragX;
  const rightAtZero = rect.right - dragX;
  const topAtZero = rect.top - dragY;
  const bottomAtZero = rect.bottom - dragY;

  const minX = (bounds.left + margin) - leftAtZero;
  const maxX = (bounds.right - margin) - rightAtZero;
  const minY = (bounds.top + margin) - topAtZero;
  const maxY = (bounds.bottom - margin) - bottomAtZero;

  const x = clamp(nextX, minX, maxX);
  const y = clamp(nextY, minY, maxY);

  return {
    x,
    y,
    hitEdge: x !== nextX || y !== nextY
  };
}

function recenterWindow(smooth) {
  dragX = 0;
  dragY = 0;
  dragRot = 0;
  if (explorerWindow) {
    explorerWindow.classList.remove("is-dragging");
    if (smooth) {
      explorerWindow.classList.add("is-recentering");
      if (recenterTimer) {
        clearTimeout(recenterTimer);
      }
      recenterTimer = window.setTimeout(() => {
        explorerWindow.classList.remove("is-recentering");
      }, 500);
    } else {
      explorerWindow.classList.remove("is-recentering");
    }
  }
  applyWindowDrag();
}

function updateWindowCornerState() {
  if (!explorerWindow) {
    return;
  }

  if (isMobileUI) {
    explorerWindow.classList.remove("corner-flat-tl", "corner-flat-tr", "corner-flat-br", "corner-flat-bl");
    return;
  }

  const rect = explorerWindow.getBoundingClientRect();
  const bounds = getExplorerBounds();
  const margin = 8;

  const touchesLeft = rect.left <= bounds.left + margin;
  const touchesTop = rect.top <= bounds.top + margin;
  const touchesRight = rect.right >= bounds.right - margin;
  const touchesBottom = rect.bottom >= bounds.bottom - margin;

  explorerWindow.classList.toggle("corner-flat-tl", touchesTop || touchesLeft);
  explorerWindow.classList.toggle("corner-flat-tr", touchesTop || touchesRight);
  explorerWindow.classList.toggle("corner-flat-br", touchesBottom || touchesRight);
  explorerWindow.classList.toggle("corner-flat-bl", touchesBottom || touchesLeft);
}

function isWindowTouchingViewportEdge() {
  if (!explorerWindow) {
    return false;
  }

  const rect = explorerWindow.getBoundingClientRect();
  const bounds = getExplorerBounds();
  const margin = 8;
  return (
    rect.left <= bounds.left + margin ||
    rect.top <= bounds.top + margin ||
    rect.right >= bounds.right - margin ||
    rect.bottom >= bounds.bottom - margin
  );
}

function getExplorerBounds() {
  const container = explorerWindow?.closest(".frame");
  if (container) {
    return container.getBoundingClientRect();
  }

  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight
  };
}
function triggerFolderTransition() {
  if (!tableWrap) {
    return;
  }

  tableWrap.classList.remove("is-switching");
  void tableWrap.offsetWidth;
  tableWrap.classList.add("is-switching");

  if (folderTransitionTimer) {
    clearTimeout(folderTransitionTimer);
  }

  folderTransitionTimer = window.setTimeout(() => {
    tableWrap.classList.remove("is-switching");
  }, 230);
}

function isInteractiveTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest("button, a, input, label, select, textarea"));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  const precision = value >= 100 || index === 0 ? 0 : 1;

  return `${value.toFixed(precision)} ${units[index]}`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(timestamp));
}










