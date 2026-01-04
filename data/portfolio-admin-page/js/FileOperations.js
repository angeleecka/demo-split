// ===========================================================
// data/portfolio-admin-page/js/FileOperations.js
// ============================================================

// --- 0. КОНСТАНТЫ SVG ИКОНОК (с использованием --color-primary) ---

// 1. ПАПКА: Залитая акцентным цветом
window.SVG_FOLDER_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path 
    d="M3 7h6l2 2h10v10H3z" 
    fill="var(--color-primary)" // <-- ИСПОЛЬЗУЕМ ВАШ АКЦЕНТНЫЙ ЦВЕТ ДЛЯ ЗАЛИВКИ
    stroke="none" 
  />
</svg>`;

// 2. НА УРОВЕНЬ ВВЕРХ (..): Контурная акцентным цветом
const SVG_UP_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path 
    d="M12 19V5M5 12l7-7 7 7" 
    fill="none" 
    stroke="var(--color-primary)" // <-- ИСПОЛЬЗУЕМ ВАШ АКЦЕНТНЫЙ ЦВЕТ ДЛЯ КОНТУРА
    stroke-width="2"
  />
</svg>`;

// 3. ФАЙЛ: Контурная акцентным цветом
window.SVG_FILE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path 
    d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" 
    fill="none" 
    stroke="var(--color-primary)" // <-- ИСПОЛЬЗУЕМ ВАШ АКЦЕНТНЫЙ ЦВЕТ ДЛЯ КОНТУРА
    stroke-width="2"
  />
  <path 
    d="M14 2v6h6" 
    fill="none" 
    stroke="var(--color-primary)" // <-- ИСПОЛЬЗУЕМ ВАШ АКЦЕНТНЫЙ ЦВЕТ ДЛЯ КОНТУРА
    stroke-width="2"
  />
</svg>`;

// 4. ВИДЕО: Заливка и контур акцентным цветом
const SVG_VIDEO_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path 
    d="M23 7l-7 5 7 5V7z" 
    fill="var(--color-primary)" // <-- ЗАЛИВКА
  />
  <rect 
    x="1" y="5" width="15" height="14" rx="2" ry="2" 
    fill="none" 
    stroke="var(--color-primary)" // <-- КОНТУР
    stroke-width="2"
  />
</svg>`;

const SVG_CHEVRON_ICON = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="var(--color-text)">
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
    </svg>`;

window.SVG_CHEVRON_ICON = SVG_CHEVRON_ICON;

// --- 1. ПЕРЕМЕННЫЕ СОСТОЯНИЯ ---
let fileStructure = {};
let currentPath1 = ["Upload"]; // <--- ВОЗВРАЩАЕМ 'Upload'
let currentPath2 = ["Upload"]; // <-- ОСТАВЛЕНО: Для правильного отображения в UI
let viewMode1 = "row";
let viewMode2 = "row";
let activeListId = "file-list-1";

window.__fmState = window.__fmState || {
  activePanel: "file-list-1",
  paths: {},
};

// Lightbox bridge (для admin-ui.js)
window.__lightboxItemsByPanel = window.__lightboxItemsByPanel || {};
window.__lightboxItems = window.__lightboxItems || [];

let isRefreshing = false;

function ensurePathArray(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return ["Portfolio"];

    // если строка вида "Upload/Portrait" или "Portfolio/Portrait"
    if (s.includes("/")) return s.split("/").filter(Boolean);

    // одиночный сегмент
    return [s];
  }

  return ["Portfolio"];
}

// --- 2. ЭМУЛЯЦИЯ ДАННЫХ (Структура из скриншота) ---

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "-";

  if (bytes < 1024) return `${bytes} B`;

  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;

  const mb = Math.round(kb / 1024);
  if (mb < 1024) return `${mb} MB`;

  const gb = Math.round(mb / 1024);
  return `${gb} GB`;
}

function formatDate(mtime) {
  if (!Number.isFinite(mtime)) return "";
  const d = new Date(mtime);

  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${date} ${time}`;
}

// --- SORTING (Windows-like) ---
// Состояние сортировки храним по каждой панели отдельно (file-list-1 / file-list-2)
window.fmSortStateByPanel = window.fmSortStateByPanel || {};

function fmGetSortState(panelId) {
  const st = window.fmSortStateByPanel[panelId];
  if (st && st.key && st.dir) return st;
  const def = { key: "name", dir: "asc" };
  window.fmSortStateByPanel[panelId] = def;
  return def;
}

function fmDefaultDirForKey(key) {
  // Как в Проводнике: имя сначала по возрастанию, дата/размер — по убыванию
  return key === "name" ? "asc" : "desc";
}

function fmParseDate(str) {
  // ожидаем: "14.08.2025, 22:13" или "14.08.2025 22:13"
  if (!str) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:,)?\s*(\d{2}):(\d{2})/.exec(
    String(str).trim()
  );
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function fmParseSize(str) {
  // ожидаем: "122 Б", "122 КБ", "3 МБ", "1 ГБ"
  if (!str) return null;
  const m = /^(\d+(?:[\.,]\d+)?)\s*(Б|КБ|МБ|ГБ)$/i.exec(String(str).trim());
  if (!m) return null;
  const n = parseFloat(String(m[1]).replace(",", "."));
  if (!Number.isFinite(n)) return null;

  const unit = String(m[2]).toUpperCase();
  const mult =
    unit === "Б"
      ? 1
      : unit === "КБ"
      ? 1024
      : unit === "МБ"
      ? 1024 * 1024
      : unit === "ГБ"
      ? 1024 * 1024 * 1024
      : 1;

  return n * mult;
}

function fmSortEntries(entries, sortState) {
  const key = (sortState && sortState.key) || "name";
  const dir = (sortState && sortState.dir) || "asc";
  const factor = dir === "desc" ? -1 : 1;

  // Папки всегда сверху — как в твоём UX сейчас
  const folders = entries.filter(([, it]) => it && it.type === "folder");
  const files = entries.filter(([, it]) => it && it.type !== "folder");

  const cmp = ([aName, aItem], [bName, bItem]) => {
    let aVal, bVal;

    if (key === "date") {
      aVal = fmParseDate(aItem && aItem.date);
      bVal = fmParseDate(bItem && bItem.date);
      if (aVal == null && bVal == null) {
        // fallthrough to name
      } else if (aVal == null) return 1; // пустые вниз
      else if (bVal == null) return -1;
      else if (aVal !== bVal) return (aVal - bVal) * factor;
    } else if (key === "size") {
      aVal = fmParseSize(aItem && aItem.size);
      bVal = fmParseSize(bItem && bItem.size);
      if (aVal == null && bVal == null) {
        // fallthrough to name
      } else if (aVal == null) return 1;
      else if (bVal == null) return -1;
      else if (aVal !== bVal) return (aVal - bVal) * factor;
    }

    // name (default / tie-break)
    const aS = String(aName || "");
    const bS = String(bName || "");
    return (
      aS.localeCompare(bS, "ru", { numeric: true, sensitivity: "base" }) *
      factor
    );
  };

  folders.sort(cmp);
  files.sort(cmp);
  return folders.concat(files);
}

function applyNodeToStructure(targetFolder, node) {
  if (!node || typeof node !== "object") return;

  if (node.type === "folder") {
    if (!targetFolder[node.name]) {
      targetFolder[node.name] = {
        type: "folder",
        date: "",
        size: "-",
      };
    }

    const folderObj = targetFolder[node.name];

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => applyNodeToStructure(folderObj, child));
    }
  } else if (node.type === "file") {
    targetFolder[node.name] = {
      type: "file",
      date: formatDate(node.mtime),
      size: formatSize(node.size),
    };
  }
}

// 1: Вернули ключ 'Upload' для совместимости с renderFileTree.
function transformPortfolioJson(json) {
  const root = {
    Upload: {
      type: "folder",
      date: "",
      size: "-",
    },
  };

  const portfolioRoot = root.Upload; // ССЫЛКА НА РЕАЛЬНЫЙ КОРЕНЬ 'Upload'

  if (Array.isArray(json)) {
    // Все реальные папки (Portrait, Wedding) помещаем ВНУТРИ "Upload"
    json.forEach((node) => applyNodeToStructure(portfolioRoot, node));
  }

  return root; // Возвращаем {Upload: {Portrait: {...}, ...}}
}

async function fetchDataFromApi() {
  try {
    const url = window.API_BASE_URL + "/data/portfolio.json?_=" + Date.now();

    const resp = await fetch(url, { cache: "reload" });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const json = await resp.json();
    fileStructure = transformPortfolioJson(json);
  } catch (err) {
    console.error(
      "[FileManager] Не удалось загрузить data/portfolio.json, используем шаблон:",
      err
    );
  }

  return fileStructure;
}

function hideContextMenu() {
  const menuEl = document.getElementById("context-menu");
  if (menuEl) menuEl.classList.add("hidden");

  // снять подсветку выбранного элемента для контекстного меню
  document
    .querySelectorAll(".context-selected")
    .forEach((el) => el.classList.remove("context-selected"));
}

// --- Глобальное обновление данных файлового менеджера ---
window.refreshFileManager = async function () {
  if (isRefreshing) {
    console.log("[refreshFileManager] Already running, skipping...");
    return;
  }

  isRefreshing = true;
  // ✅ запоминаем, какая панель была активной ДО refresh
  const prevActive = activeListId || "file-list-1";

  try {
    await fetchDataFromApi();

    if (typeof window.navigateToFolder === "function") {
      window.navigateToFolder(currentPath1, "file-list-1");
      window.navigateToFolder(currentPath2, "file-list-2");

      // ✅ возвращаем активность панели обратно
      setActivePanel(prevActive);
    }

    console.log("[refreshFileManager] Update complete");
  } catch (err) {
    console.error("[refreshFileManager] Failed to update data:", err);
  } finally {
    isRefreshing = false;
  }
};

document.getElementById("preview-btn")?.addEventListener("click", () => {
  const panelId = window.__fmState?.activePanel || "file-list-1";
  const list = document.getElementById(panelId);
  if (!list) return;

  const selected = Array.from(list.querySelectorAll(".selected[data-name]"));
  if (selected.length !== 1) return;

  const el = selected[0];
  const name = el.dataset.name;
  const type = el.dataset.type;

  if (!name || name === "." || name === ".." || type === "folder") return;

  const items =
    window.__lightboxItemsByPanel?.[panelId] || window.__lightboxItems || [];
  const idx = items.findIndex((it) => it && it.name === name);

  if (idx >= 0 && typeof window.openLightbox === "function") {
    window.openLightbox(idx);
    return;
  }

  // не-медиа: показываем обычный preview
  const pathArr =
    (window.__fmState?.paths && window.__fmState.paths[panelId]) ||
    (list.dataset.path ? list.dataset.path.split("/").filter(Boolean) : []);
  showPreviewFM({ type, name, path: pathArr, panelId });
});

function fmIsTouchUi() {
  return (
    (window.matchMedia &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
  );
}

// ===============================
// Split DnD (diagnostic stage)
// ===============================
const FM_DND_MIME = "application/x-fm-dnd";
let fmDnDPayload = null;

function fmPathStrToArr(p) {
  return (p || "")
    .split("/")
    .map((s) => (s || "").trim())
    .filter(Boolean);
}

function fmGetServerBaseArrFromList(listEl) {
  const arr = fmPathStrToArr(listEl?.dataset?.path || "");
  // normalizePathForServer у тебя уже есть (мы его используем)
  return typeof normalizePathForServer === "function"
    ? normalizePathForServer(arr)
    : arr;
}

function fmClearDnDClasses(root = document) {
  root
    .querySelectorAll(".fm-dnd-drop-target")
    .forEach((el) => el.classList.remove("fm-dnd-drop-target"));
  root
    .querySelectorAll(".fm-dnd-dragging")
    .forEach((el) => el.classList.remove("fm-dnd-dragging"));
}
/*
function bindSplitDnD(panelId) {
  const list = document.getElementById(panelId);
  if (!list || list.dataset.dndBound === "1") return;
  list.dataset.dndBound = "1";

  // dragstart (делегированно)
  list.addEventListener("dragstart", (e) => {
    const itemEl = e.target.closest(".file-row, .file-tile");
    if (!itemEl) return;

    const name = item.dataset.name;
    const type = item.dataset.type;
    if (!name || name === "." || name === "..") {
      e.preventDefault();
      return;
    }

    // важно: у thumbnails <img> может пытаться перетаскиваться сама картинка
    // поэтому мы тащим контейнер
    item.classList.add("fm-dnd-dragging");

    fmDnDPayload = {
      fromPanelId: panelId,
      name,
      type,
      baseArr: fmGetServerBaseArrFromList(list),
    };

    try {
      e.dataTransfer.setData(FM_DND_MIME, JSON.stringify(fmDnDPayload));
      e.dataTransfer.effectAllowed = "move";
    } catch {}
  });

  list.addEventListener("dragend", () => {
    fmClearDnDClasses(document);
    fmDnDPayload = null;
  });

  // dragover (подсветка папки-цели)
  list.addEventListener("dragover", (e) => {
    const folder = e.target.closest(
      '.file-row[data-type="folder"], .file-tile[data-type="folder"]'
    );
    if (!folder) return;

    const folderName = folder.dataset.name;
    if (!folderName || folderName === "." || folderName === "..") return;

    e.preventDefault(); // иначе drop не сработает
    folder.classList.add("fm-dnd-drop-target");
    try {
      e.dataTransfer.dropEffect = "move";
    } catch {}
  });

  list.addEventListener("dragleave", (e) => {
    const folder = e.target.closest?.(
      '.file-row[data-type="folder"], .file-tile[data-type="folder"]'
    );
    if (folder) folder.classList.remove("fm-dnd-drop-target");
  });

  // drop (пока только лог)
  list.addEventListener("drop", (e) => {
    const folder = e.target.closest(
      '.file-row[data-type="folder"], .file-tile[data-type="folder"]'
    );
    if (!folder) return;

    const folderName = folder.dataset.name;
    if (!folderName || folderName === "." || folderName === "..") return;

    e.preventDefault();
    fmClearDnDClasses(document);

    let payload = null;
    try {
      const txt = e.dataTransfer.getData(FM_DND_MIME);
      payload = txt ? JSON.parse(txt) : fmDnDPayload;
    } catch {
      payload = fmDnDPayload;
    }

    const targetPanelId = folder.dataset.panel || panelId;
    const targetList = document.getElementById(targetPanelId) || list;
    const targetBaseArr = fmGetServerBaseArrFromList(targetList);

    console.log("[FM_DND] DROP ON FOLDER:", {
      from: payload,
      to: { targetPanelId, targetBaseArr, folderName },
    });
  });
}
*/
// --- 3. Логика операций (Открыть, Переименовать, Удалить) ---

function buildPreviewUrl(pathArr, name) {
  const safePath = normalizePathForServer(ensurePathArray(pathArr));
  const parts = (Array.isArray(safePath) ? safePath : [])
    .concat(name)
    .filter(Boolean)
    .map(encodeURIComponent);

  return `${window.API_BASE_URL}/uploads/${parts.join("/")}`;
}

function fmUpdateLightboxItems(listId, pathArr, entries) {
  const isImageName = (n) =>
    /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)$/i.test(String(n || ""));
  const isVideoName = (n) => /\.(mp4|webm|mov|m4v|ogg)$/i.test(String(n || ""));

  const items = [];

  for (const [name, item] of entries || []) {
    if (!item || item.type === "folder") continue;
    if (!(isImageName(name) || isVideoName(name))) continue;

    items.push({
      type: isVideoName(name) ? "video" : "image",
      src: buildPreviewUrl(pathArr, name),
      name,
      caption: name,
    });
  }

  window.__lightboxItemsByPanel[listId] = items;

  // Важно: window.__lightboxItems должен соответствовать АКТИВНОЙ панели
  if (activeListId === listId) {
    window.__lightboxItems = items;
  }
}

function getListPanelIdFromListId(listId) {
  return listId === "file-list-2" ? "list-panel-2" : "list-panel-1";
}

function ensurePanelBody(listId) {
  const listPanelId = getListPanelIdFromListId(listId);
  const panel = document.getElementById(listPanelId);
  const listEl = document.getElementById(listId);
  if (!panel || !listEl) return null;

  let body = panel.querySelector(".panel-body");
  if (!body) {
    body = document.createElement("div");
    body.className = "panel-body";
    const header = panel.querySelector(".panel-header");
    if (header && header.nextSibling)
      panel.insertBefore(body, header.nextSibling);
    else panel.appendChild(body);
  }

  if (listEl.parentElement !== body) body.appendChild(listEl);
  return body;
}

function showPreviewFM({ type, name, path, panelId }) {
  const pane = document.getElementById("previewPane");
  const img = document.getElementById("previewImage");
  const video = document.getElementById("previewVideo");
  const errBox = document.getElementById("previewError");

  bindPreviewCloseBtnFM();

  if (!pane || !img) return;

  const pid = panelId || activeListId || "file-list-1";
  const body = ensurePanelBody(pid);
  if (!body) return;

  // preview принадлежит активной панели
  pane.classList.add("fm-preview");
  body.appendChild(pane);

  if (errBox) errBox.hidden = true;

  const url = buildPreviewUrl(path, name);

  // video
  if (type === "video" && video) {
    img.hidden = true;
    video.hidden = false;

    video.style.display = "";
    img.style.display = "none";

    video.src = url;
    video.load();
  } else {
    // image (по умолчанию)
    if (video) {
      try {
        video.pause();
      } catch {}
      video.removeAttribute("src");
      video.load();
      video.hidden = true;

      video.style.display = "none";
      img.style.display = "";
    }

    img.hidden = false;
    img.onload = () => errBox && (errBox.hidden = true);
    img.onerror = () => {
      img.removeAttribute("src");
      if (errBox) errBox.hidden = false;
    };
    img.src = url;
    img.alt = name;
  }

  pane.hidden = false;
}

function hidePreviewFM() {
  const pane = document.getElementById("previewPane");
  const img = document.getElementById("previewImage");
  const video = document.getElementById("previewVideo");
  if (!pane) return;

  pane.hidden = true;
  if (img) img.removeAttribute("src");

  if (video) {
    try {
      video.pause();
    } catch {}
    video.removeAttribute("src");
    video.load();
  }
}

function bindPreviewCloseBtnFM() {
  const btn = document.getElementById("previewCloseBtn");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      hidePreviewFM();
    } catch {
      // запасной вариант, если вдруг вызов идёт не из того режима
      if (typeof window.hidePreview === "function") window.hidePreview();
    }
  });
}

function handleOpen(type, name, path, panelId) {
  const pid =
    panelId ||
    (typeof window.getActiveListId === "function" &&
      window.getActiveListId()) ||
    "file-list-1";

  // ПАПКА
  if (type === "folder") {
    const base = Array.isArray(path) ? path.slice() : [];

    // ✅ up-level
    if (name === ".." || name === ".") {
      const up = base.length > 1 ? base.slice(0, -1) : base;
      window.navigateToFolder?.(up, pid);
      return;
    }

    const nextPath =
      base.length && base[base.length - 1] === name ? base : base.concat(name);

    window.navigateToFolder?.(nextPath, pid);
    return;
  }

  // ФАЙЛ: если это медиа — открываем lightbox (по осознанному действию "Open")
  const isImage = /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)$/i.test(
    String(name || "")
  );
  const isVideo = /\.(mp4|webm|mov|m4v|ogg)$/i.test(String(name || ""));

  const items =
    window.__lightboxItemsByPanel?.[pid] || window.__lightboxItems || [];

  const idx = items.findIndex((it) => it && it.name === name);

  if (
    (isImage || isVideo) &&
    idx >= 0 &&
    typeof window.openLightbox === "function"
  ) {
    window.openLightbox(idx);
    return;
  }

  // иначе (или если не нашли индекс) — обычный previewPane
  showPreviewFM({ type: isVideo ? "video" : type, name, path, panelId: pid });
}

async function handleDelete(path, clickedName, panelId) {
  const basePath = (path || []).join("/");

  // 1) Собираем пачку выделенных в этой панели
  let names = [];
  const list = panelId ? document.getElementById(panelId) : null;

  if (list) {
    names = Array.from(list.querySelectorAll(".selected[data-name]"))
      .map((n) => n.dataset.name)
      .filter((n) => n && n !== "." && n !== "..");
  }

  // 2) Если выделения нет — удаляем только то, по чему вызвали действие
  //    Или если кликнули по одному, который НЕ входит в текущее выделение — тоже удаляем только его
  const clickedIsInSelection = names.includes(clickedName);
  if (!names.length || !clickedIsInSelection) {
    names = [clickedName].filter((n) => n && n !== "." && n !== "..");
  }

  // уникализируем (на всякий)
  names = [...new Set(names)];

  if (!names.length) return;

  // 3) Подтверждение один раз
  const msg =
    names.length === 1
      ? `Delete "${names[0]}"?`
      : `Delete ${names.length} selected item(s)?`;

  const run = async () => {
    for (const nm of names) {
      // ВАЖНО: skipConfirm=true, потому что мы уже спросили один раз
      await window.deleteItem?.(nm, {
        basePathOverride: basePath,
        skipConfirm: true,
      });
    }
  };

  if (typeof window.showConfirmModal === "function") {
    window.showConfirmModal(msg, run);
  } else {
    // запасной вариант
    if (confirm(msg)) await run();
  }
}

// ===============================
// Name validation (Windows-like)
// - forbidden: / \ : * ? " < > |
// - folders: dot (.) is not allowed
// ===============================
const FM_FORBIDDEN_NAME_RE = /[\\\/\:\*\?"\<\>\|]/;

function fmValidateName(newName, kind) {
  const v = (newName || "").trim();
  if (!v) return { ok: false, message: "Name cannot be empty" };
  if (v === "." || v === "..") return { ok: false, message: "Invalid name" };
  if (FM_FORBIDDEN_NAME_RE.test(v)) {
    return {
      ok: false,
      message: 'Prohibited characters: \\ / : * ? " < > |',
    };
  }
  if (kind === "folder" && v.includes(".")) {
    return {
      ok: false,
      message: "Dots cannot be used in folder names (.)",
    };
  }
  if (kind === "file" && v.startsWith(".")) {
    return { ok: false, message: "File names cannot begin with a period (.)" };
  }
  return { ok: true, value: v };
}

function fmToastInvalidName(message) {
  if (typeof window.showToast === "function")
    window.showToast(message, "warning");
}

/**
 * Инициализирует визуальный режим переименования.
 */
function initializeRename(path, oldName, targetElement) {
  const inputField = document.createElement("input");
  inputField.type = "text";
  inputField.value = oldName;
  inputField.className = "rename-input";

  let renameInProgress = false;
  // 🛡️ Защита от двойного восстановления (blur + rerender + завершение запроса)
  let restoreOnce = false;

  let nameWrapper;
  if (targetElement.tagName === "TR") {
    nameWrapper = targetElement.querySelector(".file-name");
  } else if (targetElement.classList.contains("file-tile")) {
    nameWrapper = targetElement.querySelector(".tile-name");
  } else {
    return;
  }

  const originalContent = nameWrapper.innerHTML;
  nameWrapper.innerHTML = "";
  nameWrapper.appendChild(inputField);

  inputField.focus();
  const dotIndex = oldName.lastIndexOf(".");
  if (dotIndex > 0 && targetElement.dataset.type === "file") {
    inputField.setSelectionRange(0, dotIndex);
  } else {
    inputField.select();
  }

  async function performRename() {
    const newName = inputField.value.trim();

    if (newName === oldName || newName === "") {
      restoreElement();
      return;
    }

    const kind = targetElement?.dataset?.type === "folder" ? "folder" : "file";
    const check = fmValidateName(newName, kind);
    if (!check.ok) {
      fmToastInvalidName(check.message);
      inputField.focus();
      inputField.select();
      return;
    }

    if (renameInProgress) return;
    renameInProgress = true;

    // точный путь папки, где лежит элемент (без корня Portfolio/Upload)
    const basePath = normalizePathForServer(path).join("/");

    await window.renameItem(oldName, check.value, basePath);

    renameInProgress = false;

    restoreElement();
  }

  function restoreElement() {
    // Может вызываться несколько раз (blur + Enter + перерисовка списка)
    if (restoreOnce) return;
    restoreOnce = true;

    // ВАЖНО: снимаем обработчики ДО изменения DOM,
    // чтобы не получить рекурсию/NotFoundError при blur.
    inputField.removeEventListener("blur", restoreElement);
    inputField.removeEventListener("keydown", handleKeyDown);

    // Если узел уже заменён перерисовкой (refreshFileManager) — просто выходим.
    if (!nameWrapper || !nameWrapper.isConnected) {
      try {
        inputField.remove();
      } catch {}
      return;
    }

    if (nameWrapper.contains(inputField)) {
      // Восстанавливаем исходную разметку ячейки (иконка + имя)
      nameWrapper.innerHTML = originalContent;
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      performRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      restoreElement();
    }
  }

  inputField.addEventListener("blur", restoreElement);

  inputField.addEventListener("keydown", handleKeyDown);
}

/**
 * Inline-rename для дерева (узел <li.tree-item>)
 */
function initializeTreeRename(path, oldName, treeItemEl) {
  const nameSpan = treeItemEl.querySelector(".folder-name");
  if (!nameSpan) return;

  const originalHTML = nameSpan.innerHTML;

  const input = document.createElement("input");
  input.type = "text";
  input.value = oldName;
  input.className = "rename-input";

  // сохраняем иконку, если она есть
  const icon = nameSpan.querySelector("svg")?.cloneNode(true);

  nameSpan.innerHTML = "";
  if (icon) nameSpan.appendChild(icon);
  nameSpan.appendChild(input);

  // фокус/выделение
  input.focus();
  input.select();

  let done = false;

  async function commit() {
    const proposed = input.value.trim();
    if (!proposed || proposed === oldName) {
      restore();
      return;
    }

    const check = fmValidateName(proposed, "folder");
    if (!check.ok) {
      fmToastInvalidName(check.message);
      input.focus();
      input.select();
      return;
    }

    if (done) return;
    done = true;

    const basePath = normalizePathForServer(path).join("/");
    await window.renameItem(oldName, check.value, basePath);

    restore();
  }

  function restore() {
    if (!nameSpan.isConnected) return;
    nameSpan.innerHTML = originalHTML;
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      restore();
    }
  });

  input.addEventListener("blur", restore);
}

function normalizePathForServer(pathArray) {
  if (!Array.isArray(pathArray)) return [];

  // Проверяем "portfolio" И "upload"
  if (
    pathArray[0].toLowerCase() === "portfolio" ||
    pathArray[0].toLowerCase() === "upload"
  ) {
    // Серверу нужен путь без корневой папки
    return pathArray.slice(1);
  }
  return pathArray;
}

function getActivePath() {
  let base;

  if (activeListId === "file-list-1") {
    base = currentPath1 || [];
  } else if (activeListId === "file-list-2") {
    base = currentPath2 || [];
  } else {
    base = currentPath1 || [];
  }
  base = ensurePathArray(base);

  return normalizePathForServer(base);
}

window.getActivePath = getActivePath;

// ===============================
// DnD for split file manager (between file-list-1 / file-list-2)
// ===============================
const FM_DND_TYPE = "application/x-admin-dnd";
let fmLastPayload = null;

const fmHasFiles = (e) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

const fmHasPayload = (e) =>
  !!e.dataTransfer &&
  Array.from(e.dataTransfer.types || []).includes(FM_DND_TYPE);

function fmPayloadFromEvent(e) {
  try {
    const raw =
      e.dataTransfer.getData(FM_DND_TYPE) ||
      e.dataTransfer.getData("text/plain");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function fmServerBaseFromList(listEl) {
  const domPath = (listEl?.dataset?.path || "").trim();
  const arr = ensurePathArray(domPath);
  const safeArr = normalizePathForServer(arr); // -> ["Trailers"]
  return safeArr.join("/"); // -> "Trailers" или ""
}

function fmBuildPath(base, name) {
  return base ? `${base}/${name}` : name;
}

async function fmMoveItems(sourceBase, items, targetBase) {
  for (const it of items) {
    const oldPath = fmBuildPath(sourceBase, it.name);
    const newPath = fmBuildPath(targetBase, it.name);

    // защита: не переносим в тот же путь / в потомка
    if (newPath === oldPath) continue;
    if (it.kind === "folder" && newPath.startsWith(oldPath + "/")) continue;

    const res = await fetch(window.API_BASE_URL + "/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPath, newPath }),
    });

    if (typeof window.handleResponse === "function") {
      await window.handleResponse(res);
    } else if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  }
}

async function fmUploadFilesTo(targetBase, files) {
  for (const f of files) {
    const form = new FormData();
    form.append("folderPath", targetBase || "");
    form.append("file", f);

    const res = await fetch(window.API_BASE_URL + "/upload-file", {
      method: "POST",
      body: form,
    });

    if (typeof window.handleResponse === "function") {
      await window.handleResponse(res);
    } else if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  }
}

function bindSplitDnD(listId) {
  const list = document.getElementById(listId);
  if (!list || list.dataset.splitDnd === "1") return;
  list.dataset.splitDnd = "1";

  const clearMarks = () => {
    document
      .querySelectorAll(".drop-target")
      .forEach((n) => n.classList.remove("drop-target"));
    document
      .querySelectorAll(".dragging")
      .forEach((n) => n.classList.remove("dragging"));
  };

  list.addEventListener("dragstart", (e) => {
    // const el = e.target.closest(".file-row, .file-tile");
    // if (!el) return;
    const itemEl = e.target.closest(".file-row, .file-tile");
    if (!itemEl) return;

    const name = itemEl.dataset.name;
    if (!name || name === "." || name === "..") return;

    const sourceBase = fmServerBaseFromList(list);

    // берём выделенные ТОЛЬКО внутри этой панели
    const selected = Array.from(
      list.querySelectorAll(".selected[data-name]")
    ).filter((n) => n.dataset.name && n.dataset.name !== "..");

    const pack = selected.length ? selected : [itemEl];

    pack.forEach((n) => n.classList.add("dragging"));

    const items = pack
      .map((n) => ({
        name: n.dataset.name,
        kind: n.dataset.type === "folder" ? "folder" : "file",
      }))
      .filter((it) => !!it.name);

    const payload = { sourceListId: listId, sourceBase, items };
    fmLastPayload = payload;

    try {
      e.dataTransfer.setData(FM_DND_TYPE, JSON.stringify(payload));
      e.dataTransfer.setData("text/plain", JSON.stringify(payload)); // Chrome
      e.dataTransfer.effectAllowed = "move";
    } catch {}
  });

  list.addEventListener("dragend", () => {
    clearMarks();
    fmLastPayload = null;
  });

  const allow = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = fmHasFiles(e) ? "copy" : "move";
  };

  list.addEventListener("dragover", (e) => {
    const folder = e.target.closest(
      '.file-row[data-type="folder"], .file-tile[data-type="folder"]'
    );
    if (!folder) return allow(e);

    const folderName = folder.dataset.name;
    if (!folderName || folderName === "..") return allow(e);

    allow(e);
    folder.classList.add("drop-target");

    e.preventDefault();
  });

  list.addEventListener("dragleave", (e) => {
    const folder = e.target.closest?.(
      '.file-row[data-type="folder"], .file-tile[data-type="folder"]'
    );
    if (folder) folder.classList.remove("drop-target");
  });

  list.addEventListener(
    "drop",
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const folder = e.target.closest(
        '.file-row[data-type="folder"], .file-tile[data-type="folder"]'
      );
      const base = fmServerBaseFromList(list);

      const folderName = folder?.dataset?.name;
      const targetBase =
        folderName && folderName !== ".."
          ? base
            ? `${base}/${folderName}`
            : folderName
          : base;

      clearMarks();

      try {
        // 1) внешние файлы из проводника
        if (fmHasFiles(e)) {
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length) {
            await fmUploadFilesTo(targetBase, files);
            window.showToast?.(`Uploaded ${files.length} file(s)`, "success");
            await window.refreshFileManager?.();
          }
          return;
        }

        // 2) перенос своих элементов
        const data =
          (fmHasPayload(e) ? fmPayloadFromEvent(e) : null) || fmLastPayload;
        if (!data?.items?.length) return;

        await fmMoveItems(data.sourceBase || "", data.items, targetBase || "");
        window.showToast?.(`Moved ${data.items.length} item(s)`, "success");
        await window.refreshFileManager?.();
      } catch (err) {
        console.error("[splitDnD] drop error:", err);
        window.showToast?.("Operation failed", "error");
      }
    },
    true
  );
}

// ======================================================================
// [FM] Touch DnD: drag selected items into a folder (mobile only)
// ======================================================================

function bindTouchDnD(listId) {
  const list = document.getElementById(listId);
  if (!list || list.dataset.touchDndBound === "1") return;
  list.dataset.touchDndBound = "1";

  // включаем только на тач-UI
  if (!(typeof fmIsTouchUi === "function" && fmIsTouchUi())) return;

  const TOL = 10;

  let dragging = false;
  let start = null;
  let ghost = null;
  let targetFolder = null;

  const clearDropMarks = () => {
    document
      .querySelectorAll(".drop-target, .fm-dnd-drop-target")
      .forEach((n) => n.classList.remove("drop-target", "fm-dnd-drop-target"));
  };

  const ensureGhost = () => {
    if (ghost) return ghost;
    ghost = document.createElement("div");
    ghost.className = "fm-touch-ghost";
    ghost.textContent = "Moving…";
    document.body.appendChild(ghost);
    return ghost;
  };

  const moveGhost = (x, y, label) => {
    const g = ensureGhost();
    if (label) g.textContent = label;
    g.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
  };

  const getSelectedPack = () => {
    const selected = Array.from(
      list.querySelectorAll(".selected[data-name]")
    ).filter(
      (n) => n.dataset.name && n.dataset.name !== ".." && n.dataset.name !== "."
    );
    if (selected.length) return selected;

    // если ничего не выделено — тянем тот элемент, с которого стартовали
    return [];
  };

  const startDrag = (e, itemEl) => {
    dragging = true;
    document.body.classList.add("fm-touch-dnd");
    clearDropMarks();
    targetFolder = null;

    setActivePanel(listId);

    // если не было выделения — выделяем этот элемент
    if (!itemEl.classList.contains("selected")) {
      setSelectedInPanel(listId, itemEl, e);
    }

    const pack = getSelectedPack();
    const label =
      pack.length > 1
        ? `Move ${pack.length} items`
        : `Move ${itemEl.dataset.name}`;
    moveGhost(e.clientX, e.clientY, label);
  };

  const stopDrag = async () => {
    if (!dragging) return;

    dragging = false;
    document.body.classList.remove("fm-touch-dnd");
    clearDropMarks();

    if (ghost) {
      ghost.remove();
      ghost = null;
    }

    // если не бросили на папку — просто выходим
    if (!targetFolder) return;

    const folderName = targetFolder.dataset.name;
    if (!folderName || folderName === ".." || folderName === ".") return;

    // source
    const sourceBase = fmServerBaseFromList(list);

    // items (берём выделенные)
    const pack = Array.from(
      list.querySelectorAll(".selected[data-name]")
    ).filter(
      (n) => n.dataset.name && n.dataset.name !== ".." && n.dataset.name !== "."
    );
    if (!pack.length) return;

    const items = pack.map((n) => ({
      name: n.dataset.name,
      kind: n.dataset.type === "folder" ? "folder" : "file",
    }));

    // target base
    const base = fmServerBaseFromList(list);
    const targetBase = base ? `${base}/${folderName}` : folderName;

    try {
      await fmMoveItems(sourceBase || "", items, targetBase || "");
      window.showToast?.(`Moved ${items.length} item(s)`, "success");
      await window.refreshFileManager?.();
    } catch (err) {
      console.error("[touchDnD] move error:", err);
      window.showToast?.("Operation failed", "error");
    }
  };

  list.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "touch") return;
      if (e.target.closest("#context-menu")) return;

      const itemEl = e.target.closest(".file-row, .file-tile");
      if (!itemEl) return;

      const name = itemEl.dataset.name;
      if (!name || name === ".." || name === ".") return;

      start = { x: e.clientX, y: e.clientY, pid: e.pointerId, itemEl };
      targetFolder = null;
    },
    { capture: true, passive: true }
  );

  list.addEventListener(
    "pointermove",
    (e) => {
      if (!start || e.pointerId !== start.pid) return;

      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);

      // начинаем dnd только если реально потянули
      if (!dragging && (dx > TOL || dy > TOL)) {
        startDrag(e, start.itemEl);
      }

      if (!dragging) return;

      moveGhost(e.clientX, e.clientY);

      // ищем папку под пальцем
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const folder = el?.closest?.(
        '.file-row[data-type="folder"], .file-tile[data-type="folder"]'
      );

      clearDropMarks();
      targetFolder = null;

      if (folder) {
        folder.classList.add("drop-target");
        targetFolder = folder;
      }
    },
    { capture: true, passive: true }
  );

  list.addEventListener(
    "pointerup",
    async (e) => {
      if (start && e.pointerId === start.pid) {
        start = null;
      }
      await stopDrag();
    },
    { capture: true, passive: true }
  );

  list.addEventListener(
    "pointercancel",
    async () => {
      start = null;
      await stopDrag();
    },
    { capture: true, passive: true }
  );
}

// --- 4. ФУНКЦИЯ РЕНДЕРИНГА СПИСКА (FileList) ---

// 2: Логика получения содержимого с учетом внутреннего 'Upload' и внешнего 'Portfolio'.
function renderFileList(path, containerId, viewMode) {
  const pathKeys = path.slice();
  // Если текущий путь (визуальный) начинается с "Portfolio",
  // мы заменяем его на "Upload" для поиска в структуре.
  if (pathKeys.length > 0 && pathKeys[0].toLowerCase() === "portfolio") {
    pathKeys[0] = "Upload";
  }

  // Теперь ищем содержимое по модифицированному пути:
  const currentFolder = pathKeys.reduce(
    (acc, key) => acc && acc[key],
    fileStructure
  );

  const container = document.getElementById(containerId);

  // 🛡️ Проверка, что структура данных корректна
  if (
    !currentFolder ||
    typeof currentFolder !== "object" ||
    Array.isArray(currentFolder)
  ) {
    if (path.length === 1 && path[0].toLowerCase() === "portfolio") {
      container.innerHTML =
        '<div style="padding: 20px; text-align: center;">Loading data...</div>';
    } else {
      container.innerHTML =
        '<div style="padding: 20px; text-align: center;">Incorrect path or data structure.</div>';
    }

    return;
  }

  container.innerHTML = "";

  container.className = `panel-content ${
    viewMode === "row" ? "file-list-row" : "file-list-grid"
  }`;

  const showUpLink = path.length > 1;

  // --- РЕЖИМ СТРОКИ (ТАБЛИЦА) ---
  if (viewMode === "row") {
    const sortState = fmGetSortState(containerId);
    let html = `
            <table class="file-list-table">
                <thead>
                    <tr><th data-sort="name" class="${
                      sortState.key === "name" ? "sort-" + sortState.dir : ""
                    }">Name</th><th data-sort="date" class="${
      sortState.key === "date" ? "sort-" + sortState.dir : ""
    }">Date</th><th data-sort="size" class="${
      sortState.key === "size" ? "sort-" + sortState.dir : ""
    }">Size</th></tr>
                </thead>
                <tbody>`;

    if (showUpLink) {
      html += `<tr class="file-row up-level-link" data-name=".." data-type="folder" data-panel="${containerId}">
                    <td class="file-name">${SVG_UP_ICON} ..</td>
                    <td></td><td></td>
                  </tr>`;
    }

    const entries = Object.entries(currentFolder).filter(
      ([, item]) => typeof item === "object" && item.type
    );

    fmUpdateLightboxItems(containerId, path, entries);

    const sortedEntries = fmSortEntries(entries, sortState);

    for (const [name, item] of sortedEntries) {
      // 🛑 ИЗМЕНЕНИЕ: Используем SVG-константы вместо классов CSS
      const iconHtml =
        item.type === "folder"
          ? SVG_FOLDER_ICON
          : item.type === "video"
          ? SVG_VIDEO_ICON
          : SVG_FILE_ICON;

      const sizeDisplay = item.type === "folder" ? "-" : item.size || "-";

      html += `<tr class="file-row" data-name="${name}" data-type="${
        item.type
      }" data-panel="${containerId}">
                        <td class="file-name">${iconHtml} ${name}</td> 
                        <td>${item.date || ""}</td>
                        <td>${sizeDisplay}</td>
                    </tr>`;
    }

    html += `</tbody></table>`;
    container.innerHTML = html;

    makeColumnsResizable(containerId);

    // --- Сортировка по клику на заголовок (как в Проводнике) ---
    container.querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        const st = fmGetSortState(containerId);

        const nextDir =
          st.key === key
            ? st.dir === "asc"
              ? "desc"
              : "asc"
            : fmDefaultDirForKey(key);

        window.fmSortStateByPanel[containerId] = { key, dir: nextDir };

        // перерисовать эту же панель в режиме строк
        renderFileList(path, containerId, "row");
      });
    });

    // Назначение слушателей
    container.querySelectorAll(".file-row").forEach((row) => {
      const rowLogic = (e) => {
        const name = row.dataset.name;
        const type = row.dataset.type;
        let currentPath = row.dataset.panel.includes("list-1")
          ? currentPath1
          : currentPath2;

        if (name === "..") {
          if (currentPath.length > 1) {
            currentPath = currentPath.slice(0, -1);
          }
        } else if (type === "folder") {
          currentPath = [...currentPath, name];
        }

        if (type === "folder") {
          window.navigateToFolder(currentPath, row.dataset.panel);
        } else if (type === "file") {
          handleOpen(type, name, currentPath, row.dataset.panel); // для строк
        }
      };

      row.addEventListener("click", (e) => {
        // если сейчас редактируем имя — не трогаем
        if (e.target.closest(".rename-input")) return;

        setActivePanel(row.dataset.panel);
        setSelectedInPanel(row.dataset.panel, row, e);

        // ✅ Mobile-friendly: один тап по медиа-файлу открывает lightbox
        /*
        const type = row.dataset.type;
        const name = row.dataset.name;

       
        if (fmIsTouchUi() && type === "file") {
          const panelId = row.dataset.panel;

    
          const items =
            window.__lightboxItemsByPanel?.[panelId] ||
            window.__lightboxItems ||
            [];
          const idx = items.findIndex((it) => it && it.name === name);

         
          if (idx >= 0 && typeof window.openLightbox === "function") {
            window.openLightbox(idx);
          }
        } */
      });

      row.addEventListener("dblclick", rowLogic);

      row.addEventListener("contextmenu", (e) => {
        let currentPath = row.dataset.panel.includes("list-1")
          ? currentPath1
          : currentPath2;
        window.showContextMenu(e, row, currentPath);
      });
    });
  }
  // --- РЕЖИМ ПЛИТКИ (GRID) ---
  else if (viewMode === "tile") {
    let html = "";

    if (showUpLink) {
      html += `<div class="file-tile up-level-link" data-name=".." data-type="folder" data-panel="${containerId}">
     
                    <div class="tile-visual">
                      <i class="bi bi-arrow-up-square tile-ico tile-ico-up" aria-hidden="true"></i>
                    </div>
                    <span class="tile-name">..</span>
                </div>`;
    }

    const entries = Object.entries(currentFolder).filter(
      ([, item]) => typeof item === "object" && item.type
    );

    fmUpdateLightboxItems(containerId, path, entries);

    const sortedEntries = [
      ...entries.filter(([, item]) => item.type === "folder"),
      ...entries.filter(([, item]) => item.type !== "folder"),
    ];

    const isImageName = (n) =>
      /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)$/i.test(String(n || ""));
    const isVideoName = (n) =>
      /\.(mp4|webm|mov|m4v|ogg)$/i.test(String(n || ""));

    for (const [name, item] of sortedEntries) {
      const type = item && item.type ? item.type : "file";

      let visualHtml = "";

      if (type === "folder") {
        visualHtml = `<i class="bi bi-folder-fill tile-ico tile-ico-folder" aria-hidden="true"></i>`;
      } else if (type === "video" || isVideoName(name)) {
        visualHtml = `<i class="bi bi-film tile-ico tile-ico-video" aria-hidden="true"></i>`;
      } else if (isImageName(name)) {
        // Миниатюра: показываем сам файл (как в Проводнике для картинок)
        const thumbUrl = buildPreviewUrl(path, name);

        visualHtml = `<img class="tile-thumb tile-thumb-image" src="${thumbUrl}" alt="" loading="lazy">`;
      } else {
        visualHtml = `<i class="bi bi-file-earmark tile-ico tile-ico-file" aria-hidden="true"></i>`;
      }

      html += `<div class="file-tile" data-name="${name}" data-type="${type}" data-panel="${containerId}">
                    <div class="tile-visual">
                      ${visualHtml}
                    </div>
                    <span class="tile-name">${name}</span>
                </div>`;
    }

    container.innerHTML = html;

    // Назначение слушателей для плиток
    container.querySelectorAll(".file-tile").forEach((tile) => {
      tile.addEventListener("dblclick", (e) => {
        const name = tile.dataset.name;
        const type = tile.dataset.type;
        let currentPath = tile.dataset.panel.includes("list-1")
          ? currentPath1
          : currentPath2;

        if (name === "..") {
          if (currentPath.length > 1) currentPath = currentPath.slice(0, -1);
        } else if (type === "folder") {
          currentPath = [...currentPath, name];
        }

        if (type === "folder") {
          window.navigateToFolder(currentPath, tile.dataset.panel);
        } else if (type === "file") {
          handleOpen(type, name, currentPath, tile.dataset.panel); // для плиток
        }
      });

      tile.addEventListener("contextmenu", (e) => {
        let currentPath = tile.dataset.panel.includes("list-1")
          ? currentPath1
          : currentPath2;
        window.showContextMenu(e, tile, currentPath);
      });

      tile.addEventListener("click", (e) => {
        if (e.target.closest(".rename-input")) return;

        setActivePanel(tile.dataset.panel);
        setSelectedInPanel(tile.dataset.panel, tile, e);

        // ✅ Mobile-friendly: один тап по медиа-файлу открывает lightbox
        /* if (!fmIsTouchUi()) return;

        const type = tile.dataset.type;
        const name = tile.dataset.name;
        if (type !== "file") return;

        const panelId = tile.dataset.panel;
        const items =
          window.__lightboxItemsByPanel?.[panelId] ||
          window.__lightboxItems ||
          [];
        const idx = items.findIndex((it) => it && it.name === name);

        if (idx >= 0 && typeof window.openLightbox === "function") {
          window.openLightbox(idx);
        }*/
      });
    });
  }

  // DnD: делаем элементы перетаскиваемыми и биндим делегированные обработчики
  container.querySelectorAll(".file-row, .file-tile").forEach((el) => {
    const nm = el.dataset.name;
    if (nm && nm !== "." && nm !== "..") el.draggable = true;
  });

  // чтобы миниатюры не перетаскивались как картинки
  container.querySelectorAll("img").forEach((img) => (img.draggable = false));

  bindSplitDnD(containerId);
}

// --- 5. ГЛОБАЛЬНЫЕ ФУНКЦИИ (доступны извне) ---

/**
 * Форматирует сегмент пути:
 * 'Historical_portrait' -> 'Historical portrait'
 */
function formatPathSegment(segment) {
  if (!segment) return "";
  const withSpaces = segment.replace(/[_-]+/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Возвращает "красивое" имя сегмента пути для UI.
 * Нужна, чтобы внутренний корень Upload отображался как Portfolio.
 */
window.getDisplayPathSegment = function getDisplayPathSegment(segment) {
  const s = String(segment || "").trim();
  if (!s) return "";

  // внутренний корень данных = Upload, внешний UI = Portfolio
  if (s.toLowerCase() === "upload") return "Portfolio";

  // обычная форматировка для остальных сегментов
  return formatPathSegment(s);
};

/**
 * Обновляет заголовок и "крошки" панели по её пути.
 * panelId: "file-list-1" или "file-list-2".
 * * ВАЖНО: Предполагается, что в этом файле доступны:
 * - window.navigateToFolder
 * - formatPathSegment
 * - window.getDisplayPathSegment (для 'Upload' -> 'Portfolio')
 */
function updatePanelHeader(panelId, pathRef) {
  const panelNumber = panelId.includes("1") ? "1" : "2";

  const titleEl = document.querySelector(
    `.panel-header-title[data-panel="${panelNumber}"]`
  );
  const crumbsEl = document.querySelector(
    `.panel-header-breadcrumbs[data-panel="${panelNumber}"]`
  );

  if (!titleEl || !crumbsEl) return;

  // PathRef: ["Upload", "Portrait", "new"]
  // titleSegment - это последний элемент массива pathRef
  const titleSegment = pathRef[pathRef.length - 1] || "Upload";

  // Заголовок окна (последняя папка)
  // Используем getDisplayPathSegment для корня (если titleSegment === 'Upload')
  const titleText = window.getDisplayPathSegment
    ? window.getDisplayPathSegment(titleSegment)
    : formatPathSegment(titleSegment);

  titleEl.textContent = titleText;

  // ----------------------------------------------------
  // ✅ ИЗМЕНЕНИЕ: Рендеринг кликабельных крошек (Breadcrumbs)
  // ----------------------------------------------------
  let breadcrumbHtml = "";

  // pathRef (например, ['Upload', 'Portrait'])
  pathRef.forEach((segment, index) => {
    // 1. Путь для навигации
    const tempPath = pathRef.slice(0, index + 1);

    // 2. Отображаемое имя (заменяет 'Upload' на 'Portfolio')
    // Используем getDisplayPathSegment, если доступна, иначе просто форматируем
    const displaySegment = window.getDisplayPathSegment
      ? window.getDisplayPathSegment(segment)
      : formatPathSegment(segment);

    const isLast = index === pathRef.length - 1;

    // Добавляем разделитель перед всеми сегментами, кроме первого
    if (index > 0) {
      breadcrumbHtml += `<span class="breadcrumb-separator"> / </span>`;
    }

    if (isLast) {
      // Последний элемент - просто текст, без ссылки
      breadcrumbHtml += `<span class="breadcrumb-current">${displaySegment}</span>`;
    } else {
      // Остальные элементы - кликабельные ссылки
      breadcrumbHtml += `<span 
                            class="breadcrumb-link" 
                            data-path="${tempPath.join("/")}"
                            data-panel="${panelId}">
                            ${displaySegment}
                        </span>`;
    }
  });

  crumbsEl.innerHTML = breadcrumbHtml; // Вставляем HTML

  // ----------------------------------------------------
  // ✅ ДОБАВЛЕНИЕ: Обработчик кликов (ВАЖНО! После innerHTML)
  // ----------------------------------------------------
  crumbsEl.querySelectorAll(".breadcrumb-link").forEach((link) => {
    link.addEventListener("click", function () {
      // Получаем путь и ID панели из data-атрибутов
      const pathStr = this.dataset.path;
      const panelId = this.dataset.panel;

      const newPath = pathStr.split("/");

      // Вызываем главную функцию навигации
      window.navigateToFolder(newPath, panelId);
    });
  });
}

/**
 * Переход в новую папку и обновление интерфейса (вызывается из дерева и dblclick)
 */
window.navigateToFolder = function (newPath, panelId) {
  newPath = ensurePathArray(newPath);

  try {
    localStorage.setItem("lastFolderPath", JSON.stringify(newPath));
  } catch {}

  let viewMode;
  let pathRef;

  if (panelId.includes("list-1")) {
    currentPath1 = newPath;
    pathRef = currentPath1;
    viewMode = viewMode1;
  } else if (panelId.includes("list-2")) {
    currentPath2 = newPath;
    pathRef = currentPath2;
    viewMode = viewMode2;
  } else {
    return;
  }

  window.__fmState.paths[panelId] = Array.isArray(pathRef)
    ? pathRef.slice()
    : [];
  window.__fmState.activePanel = panelId;

  // ✅ Пишем текущий путь панели прямо в DOM, чтобы CRUD всегда знал “где мы”
  const listEl = document.getElementById(panelId);
  if (listEl) listEl.dataset.path = (pathRef || []).join("/");

  // Перерисовываем список файлов в нужной панели
  renderFileList(pathRef, panelId, viewMode);

  // Обновляем заголовок и крошки панели
  updatePanelHeader(panelId, pathRef);

  // Обновляем дерево слева (передаем fileStructure, который теперь содержит 'Upload')
  if (typeof window.renderFileTree === "function") {
    window.renderFileTree(fileStructure, newPath);
  }

  // Подсвечиваем активную панель
  setActivePanel(panelId);
};

/**
 * Переключение режима вида (строка/плитка)
 */
window.toggleView = function (view, panelId) {
  if (panelId === "file-list-1") {
    viewMode1 = view;
    window.navigateToFolder(currentPath1, panelId);
  } else if (panelId === "file-list-2") {
    viewMode2 = view;
    window.navigateToFolder(currentPath2, panelId);
  }
};

/**
 * Устанавливает активную панель списка и обновляет кнопки тулбара.
 * @param {string} listId - ID контейнера списка ('file-list-1' или 'file-list-2')
 */
function setActivePanel(listId) {
  window.__fmState.activePanel = listId;

  activeListId = listId;

  // 1. Управляем CSS классом 'active'
  document.querySelectorAll(".right-panel").forEach((panel) => {
    panel.classList.remove("active");
  });

  const panelContainer = document
    .getElementById(listId)
    .closest(".right-panel");
  if (panelContainer) {
    panelContainer.classList.add("active");
  }

  // 2. Обновляем кнопки вида
  const viewMode = listId === "file-list-1" ? viewMode1 : viewMode2;
  const viewRowBtn = document.getElementById("view-row-btn");
  const viewTileBtn = document.getElementById("view-tile-btn");

  viewRowBtn.classList.toggle("active", viewMode === "row");
  viewTileBtn.classList.toggle("active", viewMode === "tile");

  window.__lightboxItems = window.__lightboxItemsByPanel?.[listId] || [];
}

window.setActivePanel = setActivePanel;

function setSelectedInPanel(panelId, el, evt) {
  const list = document.getElementById(panelId);
  if (!list || !el) return;

  // init selection state
  window.__fmState = window.__fmState || {};
  window.__fmState.selection = window.__fmState.selection || {
    anchorIndex: {},
    focusName: {},
  };
  const selState = window.__fmState.selection;

  const name = el?.dataset?.name || "";
  const type = el?.dataset?.type || "";

  const ctrl = !!(evt && (evt.ctrlKey || evt.metaKey));
  const shift = !!(evt && evt.shiftKey);

  const isNav = name === "." || name === "..";

  const ordered = Array.from(
    list.querySelectorAll(".file-row[data-name], .file-tile[data-name]")
  );
  const idx = ordered.indexOf(el);
  if (idx < 0) return;

  const clearAll = () => {
    list
      .querySelectorAll(".file-row.selected, .file-tile.selected")
      .forEach((x) => {
        x.classList.remove("selected");
        x.removeAttribute("aria-selected");
      });
  };

  const setOn = (node, on = true) => {
    if (!node) return;
    node.classList.toggle("selected", !!on);
    if (on) node.setAttribute("aria-selected", "true");
    else node.removeAttribute("aria-selected");
  };

  // если якоря ещё нет — ставим на текущий
  if (!Number.isInteger(selState.anchorIndex[panelId])) {
    selState.anchorIndex[panelId] = idx;
  }

  // ".." / "." — навигационные: только single-select, без диапазонов/тогглов
  if (isNav) {
    clearAll();
    setOn(el, true);
    selState.anchorIndex[panelId] = idx;
    selState.focusName[panelId] = name;
    hidePreviewFM();
    return;
  }

  // SHIFT: диапазон
  if (shift) {
    const anchor = Number.isInteger(selState.anchorIndex[panelId])
      ? selState.anchorIndex[panelId]
      : idx;

    // Shift без Ctrl = как в Проводнике: заменить выделение диапазоном
    if (!ctrl) clearAll();

    const a = Math.min(anchor, idx);
    const b = Math.max(anchor, idx);
    for (let i = a; i <= b; i++) setOn(ordered[i], true);

    // якорь НЕ меняем (как в Explorer)
  }

  // CTRL: toggle
  else if (ctrl) {
    const nowOn = !el.classList.contains("selected");
    setOn(el, nowOn);
    selState.anchorIndex[panelId] = idx; // новый якорь — на кликнутом
  }

  // обычный клик: single-select
  else {
    clearAll();
    setOn(el, true);
    selState.anchorIndex[panelId] = idx;
  }

  selState.focusName[panelId] = name;

  // --- Preview rule:
  // На desktop НЕ открываем preview по одиночному клику (иначе ломает multi-select).
  // На touch-UI можно оставлять auto-preview (по желанию).
  const selected = Array.from(list.querySelectorAll(".selected[data-name]"));
  if (selected.length !== 1) {
    hidePreviewFM();
    return;
  }

  const one = selected[0];
  const oneName = one?.dataset?.name || "";
  const oneType = one?.dataset?.type || "";

  // если это не файл — прячем preview
  if (!oneName || oneName === "." || oneName === ".." || oneType === "folder") {
    hidePreviewFM();
    return;
  }

  // ✅ авто-preview только на touch/coarse pointer (на десктопе — только dblclick через handleOpen)
  const isTouchUi =
    (window.matchMedia &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  if (isTouchUi) {
    const pathArr =
      (window.__fmState?.paths && window.__fmState.paths[panelId]) ||
      (list.dataset.path ? list.dataset.path.split("/").filter(Boolean) : []);
    showPreviewFM({ type: oneType, name: oneName, path: pathArr, panelId });
  }
  // else: на десктопе ничего не делаем — preview откроется только по dblclick (handleOpen)
}

// ======================================================================
// [FM] Clear selection when clicking empty space inside a panel (Explorer-like)
// ======================================================================

function fmClearSelectionInPanel(panelId, { hidePreview = true } = {}) {
  const list = document.getElementById(panelId);
  if (!list) return;

  // 1) снять .selected
  list
    .querySelectorAll(".file-row.selected, .file-tile.selected")
    .forEach((x) => {
      x.classList.remove("selected");
      x.removeAttribute("aria-selected");
    });

  // 2) сбросить якорь/фокус для Shift-диапазонов
  if (window.__fmState?.selection) {
    delete window.__fmState.selection.anchorIndex?.[panelId];
    delete window.__fmState.selection.focusName?.[panelId];
  }

  // 3) закрыть preview (в админке это логично, чтобы не мешал)
  if (hidePreview && typeof hidePreviewFM === "function") {
    hidePreviewFM();
  }
}

function bindEmptyClickToClearSelection(panelId) {
  const list = document.getElementById(panelId);
  if (!list || list.dataset.emptyClearBound === "1") return;
  list.dataset.emptyClearBound = "1";

  list.addEventListener("click", (e) => {
    // ✅ Если только что закончили лассо — не очищаем выделение
    if (list.dataset.marqueeJustFinished === "1") {
      delete list.dataset.marqueeJustFinished;
      return;
    }

    // ПКМ не трогаем (там контекстное меню)
    if (e.button === 2) return;

    // Если клик по элементу — это НЕ “пустое место”
    if (e.target.closest(".file-row, .file-tile")) return;

    // Не сбрасываем выделение при кликах по “служебным” зонам таблицы
    if (e.target.closest("th[data-sort]")) return; // сортировка
    if (e.target.closest(".resize-handle")) return; // ресайз колонок
    if (e.target.closest(".rename-input")) return; // инпут переименования

    setActivePanel(panelId);
    fmClearSelectionInPanel(panelId);
  });
}

// ✅ Активная панель = та, куда пользователь кликнул (не та, которую "последней перерисовали")
function bindPanelActivation() {
  const p1 = document.getElementById("list-panel-1");
  const p2 = document.getElementById("list-panel-2");

  if (p1) {
    p1.addEventListener(
      "pointerdown",
      () => window.setActivePanel("file-list-1"),
      { capture: true }
    );
  }

  if (p2) {
    p2.addEventListener(
      "pointerdown",
      () => window.setActivePanel("file-list-2"),
      { capture: true }
    );
  }
}

window.addEventListener("load", bindPanelActivation);

// Даем дереву способ узнать, какое окно сейчас активное
window.getActiveListId = function () {
  return activeListId; // "file-list-1" или "file-list-2"
};

/**
 * Инициализирует ресайзер для колонок в таблице.
 * @param {string} containerId - ID контейнера списка.
 */
function makeColumnsResizable(containerId) {
  const container = document.getElementById(containerId);
  const table = container.querySelector(".file-list-table");
  if (!table) return;

  const headerRow = table.querySelector("thead tr");
  let isResizing = false;
  let startX;
  let th;

  // 1. Очищаем старые ручки ресайза, если они были
  container
    .querySelectorAll(".resize-handle")
    .forEach((handle) => handle.remove());

  // 2. Добавляем "ручки" ресайза
  headerRow.querySelectorAll("th").forEach((header, index) => {
    if (index < headerRow.querySelectorAll("th").length - 1) {
      const resizer = document.createElement("div");
      resizer.className = "resize-handle";
      header.appendChild(resizer);

      resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        th = header;
        let currentWidth = th.offsetWidth;
        startX = e.clientX;

        th.style.width = currentWidth + "px";
        th.style.minWidth = "50px";

        document.body.classList.add("resizing");
        e.preventDefault();
      });
    }
  });

  // 3. Движение мыши (меняем ширину)
  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    const deltaX = e.clientX - startX;
    const newWidth = th.offsetWidth + deltaX;

    if (newWidth > 50) {
      th.style.width = newWidth + "px";
    }
    startX = e.clientX;
  });

  // 4. Отпускаем кнопку мыши (завершаем ресайз)
  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.classList.remove("resizing");
    }
  });
}

// --- 6. ИНИЦИАЛИЗАЦИЯ (ВЫПОЛНЯЕТСЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ) ---

window.addEventListener("load", async () => {
  // --- A. Подготовка интерфейса и загрузка данных ---
  const panel1Title = document.querySelector(
    '.panel-header-title[data-panel="1"]'
  );
  const panel2Title = document.querySelector(
    '.panel-header-title[data-panel="2"]'
  );

  if (panel1Title) panel1Title.textContent = "Загрузка содержимого...";
  if (panel2Title) panel2Title.textContent = "Загрузка содержимого...";

  await fetchDataFromApi();

  let savedRaw;
  try {
    savedRaw = JSON.parse(
      localStorage.getItem("lastFolderPath") || '["Portfolio"]'
    );
  } catch {
    savedRaw = ["Portfolio"];
  }

  const savedPath = ensurePathArray(savedRaw);

  // если вдруг сохранилось с Upload — показываем как Portfolio
  if (savedPath[0] && savedPath[0].toLowerCase() === "upload") {
    savedPath[0] = "Portfolio";
  }

  // Проверяем, если в сохраненном пути есть "Upload", заменяем на "Portfolio"
  if (savedPath.length > 0 && savedPath[0].toLowerCase() === "upload") {
    savedPath[0] = "Portfolio";
  }

  currentPath1 = savedPath;
  currentPath2 = ["Portfolio"];

  const mainContainer = document.querySelector(".file-manager-main");
  const listPanel2 = document.getElementById("list-panel-2");
  const fileManagerFooter = document.querySelector(".file-manager-footer");

  if (!fileManagerFooter) {
    console.warn(
      "Кнопки не подключены: Элемент .file-manager-footer не найден в DOM."
    );
  }

  // --- Функция toggleSplit (нужна для обработчика) ---
  function toggleSplit(type) {
    if (!mainContainer || !listPanel2) return;

    mainContainer.classList.remove("vertical-split", "horizontal-split");
    listPanel2.classList.add("hidden");

    document
      .querySelectorAll('.toolbar-btn[id^="split-"]')
      .forEach((btn) => btn.classList.remove("active"));
    if (type === "vertical") {
      mainContainer.classList.add("vertical-split");
      listPanel2.classList.remove("hidden");
      document.getElementById("split-vertical-btn")?.classList.add("active");
    } else if (type === "horizontal") {
      mainContainer.classList.add("horizontal-split");
      listPanel2.classList.remove("hidden");
      document.getElementById("split-horizontal-btn")?.classList.add("active");
    } else {
      listPanel2.classList.add("hidden");
      document.getElementById("split-single-btn")?.classList.add("active");
    }
  }

  // ********* БЛОК: ЕДИНОЕ ДЕЛЕГИРОВАНИЕ СОБЫТИЙ *********

  if (fileManagerFooter) {
    fileManagerFooter.addEventListener("click", (e) => {
      const targetBtn = e.target.closest(".toolbar-btn");
      if (!targetBtn) return;

      const id = targetBtn.id;

      if (id === "split-single-btn") {
        toggleSplit("single");
      } else if (id === "split-vertical-btn") {
        toggleSplit("vertical");
      } else if (id === "split-horizontal-btn") {
        const splitSingleBtn = document.getElementById("split-single-btn");
        const splitVerticalBtn = document.getElementById("split-vertical-btn");

        const hasOtherSplitButtons = !!(splitSingleBtn || splitVerticalBtn);

        if (!hasOtherSplitButtons) {
          const isHorizontal =
            mainContainer.classList.contains("horizontal-split");
          toggleSplit(isHorizontal ? "single" : "horizontal");
        } else {
          toggleSplit("horizontal");
        }
      }

      if (id === "view-row-btn") {
        window.toggleView("row", activeListId);
        targetBtn.classList.add("active");
        document.getElementById("view-tile-btn")?.classList.remove("active");
      } else if (id === "view-tile-btn") {
        window.toggleView("tile", activeListId);
        targetBtn.classList.add("active");
        document.getElementById("view-row-btn")?.classList.remove("active");
      }
    });
  }

  // --- C. Контекстное меню ---

  const menu = document.getElementById("context-menu");
  // ✅ Важно: меню должно жить в <body>, иначе оно может проваливаться под другие слои (stacking context)
  if (menu && menu.parentElement !== document.body) {
    document.body.appendChild(menu);
  }

  let contextSelectedEl = null;

  function clearContextSelection() {
    if (contextSelectedEl) {
      contextSelectedEl.classList.remove("context-selected");
      contextSelectedEl = null;
    }
  }

  // setActivePanel(row.dataset.panel);
  // setSelectedInPanel(row.dataset.panel, row);

  /** @type {any} */
  window.showContextMenu = function (e, targetElement, path) {
    // важно: гасим браузерное меню ВСЕГДА
    e.preventDefault();
    e.stopPropagation();

    // scope: item (файл/папка) или panel (пустое место)
    const rawType = targetElement?.dataset?.type || "";
    const scope = rawType === "panel" ? "panel" : "item";

    // показываем только нужные пункты меню (те, у которых есть data-scope)
    menu.querySelectorAll("[data-scope]").forEach((node) => {
      node.style.display = node.dataset.scope === scope ? "" : "none";
    });

    clearContextSelection();
    if (scope === "item" && targetElement) {
      contextSelectedEl = targetElement;
      contextSelectedEl.classList.add("context-selected");
    }

    // панель-источник (где кликнули ПКМ) — делаем активной
    const sourcePanelId = targetElement?.dataset?.panel || activeListId;
    menu.dataset.targetPanel = sourcePanelId;
    setActivePanel(sourcePanelId);

    // сохраняем “цель”
    /*menu.dataset.targetName = targetElement?.dataset?.name || "";
    menu.dataset.targetType = rawType || "";
    menu.dataset.targetPath = JSON.stringify(Array.isArray(path) ? path : []);*/

    menu.dataset.targetName = targetElement.dataset.name;
    menu.dataset.targetType = targetElement.dataset.type;
    menu.dataset.targetPath = JSON.stringify(path);

    menu.__targetEl = targetElement; // ✅ запоминаем реальный DOM-элемент (строка/плитка/узел дерева)

    // показываем меню
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;
    menu.classList.remove("hidden");
  };

  function getMenuPathSafe() {
    try {
      return JSON.parse(menu.dataset.targetPath || "[]");
    } catch {
      return [];
    }
  }

  menu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-action]");
    if (!item) return;

    const action = item.dataset.action;

    // панель-источник (где открыли меню)
    const sourcePanelId = menu.dataset.targetPanel || activeListId;
    setActivePanel(sourcePanelId);

    // ✅ действия по пустому месту
    if (action === "create-folder") {
      hideContextMenu();

      document.getElementById("create-folder-btn")?.click();
      return;
    }
    if (action === "upload") {
      hideContextMenu();

      document.getElementById("upload-file-btn")?.click();
      return;
    }

    // ✅ действия по элементу
    const name = menu.dataset.targetName || "";
    const type = menu.dataset.targetType || "";
    const path = getMenuPathSafe();

    const safeName =
      window.CSS && CSS.escape
        ? CSS.escape(name)
        : String(name).replace(/"/g, '\\"');

    // ✅ если ПКМ был по дереву — цель = сам LI дерева
    // ✅ если ПКМ был по списку — ищем реальный row/карточку в активной панели
    const clickedEl = menu.__targetEl; // ✅ то, по чему реально кликнули ПКМ
    const isTree = !!clickedEl?.classList?.contains("tree-item");

    // Для списка — ищем реальную строку/плитку в панели.
    // Для дерева — используем clickedEl напрямую.
    const targetElement = isTree
      ? clickedEl
      : document
          .getElementById(sourcePanelId)
          ?.querySelector(
            `[data-name="${safeName}"][data-type="${menu.dataset.targetType}"]`
          );

    // ✅ OPEN: порядок аргументов исправлен
    if (action === "open")
      handleOpen(menu.dataset.targetType, name, path, sourcePanelId);

    // ✅ DELETE: работает и для дерева, если deleteItem научим basePathOverride (см. пункт 2)
    if (action === "delete") handleDelete(path, name, sourcePanelId);

    // ✅ RENAME: для дерева отдельный inline-rename
    if (action === "rename") {
      if (name !== "." && name !== ".." && targetElement) {
        if (isTree) {
          initializeTreeRename(path, name, targetElement);
        } else {
          initializeRename(path, name, targetElement);
        }
      }
    }

    hideContextMenu();
  });

  // прячем меню при клике/скролле/ресайзе
  document.addEventListener("click", hideContextMenu);
  document.addEventListener("scroll", hideContextMenu, true);
  window.addEventListener("resize", hideContextMenu);

  // --- F. Обработчики кнопок CRUD в Футере ---

  const createFolderBtn = document.getElementById("create-folder-btn");
  if (createFolderBtn) {
    createFolderBtn.addEventListener("click", async (e) => {
      // Создаём папку без prompt: как в Проводнике — появляется "New folder" и сразу переименование
      const panelId =
        (typeof window.getActiveListId === "function" &&
          window.getActiveListId()) ||
        activeListId ||
        "file-list-1";

      const listEl = document.getElementById(panelId);
      if (!listEl || typeof window.createFolder !== "function") return;

      const baseName = "New folder";

      // Собираем имена, которые уже есть в текущей директории (и файлы, и папки)
      const existing = new Set(
        Array.from(listEl.querySelectorAll("[data-name]"))
          .map((n) => (n && n.dataset ? n.dataset.name : ""))
          .filter(Boolean)
      );

      let folderName = baseName;
      let i = 1;
      while (existing.has(folderName)) {
        folderName = `${baseName}_${i++}`;
      }

      const btn = e.currentTarget;
      if (btn.dataset.busy === "1") return;
      btn.dataset.busy = "1";
      btn.disabled = true;

      try {
        const ok = await window.createFolder(folderName);
        if (!ok) return;

        // После refreshFileManager элемент уже должен быть в DOM — включаем inline-rename
        const esc = (s) =>
          window.CSS && typeof window.CSS.escape === "function"
            ? window.CSS.escape(s)
            : String(s).replace(/["\\\\]/g, "\\\\$&");

        const createdEl =
          listEl.querySelector(
            `[data-type="folder"][data-name="${esc(folderName)}"]`
          ) ||
          listEl.querySelector(
            `[data-name="${esc(folderName)}"][data-type="folder"]`
          );

        if (createdEl && typeof initializeRename === "function") {
          try {
            createdEl.scrollIntoView({ block: "center", inline: "nearest" });
          } catch {}
          const path =
            (window.__fmState &&
              window.__fmState.paths &&
              window.__fmState.paths[panelId]) ||
            [];
          initializeRename(path, folderName, createdEl);
        }
      } finally {
        btn.dataset.busy = "0";
        btn.disabled = false;
      }
    });
  }

  const uploadFileBtn = document.getElementById("upload-file-btn");
  if (uploadFileBtn) {
    uploadFileBtn.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.style.display = "none";

      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        uploadFileBtn.dataset.busy = "1";
        uploadFileBtn.disabled = true;

        try {
          await window.uploadFile(file);
        } finally {
          uploadFileBtn.dataset.busy = "0";
          uploadFileBtn.disabled = false;
        }
        fileInput.remove();
      };

      document.body.appendChild(fileInput);
      fileInput.click();
    });
  }

  // --- D. Добавление слушателей ПКМ (контекстное меню) на панели ---
  // Важно: вешаем на list-panel-*, потому что "пустое поле" часто кликается именно там,
  // а не внутри #file-list-*.

  const panel1 = document.getElementById("list-panel-1");
  const panel2 = document.getElementById("list-panel-2");

  const listContainer1 = document.getElementById("file-list-1");
  const listContainer2 = document.getElementById("file-list-2");

  function bindPanelContextMenu(panelEl, listEl, listId) {
    if (!panelEl || !listEl) return;

    panelEl.addEventListener(
      "contextmenu",
      (e) => {
        // Если ПКМ по самому меню — не мешаем ему работать
        if (e.target.closest("#context-menu")) return;

        // Активируем панель сразу
        setActivePanel(listId);

        // Если ПКМ по элементу (строка/плитка) — его обработчик сам вызовет showContextMenu,
        // но браузерное меню нужно погасить уже здесь (иначе иногда проскакивает).
        const onItem = e.target.closest(
          '[data-type="file"], [data-type="folder"]'
        );
        if (onItem) {
          // клик по реальному файлу/папке
          const domPath = (listEl.dataset.path || "").trim();
          const pathArr = domPath ? domPath.split("/").filter(Boolean) : [];
          window.showContextMenu?.(e, onItem, pathArr);
          return;
        }

        // ПКМ по пустому месту панели: показываем меню "действия в текущей папке"

        const domPath = (listEl.dataset.path || "").trim();
        const pathArr = domPath ? domPath.split("/").filter(Boolean) : [];

        const panelTarget = {
          dataset: { panel: listId, type: "panel", name: "" },
        };
        window.showContextMenu?.(e, panelTarget, pathArr);
      },
      { capture: true }
    );

    // ✅ Mobile / touch: long-press fallback for context menu
    // Работает и для tiles, и для rows, и для пустого места панели.
    const FM_LONG_PRESS_MS = 550;
    const FM_MOVE_TOL = 10;

    let fmLpTimer = 0;
    let fmLpStart = null;
    let fmLpFired = false;

    const fmLpClear = () => {
      if (fmLpTimer) {
        clearTimeout(fmLpTimer);
        fmLpTimer = 0;
      }
      fmLpStart = null;
    };

    panelEl.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType !== "touch") return;
        if (e.target.closest("#context-menu")) return;

        fmLpFired = false;
        fmLpStart = {
          x: e.clientX,
          y: e.clientY,
          pid: e.pointerId,
          target: e.target,
        };

        fmLpTimer = window.setTimeout(() => {
          if (!fmLpStart) return;
          fmLpFired = true;

          // активируем панель
          setActivePanel(listId);

          // текущий путь панели
          const domPath = (listEl.dataset.path || "").trim();
          const pathArr = domPath ? domPath.split("/").filter(Boolean) : [];

          // если лонг-тап по элементу — item scope, иначе panel scope
          const onItem = fmLpStart.target.closest(
            '[data-type="file"], [data-type="folder"]'
          );

          // showContextMenu ожидает event с clientX/Y + preventDefault/stopPropagation
          const fakeEvt = {
            clientX: fmLpStart.x,
            clientY: fmLpStart.y,
            preventDefault() {},
            stopPropagation() {},
          };

          if (onItem) {
            window.showContextMenu?.(fakeEvt, onItem, pathArr);
          } else {
            const panelTarget = {
              dataset: { panel: listId, type: "panel", name: "" },
            };
            window.showContextMenu?.(fakeEvt, panelTarget, pathArr);
          }
        }, FM_LONG_PRESS_MS);
      },
      { capture: true, passive: true }
    );

    panelEl.addEventListener(
      "pointermove",
      (e) => {
        if (!fmLpStart || e.pointerId !== fmLpStart.pid) return;
        const dx = Math.abs(e.clientX - fmLpStart.x);
        const dy = Math.abs(e.clientY - fmLpStart.y);
        if (dx > FM_MOVE_TOL || dy > FM_MOVE_TOL) fmLpClear(); // пользователь скроллит/двигает
      },
      { capture: true, passive: true }
    );

    panelEl.addEventListener(
      "pointerup",
      (e) => {
        if (fmLpStart && e.pointerId === fmLpStart.pid) fmLpClear();
      },
      { capture: true, passive: true }
    );

    panelEl.addEventListener("pointercancel", fmLpClear, {
      capture: true,
      passive: true,
    });

    // ✅ гасим “клик после лонг-тапа”, иначе может открывать preview/фото
    panelEl.addEventListener(
      "click",
      (e) => {
        if (!fmLpFired) return;
        e.preventDefault();
        e.stopPropagation();
        fmLpFired = false;
      },
      true
    );
  }

  bindPanelContextMenu(panel1, listContainer1, "file-list-1");
  bindPanelContextMenu(panel2, listContainer2, "file-list-2");

  // ==========================================================
  // БЛОК: E. Логика переключения тем
  // ==========================================================

  const body = document.body;

  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeNameSpan = document.getElementById("themeName");
  const themeIconContainer = document.getElementById("themeIconContainer");

  const ICON_DARK = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M17 3v2M19 4h2M15 5h2M17 6v2" fill="none" stroke="currentColor" stroke-width="2"/>
    </svg>`;

  window.setTheme = (theme) => {
    if (theme === "dark") {
      body.classList.add("dark-theme");
      localStorage.setItem("theme", "dark");
      if (themeIconContainer) {
        themeIconContainer.innerHTML = ICON_DARK;
      }
      if (themeNameSpan) themeNameSpan.textContent = "";
    } else {
      body.classList.remove("dark-theme");
      localStorage.setItem("theme", "light");
      if (themeIconContainer) {
        // Скрываем иконку светлой темы
        themeIconContainer.innerHTML = "";
      }
      if (themeNameSpan) themeNameSpan.textContent = "";
    }
  };

  const savedTheme = localStorage.getItem("theme") || "light";
  window.setTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = body.classList.contains("dark-theme")
        ? "dark"
        : "light";
      const newTheme = currentTheme === "light" ? "dark" : "light";
      window.setTheme(newTheme);
    });
  }

  // ==========================================================
  // !!! ФИНАЛЬНЫЙ БЛОК: Запуск !!!
  // ==========================================================

  // ======================================================================
  // [FM] Marquee selection (rectangle / lasso) for desktop mouse
  // ======================================================================

  function bindMarqueeSelection(panelId) {
    const list = document.getElementById(panelId);
    if (!list || list.dataset.marqueeBound === "1") return;
    list.dataset.marqueeBound = "1";

    // контейнер должен быть якорем для absolute
    const cs = getComputedStyle(list);
    if (cs.position === "static") list.style.position = "relative";

    let dragging = false;
    let startX = 0,
      startY = 0;
    let box = null;
    let items = [];

    const getLocalPoint = (clientX, clientY) => {
      const r = list.getBoundingClientRect();
      return {
        x: clientX - r.left + list.scrollLeft,
        y: clientY - r.top + list.scrollTop,
      };
    };

    const rectIntersects = (a, b) =>
      !(
        a.right < b.left ||
        a.left > b.right ||
        a.bottom < b.top ||
        a.top > b.bottom
      );

    const setElSelected = (el, on) => {
      if (!el) return;
      if (on) {
        el.classList.add("selected");
        el.setAttribute("aria-selected", "true");
      } else {
        el.classList.remove("selected");
        el.removeAttribute("aria-selected");
      }
    };

    const clearPanelSelection = () => {
      list
        .querySelectorAll(".file-row.selected, .file-tile.selected")
        .forEach((el) => {
          el.classList.remove("selected");
          el.removeAttribute("aria-selected");
        });
    };

    const onMove = (e) => {
      if (!dragging) return;
      e.preventDefault();

      const p = getLocalPoint(e.clientX, e.clientY);
      const left = Math.min(startX, p.x);
      const top = Math.min(startY, p.y);
      const right = Math.max(startX, p.x);
      const bottom = Math.max(startY, p.y);

      box.style.left = left + "px";
      box.style.top = top + "px";
      box.style.width = right - left + "px";
      box.style.height = bottom - top + "px";

      const selRect = { left, top, right, bottom };

      // выделяем пересечения
      items.forEach((el) => {
        const ir = el.getBoundingClientRect();
        const lr = list.getBoundingClientRect();

        const r = {
          left: ir.left - lr.left + list.scrollLeft,
          top: ir.top - lr.top + list.scrollTop,
          right: ir.right - lr.left + list.scrollLeft,
          bottom: ir.bottom - lr.top + list.scrollTop,
        };

        setElSelected(el, rectIntersects(selRect, r));
      });
    };

    const stop = () => {
      // ✅ После завершения лассо браузер отправляет click по пустому месту.
      // Этот click не должен сбрасывать выделение.
      list.dataset.marqueeJustFinished = "1";

      if (!dragging) return;
      dragging = false;

      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", stop, true);

      box?.remove();
      box = null;
      items = [];
    };

    list.addEventListener("mousedown", (e) => {
      // только ЛКМ
      if (e.button !== 0) return;

      // если начали на элементе — это не lasso (там клики/днд)
      if (e.target.closest(".file-row, .file-tile")) return;

      // не мешаем сортировке/ресайзу/переименованию
      if (e.target.closest("th[data-sort]")) return;
      if (e.target.closest(".resize-handle")) return;
      if (e.target.closest(".rename-input")) return;

      // только для desktop мыши (не touch)
      if (fmIsTouchUi && fmIsTouchUi()) return;

      e.preventDefault();
      setActivePanel(panelId);

      // начинаем рамку: по умолчанию заменяем текущее выделение
      // (если захочешь режим "Ctrl добавляет", скажи — добавим)
      clearPanelSelection();
      hidePreviewFM?.();

      const p = getLocalPoint(e.clientX, e.clientY);
      startX = p.x;
      startY = p.y;

      items = Array.from(list.querySelectorAll(".file-row, .file-tile")).filter(
        (el) => {
          const nm = el.dataset?.name;
          return nm && nm !== "." && nm !== "..";
        }
      );

      box = document.createElement("div");
      box.className = "fm-marquee";
      box.style.left = startX + "px";
      box.style.top = startY + "px";
      box.style.width = "0px";
      box.style.height = "0px";
      list.appendChild(box);

      dragging = true;

      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", stop, true);
    });
  }

  bindEmptyClickToClearSelection("file-list-1");
  bindEmptyClickToClearSelection("file-list-2");

  bindTouchDnD("file-list-1");
  bindTouchDnD("file-list-2");

  bindMarqueeSelection("file-list-1");
  bindMarqueeSelection("file-list-2");

  toggleSplit("single");

  window.navigateToFolder(currentPath1, "file-list-1");
  window.navigateToFolder(currentPath2, "file-list-2");

  window.setActivePanel("file-list-1");
});

// =========================
// Hotkeys (Explorer-like)
// Delete = удалить выбранное
// F2 = переименовать выбранное
// =========================
if (!window.__fmHotkeysBound) {
  window.__fmHotkeysBound = true;

  function isTypingContext(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return (
      tag === "input" ||
      tag === "textarea" ||
      el.isContentEditable ||
      el.closest?.(".confirm-modal") || // чтобы не ловить хоткеи внутри модалки
      el.closest?.("#context-menu")
    );
  }

  function getActivePanelId() {
    return (
      (typeof window.getActiveListId === "function" &&
        window.getActiveListId()) ||
      window.__fmState?.activePanel ||
      "file-list-1"
    );
  }

  function getSelectedFromPanel(panelId) {
    const listEl = document.getElementById(panelId);
    if (!listEl) return null;

    // Пытаемся найти выделенный элемент в списке
    const sel =
      listEl.querySelector(".selected[data-name][data-type]") ||
      listEl.querySelector("[data-name][data-type].selected") ||
      listEl.querySelector("[data-name][data-type][aria-selected='true']");

    if (!sel) return null;

    const name = sel.dataset.name || "";
    const type = sel.dataset.type || "";
    const pathArr =
      (window.__fmState?.paths && window.__fmState.paths[panelId]) ||
      (listEl.dataset.path
        ? listEl.dataset.path.split("/").filter(Boolean)
        : []);

    return { el: sel, name, type, pathArr, panelId };
  }

  function getSelectedFromTree() {
    const tree = document.getElementById("file-tree");
    if (!tree) return null;
    const sel = tree.querySelector(".tree-item.selected");
    if (!sel) return null;

    const fullPath = (sel.dataset.path || "").split("/").filter(Boolean);
    if (!fullPath.length) return null;

    const name = fullPath[fullPath.length - 1];
    const parent = fullPath.slice(0, -1);

    return {
      el: sel,
      name,
      type: "folder",
      pathArr: parent,
      panelId: getActivePanelId(),
      fromTree: true,
    };
  }

  async function hotkeyDelete(ctx) {
    if (!ctx) return;

    // Если это дерево — там одиночная цель (оставляем как было)
    if (ctx.fromTree) {
      const basePath = (ctx.pathArr || []).join("/");
      const msg = `Delete "${ctx.name}"?`;

      const run = async () => {
        await window.deleteItem?.(ctx.name, {
          basePathOverride: basePath,
          skipConfirm: true,
        });
      };

      if (typeof window.showConfirmModal === "function")
        window.showConfirmModal(msg, run);
      else if (confirm(msg)) await run();
      return;
    }

    // А вот для панелей — используем пачку выделенных
    await handleDelete(ctx.pathArr || [], ctx.name, ctx.panelId);
  }

  function hotkeyRename(ctx) {
    if (!ctx?.el || !ctx?.name) return;

    // Для дерева мы уже сделали initializeTreeRename, для списка — initializeRename.
    // Если этих функций нет в текущей области видимости — ты увидишь ошибку в консоли.
    try {
      if (ctx.fromTree && typeof initializeTreeRename === "function") {
        initializeTreeRename(ctx.pathArr, ctx.name, ctx.el);
      } else if (typeof initializeRename === "function") {
        initializeRename(ctx.pathArr, ctx.name, ctx.el);
      }
    } catch (e) {
      console.error("[hotkeyRename] failed:", e);
    }
  }

  document.addEventListener("keydown", async (e) => {
    if (isTypingContext(document.activeElement)) return;

    if (e.key === "Enter") {
      const ctx =
        getSelectedFromPanel(getActivePanelId()) || getSelectedFromTree();
      if (!ctx) return;
      e.preventDefault();
      handleOpen(ctx.type, ctx.name, ctx.pathArr, ctx.panelId);
      return;
    }

    // Delete
    if (e.key === "Delete") {
      const ctx =
        getSelectedFromPanel(getActivePanelId()) || getSelectedFromTree();
      if (!ctx) return;
      e.preventDefault();
      await hotkeyDelete(ctx);
      return;
    }

    // F2
    if (e.key === "F2") {
      const ctx =
        getSelectedFromPanel(getActivePanelId()) || getSelectedFromTree();
      if (!ctx) return;
      e.preventDefault();
      hotkeyRename(ctx);
      return;
    }
  });
}
