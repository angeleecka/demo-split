// js/admin-ui.js

// confirm-modal bridge (для #confirm-modal)
window.confirmModal =
  window.confirmModal ||
  function confirmModal(message, opts = {}) {
    const modal = document.getElementById("confirm-modal");
    const titleEl = document.getElementById("confirm-title");
    const textEl = document.getElementById("confirm-text");
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    // если вдруг модалки нет — fallback на браузерный confirm
    if (!modal || !okBtn || !cancelBtn || !titleEl || !textEl) {
      return Promise.resolve(window.confirm(message));
    }

    titleEl.textContent = opts.title || "Подтверждение";
    textEl.textContent = message;
    okBtn.textContent = opts.okText || "Да";
    cancelBtn.textContent = opts.cancelText || "Отмена";

    modal.classList.remove("hidden");

    return new Promise((resolve) => {
      const cleanup = () => {
        modal.classList.add("hidden");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKey);
      };

      const onOk = () => {
        cleanup();
        resolve(true);
      };
      const onCancel = () => {
        cleanup();
        resolve(false);
      };
      const onBackdrop = (e) => {
        if (e.target === modal) onCancel();
      };
      const onKey = (e) => {
        if (e.key === "Escape") onCancel();
      };

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
    });
  };

// --- Совместимость со старым кодом (FileOperations.js) ---
// Раньше это приходило из ModalConfirm.js, но теперь используем confirmModal.
window.showConfirmModal =
  window.showConfirmModal ||
  function (message, onConfirm) {
    const fn = window.confirmModal;
    if (typeof fn !== "function") {
      // Фоллбек на браузерный confirm, если вдруг confirmModal не подключился
      if (window.confirm(message)) onConfirm?.();
      return;
    }

    fn(message).then((ok) => {
      if (ok) onConfirm?.();
    });
  };

// --- allowlist для расширений файлов ---
const ALLOWED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv",
];

// ==== Глобальный payload для внутреннего DnD ====
let adminDragPayload = null; // { names: ["file1.jpg", "file2.png", ...] }

// ==== Admin selection state (якорь + лассо) ==============================

/** Индекс "якоря" для Shift-диапазона */
let adminSelectionAnchorIndex = null;

/** Текущий элемент прямоугольника выделения */
let adminLassoBox = null;
/** Активен ли сейчас прямоугольный выбор */
let adminLassoActive = false;
/** Стартовая точка лассо (в координатах окна) */
let adminLassoStartX = 0;
let adminLassoStartY = 0;

/** Удобный селектор для всех элементов-сущностей в сетке */
const ADMIN_ITEM_SELECTOR = "#content .js-file, #content .category-card";

/**
 * Возвращает массив всех элементов в порядке DOM (файлы + папки).
 */
function getAllItemsInGrid() {
  return Array.from(document.querySelectorAll(ADMIN_ITEM_SELECTOR));
}

/**
 * Снимает выделение со всех элементов.
 */
function clearAllSelection() {
  getAllItemsInGrid().forEach((el) => el.classList.remove("selected"));
}

/**
 * После изменения выделения обновляем "сведения" (имя в панели и т.п.)
 */
function syncSelectionInfo() {
  if (typeof getSelectedName !== "function") return;
  const name = getSelectedName();
  if (name) {
    if (typeof insertFileName === "function") {
      insertFileName(name);
    }
    window.selectedFileName = name;
  } else {
    window.selectedFileName = null;
  }
}

// ==== Патч для Shift-выделения диапазона ================================

function initAdminShiftSelectionPatch() {
  const grid = document.getElementById("content");
  if (!grid) return;

  grid.addEventListener("click", (e) => {
    const item = e.target.closest(".js-file, .category-card");
    if (!item) return;

    const allItems = getAllItemsInGrid();
    const idx = allItems.indexOf(item);
    if (idx === -1) return;

    const isShift = e.shiftKey;
    const isCtrl = e.ctrlKey || e.metaKey;

    // Обычный / Ctrl-клик — даём старой логике отработать,
    // мы только обновим "якорь" после неё.
    if (!isShift) {
      setTimeout(() => {
        const itemsNow = getAllItemsInGrid();
        const idxNow = itemsNow.indexOf(item);
        if (idxNow !== -1) {
          adminSelectionAnchorIndex = idxNow;
        }
      }, 0);
      return;
    }

    // Shift-клик — формируем диапазон ПОСЛЕ того, как отработали другие обработчики
    const ctrlWasDown = isCtrl;

    setTimeout(() => {
      const all = getAllItemsInGrid();
      const curIndex = all.indexOf(item);
      if (curIndex === -1) return;

      // Если якоря нет — попробуем взять первый уже выделенный элемент
      if (adminSelectionAnchorIndex == null) {
        const firstSel = all.findIndex((el) =>
          el.classList.contains("selected")
        );
        if (firstSel !== -1) {
          adminSelectionAnchorIndex = firstSel;
        } else {
          // Совсем не было выделения — считаем текущий и якорем, и единственным выбранным
          adminSelectionAnchorIndex = curIndex;
          clearAllSelection();
          item.classList.add("selected");
          syncSelectionInfo();
          return;
        }
      }

      const start = Math.min(adminSelectionAnchorIndex, curIndex);
      const end = Math.max(adminSelectionAnchorIndex, curIndex);

      if (!ctrlWasDown) {
        clearAllSelection();
      }

      all.forEach((el, i) => {
        if (i >= start && i <= end) {
          el.classList.add("selected");
        }
      });

      syncSelectionInfo();
    }, 0);
  });
}

// ==== Прямоугольное выделение (lasso selection) ==========================

function createLassoBox() {
  if (adminLassoBox) return adminLassoBox;
  const box = document.createElement("div");
  box.className = "admin-lasso-box";
  box.style.position = "fixed";
  box.style.border = "1px dashed rgba(120, 160, 255, 0.9)";
  box.style.background = "rgba(120, 160, 255, 0.15)";
  box.style.pointerEvents = "none";
  box.style.zIndex = "9999";
  document.body.appendChild(box);
  adminLassoBox = box;
  return box;
}

function updateLassoSelection(rect, additive) {
  const items = getAllItemsInGrid();

  items.forEach((el) => {
    const r = el.getBoundingClientRect();
    const intersects = !(
      r.right < rect.left ||
      r.left > rect.right ||
      r.bottom < rect.top ||
      r.top > rect.bottom
    );

    if (intersects) {
      el.classList.add("selected");
    } else if (!additive) {
      el.classList.remove("selected");
    }
  });

  syncSelectionInfo();
}

function initAdminLassoSelection() {
  const grid = document.getElementById("content");
  if (!grid) return;

  let initialSelection = null;

  function onMouseDown(e) {
    // Только левая кнопка
    if (e.button !== 0) return;

    // Если клик по элементу — не стартуем лассо
    if (e.target.closest(".js-file, .category-card")) return;

    // Стартуем только, если реально внутри сетки
    const gridRect = grid.getBoundingClientRect();
    if (
      e.clientX < gridRect.left ||
      e.clientX > gridRect.right ||
      e.clientY < gridRect.top ||
      e.clientY > gridRect.bottom
    ) {
      return;
    }

    adminLassoActive = true;
    adminLassoStartX = e.clientX;
    adminLassoStartY = e.clientY;

    // Запомним, что уже было выделено (для Ctrl+drag — добавление)
    initialSelection = new Set(
      Array.from(document.querySelectorAll(ADMIN_ITEM_SELECTOR + ".selected"))
    );

    const box = createLassoBox();
    box.style.left = adminLassoStartX + "px";
    box.style.top = adminLassoStartY + "px";
    box.style.width = "0px";
    box.style.height = "0px";

    // Не даём браузеру выделять текст
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!adminLassoActive || !adminLassoBox) return;

    const x1 = Math.min(adminLassoStartX, e.clientX);
    const y1 = Math.min(adminLassoStartY, e.clientY);
    const x2 = Math.max(adminLassoStartX, e.clientX);
    const y2 = Math.max(adminLassoStartY, e.clientY);

    adminLassoBox.style.left = x1 + "px";
    adminLassoBox.style.top = y1 + "px";
    adminLassoBox.style.width = x2 - x1 + "px";
    adminLassoBox.style.height = y2 - y1 + "px";

    const additive = e.ctrlKey || e.metaKey;

    if (!additive && initialSelection) {
      // Если без Ctrl — прошлое выделение сбрасываем
      clearAllSelection();
      initialSelection = null;
    }

    updateLassoSelection(
      { left: x1, top: y1, right: x2, bottom: y2 },
      additive
    );
  }

  function finishLasso() {
    if (!adminLassoActive) return;
    adminLassoActive = false;
    if (adminLassoBox) {
      adminLassoBox.style.width = "0px";
      adminLassoBox.style.height = "0px";
      adminLassoBox.remove();
      adminLassoBox = null;
    }

    // Обновим якорь: первый выбранный элемент
    const items = getAllItemsInGrid();
    const firstSelIndex = items.findIndex((el) =>
      el.classList.contains("selected")
    );
    if (firstSelIndex >= 0) {
      adminSelectionAnchorIndex = firstSelIndex;
    }

    syncSelectionInfo();
  }

  grid.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", finishLasso);
}

// ==== LIGHTBOX ДЛЯ АДМИНКИ ==============================================

(function setupAdminLightbox() {
  const mediaLightbox = document.getElementById("mediaLightbox");
  const mlbStage = document.getElementById("mlbStage");
  const mlbCaption = document.getElementById("mlbCaption");
  const mlbCounter = document.getElementById("mlbCounter");

  if (!mediaLightbox || !mlbStage) {
    // На этой странице нет разметки лайтбокса — выходим
    return;
  }

  // Наш внутренний список медиа:
  // [{ type: 'image'|'video', src: string, caption: string }]
  let items = [];
  let index = 0;
  let onKey = null;

  function collectItems() {
    const cells = Array.from(document.querySelectorAll("#content .js-file"));
    const basePath =
      typeof getCurrentPath === "function" ? getCurrentPath() : "";

    items = cells
      .map((cell) => {
        const name = (cell.dataset && cell.dataset.name) || "";

        const img = cell.querySelector("img");
        if (img && img.src) {
          return {
            type: "image",
            src: img.dataset.full || img.src,
            caption: name || img.alt || "",
          };
        }

        const video = cell.querySelector("video");
        if (video && video.src) {
          return {
            type: "video",
            src: video.src,
            caption: name || video.getAttribute("title") || "",
          };
        }

        if (name) {
          const rel = basePath ? basePath + "/" + name : name;
          return {
            type: "image",
            src: "uploads/" + rel,
            caption: name,
          };
        }

        return null;
      })
      .filter(Boolean);
  }

  function showAt(i) {
    if (!items.length) return;

    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    index = i;

    const item = items[index];
    if (!item || !item.src) return;

    mlbStage.innerHTML = "";

    let node;
    if (item.type === "video") {
      const v = document.createElement("video");
      v.src = item.src;
      v.controls = true;
      v.autoplay = true;
      v.style.maxWidth = "100%";
      v.style.maxHeight = "100%";
      node = v;
    } else {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.caption || "";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      node = img;
    }

    mlbStage.appendChild(node);

    if (mlbCaption) mlbCaption.textContent = item.caption || "";
    if (mlbCounter) mlbCounter.textContent = `${index + 1} / ${items.length}`;
  }

  function normalizeExternalItems(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((it) => {
        if (!it) return null;

        const type =
          it.type === "video" || it.kind === "video" ? "video" : "image";
        const src = it.src || it.url || it.full || it.href || "";
        const caption = it.caption || it.title || it.name || "";

        return src ? { type, src, caption } : null;
      })
      .filter(Boolean);
  }

  function loadItemsForOpen() {
    // 1) Если есть «старая» сетка (#content) и она реально заполнена — берём её
    const grid = document.getElementById("content");
    const gridHasCells = !!(
      grid &&
      !grid.hidden &&
      grid.querySelector &&
      grid.querySelector(".js-file")
    );

    if (gridHasCells) {
      collectItems();
      return;
    }

    // 2) Иначе — пробуем взять список из FileOperations (сплит-менеджер)
    const ext = normalizeExternalItems(window.__lightboxItems);
    if (ext.length) {
      items = ext;
      return;
    }

    // 3) Фоллбек
    collectItems();
  }

  // openLightbox(index) — как раньше
  // openLightbox(itemsArray, index) — для сплит-менеджера
  function open(arg1, arg2) {
    let startIndex = 0;

    if (Array.isArray(arg1)) {
      items = normalizeExternalItems(arg1);
      startIndex = Number.isFinite(arg2) ? arg2 : 0;
    } else {
      startIndex = Number.isFinite(arg1) ? arg1 : 0;
      loadItemsForOpen();
    }

    if (!items.length) return;

    if (typeof hidePreview === "function") {
      hidePreview();
    }

    mediaLightbox.hidden = false;
    mediaLightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("mlb-open");

    if (!onKey) {
      onKey = (e) => {
        if (e.key === "Escape") close();
        if (e.key === "ArrowRight") next();
        if (e.key === "ArrowLeft") prev();
      };
      document.addEventListener("keydown", onKey);
    }

    showAt(startIndex);
  }

  function close() {
    mediaLightbox.hidden = true;
    mediaLightbox.setAttribute("aria-hidden", "true");
    if (onKey) {
      document.removeEventListener("keydown", onKey);
      onKey = null;
    }

    document.body.classList.remove("mlb-open");
    mlbStage.innerHTML = "";
  }

  function next() {
    showAt(index + 1);
  }

  function prev() {
    showAt(index - 1);
  }

  // обработчик клика на КОНТЕЙНЕР в capture-фазе.
  // Здесь мы перехватываем стрелки/крестик/фон и не даём другим слушателям
  // вмешаться и перерисовать "битую" картинку.
  function handleClickCapture(e) {
    const t = e.target;

    const isNext = t.closest && t.closest("#mlbNext");
    const isPrev = t.closest && t.closest("#mlbPrev");
    const isClose = t.closest && t.closest("#mlbClose");
    const isBackdrop =
      t === mediaLightbox ||
      (t.classList && t.classList.contains("mlb-backdrop")) ||
      (t.closest && t.closest(".mlb-backdrop"));

    if (!isNext && !isPrev && !isClose && !isBackdrop) {
      return; // не наша цель — пропускаем дальше
    }

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (isNext) {
      next();
    } else if (isPrev) {
      prev();
    } else {
      // крестик или клик по фону
      close();
    }
  }

  // Вешаем обработчик в capture-фазе ⇒ другие слушатели на стрелках не сработают
  mediaLightbox.addEventListener("click", handleClickCapture, true);

  // Делаем глобальные функции, если кто-то их вызывает (showPreview / старый код)
  window.openLightbox = open;
  window.closeLightbox = close;

  // Делегированный клик по плиткам ТОЛЬКО на мобилке
  const grid = document.getElementById("content");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const cell = e.target.closest(".js-file");
      if (!cell) return;

      const isMobile =
        window.innerWidth <= 768 ||
        window.matchMedia("(max-width: 768px)").matches;

      if (!isMobile) return; // на десктопе — панель справа

      const cells = Array.from(document.querySelectorAll("#content .js-file"));
      const idx = cells.indexOf(cell);
      if (idx >= 0) {
        open(idx);
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }
})();

// ==== Предпросмотр файла в правой панели админки ====

function previewUrlFor(name) {
  const base = typeof getCurrentPath === "function" ? getCurrentPath() : "";
  const rel = base ? `${base}/${name}` : name;
  return `uploads/${rel}`;
}

function showPreview(name) {
  const pane = document.getElementById("previewPane");
  const img = document.getElementById("previewImage");
  const errBox = document.getElementById("previewError");
  if (!name) return;

  const isMobile =
    window.innerWidth <= 768 || window.matchMedia("(max-width: 768px)").matches;

  // Мобильный режим: вместо панели используем лайтбокс
  if (isMobile) {
    if (typeof window.openLightbox === "function") {
      const cells = Array.from(document.querySelectorAll("#content .js-file"));
      const idx = cells.findIndex(
        (el) => (el.dataset && el.dataset.name) === name
      );
      window.openLightbox(idx >= 0 ? idx : 0);
    }
    return;
  }

  // Десктопный предпросмотр справа
  if (!pane || !img) return;

  pane.hidden = false;
  pane.classList.add("active");
  if (!pane.style.width) {
    pane.style.width = "600px";
    pane.style.flex = "0 1 600px";
  }

  if (errBox) errBox.hidden = true;

  img.onload = () => {
    if (errBox) errBox.hidden = true;
    pane.classList.add("active");
  };

  img.onerror = () => {
    img.removeAttribute("src");
    if (errBox) errBox.hidden = false;
    pane.classList.add("active");
  };

  img.src = previewUrlFor(name);
  img.alt = name;
}

function hidePreview() {
  const pane = document.getElementById("previewPane");
  const img = document.getElementById("previewImage");
  if (!pane || !img) return;

  pane.classList.remove("active");
  pane.hidden = true;

  img.removeAttribute("src");
  pane.style.width = "";
  pane.style.flex = "";
}

window.showPreview = showPreview;
window.hidePreview = hidePreview;

// ===== Toasts =====
function showToast(
  message,
  type = "info",
  actionLabel = null,
  actionFn = null,
  autoHide = true
) {
  // By default we hide "success" toasts (too noisy and sometimes duplicated).
  // To re-enable: window.ADMIN_TOAST_SUCCESS = true
  if (type === "success" && window.ADMIN_TOAST_SUCCESS !== true) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const msg = document.createElement("span");
  msg.textContent = message;
  toast.appendChild(msg);

  if (actionLabel && actionFn) {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    btn.style.marginLeft = "12px";
    btn.style.background = "transparent";
    btn.style.border = "1px solid #fff";
    btn.style.color = "#fff";
    btn.style.padding = "4px 8px";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
      actionFn();
      toast.remove();
    });
    toast.appendChild(btn);
  }

  // крестик (если не отключён авто-скрытие или есть action)
  if ((actionLabel && actionFn) || autoHide !== false) {
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.className = "toast-close-btn";
    closeBtn.style.cssText =
      "margin-left:12px;cursor:pointer;border:none;background:none;color:white;font-size:1.2em;";
    closeBtn.addEventListener("click", () => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    });
    toast.appendChild(closeBtn);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);

  if (autoHide) {
    const delay = typeof autoHide === "number" ? autoHide : 3000;
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, delay);
  }
}

// ===== Валидация имён =====
function containsForbiddenChars(name) {
  // запрещаем: \ / : * ? " < > | .
  return /[\\/:*?"<>|.]/.test(name);
}
function coreForbidden(name) {
  // запрещаем: \ / : * ? " < > |
  return /[\\/:*?"<>|]/.test(name);
}
function looksLikeFile(name) {
  return !!name && name.includes(".");
}
function inferWithOldExt(oldName, newName) {
  if (looksLikeFile(oldName) && newName && !newName.includes(".")) {
    const ext = oldName.split(".").pop();
    return ext ? `${newName}.${ext}` : newName;
  }
  return newName;
}

// ===== Выделение в гриде =====
function getSelectedName() {
  const sel =
    document.querySelector("#content .js-file.selected") ||
    document.querySelector("#content .category-card.selected");
  if (!sel) return null;
  return (
    sel.dataset.name ||
    sel.querySelector(".card-title")?.textContent?.trim() ||
    null
  );
}

// ===== Off-canvas панель (мобилка) =====
function isMobile() {
  return window.matchMedia("(max-width: 900px)").matches;
}
function openDrawer() {
  const explorer = document.querySelector(".admin-explorer");
  if (explorer && isMobile()) explorer.classList.add("is-open");
}
function closeDrawer() {
  const explorer = document.querySelector(".admin-explorer");
  if (explorer) explorer.classList.remove("is-open");
}

// --- keep drawer below the real site header (mobile) ---
function syncAdminHeaderHeight() {
  const header =
    document.getElementById("header") ||
    document.querySelector("header.portfolio-header") ||
    document.querySelector(".portfolio-header");

  const h = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty("--admin-header-h", `${h}px`);
}

syncAdminHeaderHeight();
window.addEventListener("resize", syncAdminHeaderHeight);

// ==== Выбор и перемещение элементов (helpers) =============================

/**
 * Возвращает все выделенные элементы в сетке:
 * - файлы (.js-file)
 * - папки (.category-card)
 */
function getSelectedItems() {
  return Array.from(
    document.querySelectorAll(
      "#content .js-file.selected, #content .category-card.selected"
    )
  );
}

/**
 * Переместить элементы с именами names в папку targetFolderPath.
 * Использует /rename и твой handleResponse + renderPortfolio.
 *
 * targetFolderPath — относительный путь типа:
 *  - "upload" или
 *  - "category/sub"
 */
async function moveItemsToFolder(names, targetFolderPath) {
  try {
    const base = typeof getCurrentPath === "function" ? getCurrentPath() : "";
    for (const nm of names) {
      const oldPath = base ? `${base}/${nm}` : nm;
      const newPath = targetFolderPath ? `${targetFolderPath}/${nm}` : nm;

      const res = await fetch(window.API_BASE_URL + "/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath, newPath }),
      });

      if (typeof handleResponse === "function") {
        await handleResponse(res);
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    }

    if (typeof showToast === "function") {
      showToast(`Moved: ${names.join(", ")}`, "success");
    }
    return true;
  } catch (err) {
    console.error("moveItemsToFolder error:", err);
    if (typeof showToast === "function") {
      showToast("Move failed", "error");
    }
    return false;
  }
}

// ==== Загрузка файла непосредственно в указанную папку ====

async function uploadFileTo(file, folderPath) {
  const formData = new FormData();
  formData.append("folderPath", folderPath);
  formData.append("file", file);

  try {
    const res = await fetch(window.API_BASE_URL + "/upload-file", {
      method: "POST",
      body: formData,
    });
    const result = await (typeof handleResponse === "function"
      ? handleResponse(res)
      : res.json?.());

    if (typeof showToast === "function") {
      showToast(`File "${file.name}" uploaded`, "success");
    }
    return true;
  } catch (e) {
    console.error("uploadFileTo error:", e);
    if (typeof showToast === "function") {
      showToast("Upload failed", "error");
    }
    return false;
  }
}

// (по желанию можно экспортнуть в глобал для отладки)
// window.moveItemsToFolder = moveItemsToFolder;

// ==== DnD (drag & drop) для админки =======================================

function initAdminDnD() {
  const grid = document.getElementById("content");
  if (!grid) return;

  // Чтобы не дублировать обработчики на grid
  if (!grid.dataset.dndGridBound) {
    grid.dataset.dndGridBound = "1";

    const hasFiles = (e) =>
      !!e.dataTransfer &&
      Array.from(e.dataTransfer.types || []).includes("Files");

    // --- Дроп внешних файлов на "пустое место" сетки (в текущую папку) ---
    grid.addEventListener("dragover", (e) => {
      if (hasFiles(e)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });

    grid.addEventListener("drop", async (e) => {
      if (!hasFiles(e)) return;
      // сюда попадаем, если дропа нет по конкретной папке
      e.preventDefault();

      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;

      try {
        let uploaded = 0;
        for (const file of files) {
          if (typeof uploadFile === "function") {
            const ok = await uploadFile(file);
            if (ok !== false) uploaded++;
          }
        }
        if (uploaded && typeof showToast === "function") {
          showToast(`Uploaded ${uploaded} file(s)`, "success");
        }
      } catch (err) {
        console.error("Drop-upload to current folder failed:", err);
        if (typeof showToast === "function") {
          showToast("Upload failed", "error");
        }
      }
    });
  }

  // --- helpers для подсветки ---
  const clearDragging = () => {
    grid
      .querySelectorAll(".dragging")
      .forEach((n) => n.classList.remove("dragging"));
  };
  const markDragging = (els, on) => {
    clearDragging();
    if (on) els.forEach((n) => n.classList.add("dragging"));
  };
  const clearDropTargets = () => {
    grid
      .querySelectorAll(".drop-target")
      .forEach((n) => n.classList.remove("drop-target"));
  };

  // --- делаем файлы и папки источниками drag -----------------------------

  function bindDraggable(el) {
    if (el.dataset.dndBound === "1") return;
    el.dataset.dndBound = "1";
    el.setAttribute("draggable", "true");

    el.addEventListener("dragstart", (e) => {
      // Берём выделенные элементы, если есть, иначе — только тот, на котором начали drag
      const selected = getSelectedItems();
      const inSelection = selected.includes(el);
      const pack = selected.length && inSelection ? selected : [el];

      const names = pack
        .map((n) => n.dataset.name || n.getAttribute("data-name"))
        .filter(Boolean);
      if (!names.length) return;

      adminDragPayload = { names };

      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
      }
      markDragging(pack, true);
    });

    el.addEventListener("dragend", () => {
      adminDragPayload = null;
      clearDragging();
      clearDropTargets();
    });
  }

  grid
    .querySelectorAll(".js-file, .category-card")
    .forEach((el) => bindDraggable(el));

  // --- папки как drop-таргеты для внутреннего DnD и внешних файлов -----

  const hasFiles = (e) =>
    !!e.dataTransfer &&
    Array.from(e.dataTransfer.types || []).includes("Files");

  grid.querySelectorAll(".category-card").forEach((card) => {
    if (card.dataset.dndFolderBound === "1") return;
    card.dataset.dndFolderBound = "1";

    const folderPath = card.dataset.path || "";
    const folderName =
      card.dataset.name || folderPath.split("/").slice(-1)[0] || "folder";

    function accept(e) {
      if (!hasFiles(e) && !adminDragPayload) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = hasFiles(e) ? "copy" : "move";
      }
      card.classList.add("drop-target");
    }

    card.addEventListener("dragenter", accept);
    card.addEventListener("dragover", accept);

    card.addEventListener("dragleave", (e) => {
      if (!card.contains(e.relatedTarget)) {
        card.classList.remove("drop-target");
      }
    });

    card.addEventListener("drop", async (e) => {
      if (!hasFiles(e) && !adminDragPayload) return;
      e.preventDefault();
      e.stopPropagation();
      clearDropTargets();
      clearDragging();

      try {
        // 1) Внешние файлы → загрузка в ЭТУ папку
        if (hasFiles(e)) {
          const files = Array.from(e.dataTransfer.files || []);
          if (!files.length) return;

          let uploaded = 0;
          for (const file of files) {
            const ok = await uploadFileTo(file, folderPath);
            if (ok !== false) uploaded++;
          }
          if (uploaded && typeof showToast === "function") {
            showToast(
              `Uploaded ${uploaded} file(s) → ${folderName}`,
              "success"
            );
          }
          return;
        }

        // 2) Внутренний DnD → перемещение файлов/папок
        if (!adminDragPayload || !adminDragPayload.names?.length) return;

        const names = adminDragPayload.names.slice();
        adminDragPayload = null;

        const base =
          typeof getCurrentPath === "function" ? getCurrentPath() : "";

        // Защита: не даём переместить папку в саму себя / свою под-папку
        const safeNames = names.filter((nm) => {
          const full = base ? `${base}/${nm}` : nm;
          if (!folderPath) return true; // корень — всё можно
          if (folderPath === full) return false;
          if (folderPath.startsWith(full + "/")) return false;
          return true;
        });

        if (!safeNames.length) {
          if (typeof showToast === "function") {
            showToast(
              "Can't move a folder into itself or its subfolder",
              "warning"
            );
          }
          return;
        }

        await moveItemsToFolder(safeNames, folderPath);
      } catch (err) {
        console.error("Drop move/upload error:", err);
        if (typeof showToast === "function") {
          showToast("Move/upload failed", "error");
        }
      }
    });
  });
}

// Экспортим в глобал для вызова после renderPortfolio
window.initAdminDnD = initAdminDnD;

document.addEventListener("DOMContentLoaded", () => {
  const splitFM = document.querySelector(".file-manager-container");
  const legacyGrid = document.getElementById("content");

  // ===== Off-canvas панель: открыть/закрыть кнопками =====
  const drawerBtn = document.querySelector(".admin-drawer-btn");
  const explorer = document.querySelector(".admin-explorer");
  const drawerClose = document.querySelector(".admin-drawer-close");

  if (drawerBtn && explorer) {
    drawerBtn.addEventListener("click", () =>
      explorer.classList.add("is-open")
    );
    drawerClose?.addEventListener("click", closeDrawer);
  }

  // клик вне панели — закрыть (только мобилка)
  document.addEventListener(
    "click",
    (e) => {
      if (!explorer || !explorer.classList.contains("is-open")) return;
      if (window.matchMedia("(min-width: 1024px)").matches) return;
      const inside = explorer.contains(e.target);
      const onToggle = drawerBtn?.contains(e.target);
      if (!inside && !onToggle) closeDrawer();
    },
    true
  );

  // Esc — закрыть
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && explorer?.classList.contains("is-open")) {
      closeDrawer();
    }
  });

  // при переходе на десктоп — состояние сбросить
  window.matchMedia("(min-width: 1024px)").addEventListener("change", (ev) => {
    if (ev.matches) closeDrawer();
  });

  // опционально: внешние события могут открыть панель (например, из контекстного меню)
  document.addEventListener("admin:open-drawer", openDrawer);

  // ✅ если мы в новом сплит-менеджере — НЕ запускаем legacy-инициализацию #content
  if (splitFM && legacyGrid && legacyGrid.hidden) {
    return;
  }

  // кнопки в админке — не submit
  document
    .querySelectorAll(".admin-ops button, #adminOps button")
    .forEach((b) => {
      if (!b.getAttribute("type")) b.setAttribute("type", "button");
    });

  // ==== Патчи выбора для админки ====
  initAdminShiftSelectionPatch();
  initAdminLassoSelection();

  // ==== Создать папку ====
  document.getElementById("btnMkdir")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    btn.disabled = true;
    try {
      const input = document.getElementById("mkdirName");
      const name = (input?.value || "").trim();
      if (!name) return showToast("Enter folder name!", "warning");
      if (containsForbiddenChars(name)) {
        return showToast(
          'Folder name must not contain: / \\ : * ? " < > | or dot (.)',
          "warning"
        );
      }
      const ok = await createFolder(name);
      if (ok && input) input.value = "";
    } finally {
      btn.dataset.busy = "0";
      btn.disabled = false;
    }
  });

  // ==== Загрузить файл ====
  document.getElementById("btnUpload")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    btn.disabled = true;
    try {
      const fileInput = document.getElementById("fileInput");
      if (!fileInput?.files?.length)
        return showToast("Select a file!", "warning");
      await uploadFile(fileInput.files[0]);
    } finally {
      btn.dataset.busy = "0";
      btn.disabled = false;
    }
  });

  // ==== Переименовать ====
  document.getElementById("btnRename")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    btn.disabled = true;

    try {
      const selected = getSelectedName();
      let oldName =
        selected || document.getElementById("renameOld").value.trim();
      let newName = document.getElementById("renameNew").value.trim();

      if (!oldName || !newName) return showToast("Specify names!", "warning");

      // автодобавление расширения, если меняем файл без точки
      newName = inferWithOldExt(oldName, newName);

      // валидация имени
      if (coreForbidden(newName)) {
        return showToast(
          'New name contains prohibited characters: / \\ : * ? " < > |',
          "warning"
        );
      }
      const isFile = looksLikeFile(oldName);
      if (!isFile && newName.includes(".")) {
        return showToast("Folder name cannot contain a dot (.).", "warning");
      }
      if (isFile && newName.startsWith(".")) {
        return showToast("File name cannot start with a dot (.).", "warning");
      }
      if (isFile && newName.includes(".")) {
        const ext = newName.split(".").pop().toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return showToast(
            `Invalid extension .${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(
              ", "
            )}`,
            "warning"
          );
        }
      }

      console.log("[rename] oldName:", oldName, "→ newName:", newName);
      const ok = await renameItem(oldName, newName);
      if (ok) {
        // синхрон полей
        const ro = document.getElementById("renameOld");
        const rn = document.getElementById("renameNew");
        if (ro) ro.value = newName;
        if (rn) rn.value = "";

        if (isMobile()) closeDrawer();
      }
    } finally {
      btn.dataset.busy = "0";
      btn.disabled = false;
    }
  });

  // ==== Удалить ====
  document.getElementById("btnDelete")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    btn.disabled = true;

    try {
      const selected = getSelectedName();
      const name =
        selected || document.getElementById("deleteName").value.trim();
      if (!name) return showToast("Enter a name to delete!", "warning");

      console.log("[delete]", name);
      const ok = await deleteItem(name);
      if (ok) {
        const del = document.getElementById("deleteName");
        if (del) del.value = "";
        if (isMobile()) closeDrawer();
      }
    } finally {
      btn.dataset.busy = "0";
      btn.disabled = false;
    }
  });

  // ==== Восстановить ====
  document
    .getElementById("btnRestore")
    ?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (btn.dataset.busy === "1") return;
      btn.dataset.busy = "1";
      btn.disabled = true;

      try {
        await restoreItem();
        if (isMobile()) closeDrawer();
      } finally {
        btn.dataset.busy = "0";
        btn.disabled = false;
      }
    });

  // ==== Контекстное меню: инициализация после загрузки DOM ====
  if (typeof initAdminContextMenu === "function") {
    initAdminContextMenu();
  }

  const previewCloseBtn = document.getElementById("previewCloseBtn");
  if (previewCloseBtn) {
    previewCloseBtn.addEventListener("click", () => {
      hidePreview();
    });
  }

  const contentEl = document.getElementById("content");
  if (contentEl) {
    contentEl.addEventListener("dblclick", (e) => {
      const fileEl = e.target.closest(".js-file");
      if (!fileEl) return;

      if (window.matchMedia("(max-width: 768px)").matches) return;

      e.preventDefault();
      const name =
        fileEl.dataset.name ||
        fileEl.getAttribute("data-name") ||
        fileEl.querySelector(".file-title")?.textContent?.trim();
      if (!name) return;

      showPreview(name);
    });
  }

  // Инициализация DnD ОДИН РАЗ при загрузке
  if (typeof initAdminDnD === "function") {
    initAdminDnD();
  }

  // Инициализация контекстного меню
  if (typeof initAdminContextMenu === "function") {
    initAdminContextMenu();
  }

  // 🔹 Очистка выделения по клику на пустом месте сетки
  const grid = document.getElementById("content");
  if (grid) {
    grid.addEventListener("click", (e) => {
      // Если кликнули по файлу/папке — ничего не делаем
      if (e.target.closest(".js-file, .category-card")) return;

      // Только левая кнопка (на всякий случай)
      if (e.button != null && e.button !== 0) return;

      clearAllSelection();
      adminSelectionAnchorIndex = null;
      syncSelectionInfo();
    });
  }
});

// ==== Контекстное меню в админке (ПКМ / long-press) ====

function initAdminContextMenu() {
  // чтобы не инициализировать дважды
  if (window.__adminCtxInit) return;
  window.__adminCtxInit = true;

  const menu = document.createElement("div");
  menu.className = "admin-ctx";
  menu.innerHTML = `
    <button data-act="open">Open / Preview</button>
    <button data-act="rename">Rename…</button>
    <button data-act="delete">Delete…</button>
  `;
  document.body.appendChild(menu);

  let menuTarget = null;
  let lpTimer = null;

  const closeMenu = () => {
    menu.classList.remove("open");
    menuTarget = null;
  };

  // Закрытие по клику вне меню
  document.addEventListener(
    "click",
    (e) => {
      if (!menu.classList.contains("open")) return;
      if (!menu.contains(e.target)) {
        closeMenu();
      }
    },
    true
  );

  // Закрытие по Esc
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("open")) {
      closeMenu();
    }
  });

  function openMenuAt(x, y, el) {
    menuTarget = el;

    // Перевыделяем текущий элемент
    document
      .querySelectorAll("#content .selected")
      .forEach((n) => n.classList.remove("selected"));
    el.classList.add("selected");

    const name =
      el.dataset.name ||
      el.querySelector?.(".card-title")?.textContent?.trim() ||
      "";

    if (name && typeof insertFileName === "function") {
      insertFileName(name);
    }

    // Позиционирование меню
    const m = menu;
    m.style.visibility = "hidden";
    m.classList.add("open");
    m.style.left = "0px";
    m.style.top = "0px";

    const pad = 8;
    const r = m.getBoundingClientRect();
    let left = x;
    let top = y;

    if (left + r.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - r.width - pad);
    }
    if (top + r.height > window.innerHeight - pad) {
      const above = y - r.height - pad;
      top =
        above >= pad
          ? above
          : Math.max(pad, window.innerHeight - r.height - pad);
    }

    m.style.left = left + "px";
    m.style.top = top + "px";
    m.style.visibility = "visible";
  }

  // Делегированный обработчик ПКМ
  document.addEventListener("contextmenu", (e) => {
    const el = e.target.closest("#content .js-file, #content .category-card");
    if (!el) return;
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY, el);
  });

  // Long-press на тач-устройствах
  document.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      const el = e.target.closest("#content .js-file, #content .category-card");
      if (!el) return;

      lpTimer = setTimeout(() => {
        openMenuAt(t.clientX, t.clientY, el);
      }, 600);
    },
    { passive: true }
  );

  const cancelLp = () => {
    if (!lpTimer) return;
    clearTimeout(lpTimer);
    lpTimer = null;
  };

  document.addEventListener("touchend", cancelLp, { passive: true });
  document.addEventListener("touchcancel", cancelLp, { passive: true });
  document.addEventListener("touchmove", cancelLp, { passive: true });

  // Обработка кликов по пунктам меню
  menu.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    e.preventDefault();

    const act = btn.dataset.act;
    const name = getSelectedName?.();
    const el = menuTarget;

    if (!name || !el) {
      closeMenu();
      return;
    }

    if (act === "open") {
      const isFile = el.classList.contains("js-file");
      if (isFile) {
        // файл → предпросмотр
        if (typeof showPreview === "function") {
          showPreview(name);
        }
      } else {
        // папка → просто заходим в неё (логика перехода уже есть на клике)
        el.click();
      }
    } else if (act === "rename") {
      const renameOld = document.getElementById("renameOld");
      if (renameOld) {
        renameOld.value = name;
        // открываем панель слева
        document.dispatchEvent(new Event("admin:open-drawer"));
        renameOld.focus();
      }
    } else if (act === "delete") {
      const delInput = document.getElementById("deleteName");
      if (delInput) {
        delInput.value = name;
      }
      const btnDel = document.getElementById("btnDelete");
      if (btnDel) btnDel.click();
    }

    closeMenu();
  });
}

// Экспортим в глобал, чтобы можно было проверить в консоли
window.initAdminContextMenu = initAdminContextMenu;
