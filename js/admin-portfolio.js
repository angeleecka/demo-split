// admin-portfolio.js
// Используется и в админке, и в публичном портфолио (только BASE_PAGE меняется).
window.insertFileName ||= function () {};
window.showPreview ||= function () {};
window.hidePreview ||= function () {};

import { emit } from "../core/eventBus.js"; // вверху файла

const BASE_PAGE = "admin-portfolio.html";
// На публичной странице ставь: const BASE_PAGE = 'portfolio.html';

// --- глобальное состояние ---
let selectedFileName = null;
let lastSelectedEl = null;
window.selectedFileName = selectedFileName;

// DOM-референсы
let workspace = null;
let previewPane = null;
let resizer = null;
let previewImg = null;

let isResizing = false;

// --- вспомогательные функции ---
function getMaxPreviewWidth() {
  if (!workspace) return window.innerWidth * 0.8;
  const workspaceRect = workspace.getBoundingClientRect();
  const workspaceLimit = Math.max(300, workspaceRect.width * 0.8);
  const imgNaturalWidth = previewImg?.naturalWidth || 0;
  const imgLimit =
    imgNaturalWidth > 0
      ? Math.min(imgNaturalWidth, workspaceLimit)
      : workspaceLimit;
  return imgLimit;
}

function fitPreviewToImage() {
  if (!previewPane || !previewImg) return;
  if (!previewPane.classList.contains("active")) return;
  if (!previewImg.naturalWidth || previewImg.naturalWidth <= 0) return;

  const maxWidth = getMaxPreviewWidth();
  const minWidth = 280;
  const targetWidth = Math.max(
    minWidth,
    Math.min(previewImg.naturalWidth, maxWidth)
  );
  previewPane.style.width = `${targetWidth}px`;
  previewPane.style.flex = "0 0 auto";
}

function attachResizer() {
  if (!resizer || !previewPane || !workspace) return;

  resizer.addEventListener("mousedown", () => {
    if (!previewPane.classList.contains("active")) return;
    isResizing = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    previewPane.classList.add("resizing");
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    if (!previewPane.classList.contains("active")) {
      isResizing = false;
      return;
    }

    const workspaceRect = workspace.getBoundingClientRect();
    const minWidth = 280;
    const maxWidth = getMaxPreviewWidth();
    const newWidth = Math.max(0, Math.round(workspaceRect.right - e.clientX));
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      previewPane.style.width = `${newWidth}px`;
      previewPane.style.flex = "0 0 auto";
    }
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      previewPane.classList.remove("resizing");
    }
  });

  window.addEventListener("resize", () => {
    if (previewPane && previewPane.classList.contains("active")) {
      fitPreviewToImage();
    }
  });
}

// --- рендер портфолио ---
window.renderPortfolio = async function () {
  const params = new URLSearchParams(window.location.search);
  const path = [];
  if (params.get("category")) path.push(params.get("category"));
  let i = 1;
  while (params.get("subcategory" + i)) {
    path.push(params.get("subcategory" + i));
    i++;
  }

  try {
    // ⚡ форсим обновление JSON (убираем кэш браузера)
    const r = await fetch(`data/portfolio.json?_=${Date.now()}`, {
      cache: "reload",
    });
    const data = await r.json();

    let currentNode = { children: data };
    for (const segment of path) {
      const next = currentNode.children?.find(
        (item) => item.type === "folder" && item.name === segment
      );
      if (!next) {
        currentNode = null;
        break;
      }
      currentNode = next;
    }

    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle) {
      pageTitle.textContent = path.length
        ? path[path.length - 1].replace(/_/g, " ")
        : "Portfolio";
    }

    const bc = document.getElementById("breadcrumbs");
    if (bc) {
      bc.innerHTML = "";
      if (path.length) {
        let link = `${BASE_PAGE}`;
        bc.innerHTML = `<a href="${link}">Portfolio</a>`;
        let subLink = "";
        path.forEach((seg, idx) => {
          subLink +=
            idx === 0
              ? `?category=${encodeURIComponent(seg)}`
              : `&subcategory${idx}=${encodeURIComponent(seg)}`;
          const isLast = idx === path.length - 1;
          bc.innerHTML += ` <span>›</span> <a href="${BASE_PAGE}${subLink}"${
            isLast ? ' class="active"' : ""
          }>${seg.replace(/_/g, " ")}</a>`;
        });
      }
    }

    const container = document.getElementById("content");
    if (!container) return;
    container.innerHTML = "";

    if (!currentNode) {
      container.textContent = "❌ Folder not found";
      return;
    }

    // === файлы ===
    const files = (currentNode.children || []).filter((c) => c.type === "file");
    if (files.length > 0) {
      const gallery = document.createElement("div");
      gallery.className =
        files.length <= 2 ? "gallery gallery--compact" : "gallery";

      files.forEach((fileNode) => {
        const file = fileNode.name;
        const ext = file.split(".").pop().toLowerCase();
        const filePath = `uploads/${path.join("/")}/${file}`;
        const cell = document.createElement("div");
        cell.className = "cell";

        if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
          const img = document.createElement("img");
          img.src = filePath;
          img.alt = file;
          img.dataset.name = file;
          img.classList.add("js-file");
          img.onerror = () => {
            img.src = "img/no-image.jpg";
          };

          const caption = document.createElement("div");
          caption.className = "file-caption";
          caption.textContent = file;

          cell.appendChild(img);
          cell.appendChild(caption);
        } else if (["mp4", "mov", "webm"].includes(ext)) {
          const video = document.createElement("video");
          video.src = filePath;
          video.controls = true;
          cell.appendChild(video);
        }
        gallery.appendChild(cell);
      });

      container.appendChild(gallery);
    }

    // === папки ===
    const subs = (currentNode.children || []).filter(
      (c) => c.type === "folder"
    );
    if (subs.length > 0) {
      const list = document.createElement("div");
      list.className = "category-list";

      subs.forEach((subNode) => {
        const subPath = [...path, subNode.name];
        let previewFile = "";
        const firstFile = (subNode.children || []).find(
          (c) => c.type === "file"
        );
        if (firstFile) previewFile = firstFile.name;

        const imgPath = previewFile
          ? `uploads/${subPath.join("/")}/${previewFile}`
          : "img/no-image.jpg";

        let link = `${BASE_PAGE}?category=${encodeURIComponent(
          path[0] || subNode.name
        )}`;
        for (let k = 1; k < path.length; k++) {
          link += `&subcategory${k}=${encodeURIComponent(path[k])}`;
        }
        if (path.length) {
          link += `&subcategory${path.length}=${encodeURIComponent(
            subNode.name
          )}`;
        }

        const card = document.createElement("a");
        card.href = link;
        card.className = "category-card";

        card.dataset.path = subPath.join("/"); // ← НУЖНО для DnD "переместить в папку"
        card.dataset.name = subNode.name; // (не обязательно, но удобно для меню)

        const t = new Image();
        t.onload = () => {
          card.innerHTML = `
            <div class="card-image" style="background-image: url('${imgPath}')"></div>
            <div class="card-title">${subNode.name.replace(/_/g, " ")}</div>
          `;
        };
        t.onerror = () => {
          card.innerHTML = `
            <div class="card-image" style="background-image: url('img/no-image.jpg')"></div>
            <div class="card-title">${subNode.name.replace(/_/g, " ")}</div>
          `;
        };
        t.src = imgPath;

        list.appendChild(card);
      });

      container.appendChild(list);
    }

    emit("gallery:rendered");
    initAdminDnD?.();
    initAdminContextMenu?.();
  } catch (e) {
    console.error("JSON loading error:", e);
  }
};

async function moveItemsToFolder(names, targetFolderPath) {
  try {
    const base = typeof getCurrentPath === "function" ? getCurrentPath() : "";
    for (const nm of names) {
      const oldPath = base ? `${base}/${nm}` : nm;
      const newPath = targetFolderPath ? `${targetFolderPath}/${nm}` : nm;

      const res = await fetch("/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPath, newPath }),
      });
      // reuse твою общую обработку
      if (typeof handleResponse === "function") {
        await handleResponse(res);
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    }
    await window.renderPortfolio?.();
    showToast?.(`Moved: ${names.join(", ")}`, "success");
  } catch (err) {
    console.error("moveItemsToFolder error:", err);
    showToast?.("Move failed", "error");
  }
}

// --- предпросмотр ---
window.attachPreviewHandlers = function () {
  function clearSelection() {
    document.querySelectorAll("#content .selected").forEach((el) => {
      el.classList.remove("selected");
    });
  }

  // Пропуск "внешних" якорей и плавный скролл по текущей странице
  function bypassIfAnchorNav(e) {
    const a = e.target.closest("a");
    if (!a) return false;
    if (a.hasAttribute("data-no-scroll")) return true;

    const href = a.getAttribute("href") || "";
    if (!href.includes("#")) return false;

    const url = new URL(href, location.href);
    const samePage =
      url.origin === location.origin && url.pathname === location.pathname;
    if (!samePage) return true;

    if (!url.hash) return false;
    const target = document.querySelector(url.hash);
    if (!target) return false;

    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.pushState(null, "", url.hash);
    return true;
  }

  // файлы (ячейки)
  document.querySelectorAll("#content .js-file").forEach((el) => {
    const name = el.dataset.name;
    const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

    const selectOnly = () => {
      document
        .querySelectorAll("#content .selected")
        .forEach((n) => n.classList.remove("selected"));
      el.classList.add("selected");
      try {
        window.selectedFileName = name;
      } catch {}
      if (typeof insertFileName === "function") insertFileName(name);
    };

    // НОВАЯ/ИСПРАВЛЕННАЯ логика КЛИКА
    el.addEventListener("click", (e) => {
      if (bypassIfAnchorNav(e)) return;
      e.preventDefault();

      const all = Array.from(document.querySelectorAll("#content .js-file"));

      // 1. CTRL/CMD КЛИК (Toggle)
      if (e.ctrlKey || e.metaKey) {
        el.classList.toggle("selected");
      }

      // 2. SHIFT КЛИК (Range Select)
      else if (e.shiftKey && lastSelectedEl) {
        const start = all.indexOf(lastSelectedEl);
        const end = all.indexOf(el);
        const [min, max] = [Math.min(start, end), Math.max(start, end)];

        // Сбросить текущее выделение (или оставить, в зависимости от желаемого поведения)
        clearSelection();

        // Выделить весь диапазон
        for (let i = min; i <= max; i++) {
          all[i].classList.add("selected");
        }
      }

      // 3. ОБЫЧНЫЙ КЛИК (Select Only)
      else {
        // Если уже выделен, не трогать, если нет - выделить
        if (!el.classList.contains("selected")) {
          clearSelection();
          el.classList.add("selected");
        } else if (getSelectedItems().length === 1) {
          // Опционально: если клик по уже выделенному, сбросить все, если это единственный
          clearSelection();
        } else {
          clearSelection();
          el.classList.add("selected");
        }
      }

      // Обновляем lastSelectedEl и глобальную переменную
      lastSelectedEl = el.classList.contains("selected") ? el : null;
      window.selectedFileName = el.dataset.name;
      if (typeof insertFileName === "function") insertFileName(el.dataset.name);

      if (isMobile() && typeof openLightbox === "function") {
        const all = Array.from(document.querySelectorAll("#content .js-file"));
        const idx = all.indexOf(el);
        openLightbox(idx >= 0 ? idx : 0);
      }
    });

    // Даблклик — предпросмотр справа (только десктоп)
    el.addEventListener("dblclick", (e) => {
      if (isMobile()) return;
      e.preventDefault();
      if (typeof showPreview === "function") showPreview(name);
    });
  });

  // кнопка закрытия предпросмотра (если есть)
  const closeBtn = document.getElementById("previewCloseBtn");
  if (closeBtn) closeBtn.onclick = hidePreview;

  // --- папки (карточки) ---
  document.querySelectorAll("#content .category-card").forEach((el) => {
    const name = el.dataset.name;
    const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

    // Хелпер для выделения папки
    const selectOnlyFolder = () => {
      // Сбросить выделение со ВСЕГО
      document
        .querySelectorAll("#content .selected")
        .forEach((n) => n.classList.remove("selected"));
      el.classList.add("selected");
      // Обновить глобальный selectedFileName
      try {
        window.selectedFileName = name;
      } catch {}
      if (typeof insertFileName === "function") insertFileName(name);
    };

    // 1. DblClick — Выделить папку (на десктопе)
    el.addEventListener("dblclick", (e) => {
      if (isMobile()) return;
      e.preventDefault(); // Останавливаем переход по ссылке
      selectOnlyFolder();
    });

    // 2. Shift/Ctrl Клик — Мультивыбор папок
    el.addEventListener("click", (e) => {
      // Мы не обрабатываем обычный клик, чтобы оставить навигацию по ссылке

      // 🛑 Важное замечание:
      // Если вы хотите разрешить мультивыбор *только* папок (как в Проводнике: нельзя выделить и файл, и папку),
      // то при нажатии Ctrl/Shift нужно сбросить выделение файлов.

      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        e.preventDefault(); // Останавливаем переход по ссылке

        // ⚠️ Сброс выделения файлов перед выделением папок
        document
          .querySelectorAll("#content .js-file.selected")
          .forEach((n) => n.classList.remove("selected"));

        // 1. CTRL/CMD КЛИК (Toggle)
        if (e.ctrlKey || e.metaKey) {
          el.classList.toggle("selected");
        }

        // 2. SHIFT КЛИК (Range Select)
        // (Сложно реализовать, т.к. нужно отслеживать lastSelectedEl для папок отдельно.
        // Для начала, можно ограничиться только Ctrl/Cmd.)
        else if (e.shiftKey) {
          // Если нет сложной логики диапазона, просто выделяем текущий элемент
          el.classList.add("selected");
        }

        // Обновляем глобальные переменные
        window.selectedFileName = el.dataset.name;
        if (typeof insertFileName === "function") insertFileName(name);
      }
    });

    // ПКМ и Long-press уже обрабатываются через initAdminContextMenu,
    // который вызывает bindContextFor для .category-card!
  });
};

// --- showPreview и hidePreview ---
function previewUrlFor(name) {
  const p = typeof getCurrentPath === "function" ? getCurrentPath() : "";
  return `uploads/${p ? p + "/" : ""}${name}`;
}

function showPreview(name) {
  const pane = document.getElementById("previewPane");
  if (pane) {
    pane.hidden = false;
    pane.classList.add("active");
    if (!pane.style.width) {
      pane.style.width = "400px";
      pane.style.flex = "0 1 400px";
    }
  }

  if (window.innerWidth <= 768) {
    const all = Array.from(document.querySelectorAll("#content .js-file"));
    const index = all.findIndex((el) => el.dataset.name === name);
    if (index >= 0) openLightbox(index);
    return;
  }

  if (!previewPane || !previewImg) return;
  const errBox = document.getElementById("previewError");
  if (errBox) errBox.hidden = true;

  previewImg.onload = () => {
    if (errBox) errBox.hidden = true;
    previewPane.classList.add("active");
    fitPreviewToImage();
  };

  previewImg.onerror = () => {
    previewImg.removeAttribute("src");
    if (errBox) errBox.hidden = false;
    previewPane.classList.add("active");
  };

  previewImg.src = previewUrlFor(name);
}

function hidePreview() {
  const pane = document.getElementById("previewPane");
  if (pane) {
    pane.classList.remove("active");
    pane.hidden = true;
  }

  if (!previewPane || !previewImg) return;
  previewImg.removeAttribute("src");
  previewPane.classList.remove("active");
  previewPane.style.width = "";
  previewPane.style.flex = "";
}

// делаем доступными глобально
window.showPreview = showPreview;
window.hidePreview = hidePreview;

function getSelectedItems() {
  // Включаем файлы и папки
  return Array.from(
    document.querySelectorAll(
      "#content .js-file.selected, #content .category-card.selected"
    )
  );
}

// ==== DnD (drag&drop) для админки =========================================
function initAdminDnD() {
  const grid = document.getElementById("content");
  if (!grid) return;

  // ---------- helperы ----------
  const hasFiles = (e) =>
    !!e.dataTransfer &&
    Array.from(e.dataTransfer.types || []).includes("Files");

  const hasAdminPayload = (e) =>
    !!e.dataTransfer &&
    Array.from(e.dataTransfer.types || []).includes("application/x-admin-dnd");

  function payloadFromEvent(e) {
    try {
      const raw =
        e.dataTransfer.getData("application/x-admin-dnd") ||
        e.dataTransfer.getData("text/plain");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function markDragging(items, on) {
    grid
      .querySelectorAll(".js-file")
      .forEach((n) => n.classList.remove("dragging"));
    if (on) items.forEach((n) => n.classList.add("dragging"));
  }

  // ---------- внешние файлы (дроп из Проводника) ----------
  grid.addEventListener("dragover", (e) => {
    if (hasFiles(e)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });

  grid.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;

    // загрузка в текущую папку
    for (const f of files) {
      try {
        const form = new FormData();
        form.append(
          "folderPath",
          (typeof getCurrentPath === "function" ? getCurrentPath() : "") || ""
        );
        form.append("file", f);
        const res = await fetch("/upload-file", { method: "POST", body: form });
        await (typeof handleResponse === "function"
          ? handleResponse(res)
          : res.json());
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    typeof renderPortfolio === "function" && (await renderPortfolio());
    typeof showToast === "function" &&
      showToast(`Uploaded ${files.length} file(s)`, "success");
  });

  // ---------- сами файлы делаем draggable ----------
  grid.querySelectorAll(".js-file").forEach((el) => {
    el.setAttribute("draggable", "true");
    if (el.dataset.dnd === "1") return;
    el.dataset.dnd = "1";

    el.addEventListener("dragstart", (e) => {
      const selected = getSelectedItems();
      const pack = selected.length ? selected : [el];
      const payload = {
        sourcePath:
          (typeof getCurrentPath === "function" ? getCurrentPath() : "") || "",
        items: pack.map((n) => ({ name: n.dataset.name, type: "file" })),
      };
      e.dataTransfer.setData(
        "application/x-admin-dnd",
        JSON.stringify(payload)
      );
      e.dataTransfer.setData("text/plain", JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
      markDragging(pack, true);
    });

    el.addEventListener("dragend", () => markDragging([], false));
  });

  // ---------- папки как цели дропа ----------
  grid.querySelectorAll(".category-card").forEach((card) => {
    const allow = (e) => {
      if (hasAdminPayload(e) || hasFiles(e)) {
        e.preventDefault();
        card.classList.add("drop-target");
        e.dataTransfer.dropEffect = hasFiles(e) ? "copy" : "move";
      }
    };
    card.addEventListener("dragenter", allow);
    card.addEventListener("dragover", allow);

    card.addEventListener("dragleave", () =>
      card.classList.remove("drop-target")
    );

    card.addEventListener("drop", async (e) => {
      card.classList.remove("drop-target");
      e.preventDefault();

      const folderName =
        card.dataset?.name ||
        card.querySelector(".card-title")?.textContent?.trim();
      if (!folderName) return;

      const basePath =
        (typeof getCurrentPath === "function" ? getCurrentPath() : "") || "";
      const targetPath = basePath ? `${basePath}/${folderName}` : folderName;

      // 1) Перемещение внутренних элементов (payload)
      if (hasAdminPayload(e)) {
        const data = payloadFromEvent(e);
        if (data?.items?.length) {
          for (const it of data.items) {
            const oldPath = data.sourcePath
              ? `${data.sourcePath}/${it.name}`
              : it.name;
            const newPath = `${targetPath}/${it.name}`;
            try {
              const res = await fetch("/rename", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldPath, newPath }),
              });
              await (typeof handleResponse === "function"
                ? handleResponse(res)
                : res.json());
            } catch (err) {
              console.error("Move failed:", err);
            }
          }
          typeof renderPortfolio === "function" && (await renderPortfolio());
          typeof showToast === "function" &&
            showToast(
              `Moved ${data.items.length} item(s) → ${folderName}`,
              "success"
            );
        }
        return;
      }

      // 2) Дроп внешних файлов прямо на папку
      if (hasFiles(e)) {
        const files = Array.from(e.dataTransfer.files || []);
        for (const f of files) {
          try {
            const form = new FormData();
            form.append("folderPath", targetPath);
            form.append("file", f);
            const res = await fetch("/upload-file", {
              method: "POST",
              body: form,
            });
            await (typeof handleResponse === "function"
              ? handleResponse(res)
              : res.json());
          } catch (err) {
            console.error("Upload-to-folder failed:", err);
          }
        }
        typeof renderPortfolio === "function" && (await renderPortfolio());
        typeof showToast === "function" &&
          showToast(
            `Uploaded ${files.length} file(s) → ${folderName}`,
            "success"
          );
      }
    });
  });
}
// ==== /DnD ==================================================

// --- lightbox ---
const mediaLightbox = document.getElementById("mediaLightbox");
const mlbStage = document.getElementById("mlbStage");
const mlbCaption = document.getElementById("mlbCaption");
const mlbCounter = document.getElementById("mlbCounter");
const mlbClose = document.getElementById("mlbClose");
const mlbPrev = document.getElementById("mlbPrev");
const mlbNext = document.getElementById("mlbNext");

let mlbItems = [];
let mlbIndex = 0;

function openLightbox(index) {
  mlbItems = Array.from(document.querySelectorAll("#content .js-file"));
  mlbIndex = index;

  if (typeof hidePreview === "function") hidePreview();

  updateLightbox();
  if (mediaLightbox) {
    mediaLightbox.hidden = false;
    mediaLightbox.setAttribute("aria-hidden", "false");
  }
  document.body.classList.add("mlb-open");
}

function updateLightbox() {
  const item = mlbItems[mlbIndex];
  if (!item || !mlbStage) return;
  mlbStage.innerHTML = "";
  const img = document.createElement("img");
  img.src = item.src;
  img.alt = item.dataset.name || "";
  mlbStage.appendChild(img);
  if (mlbCaption) mlbCaption.textContent = item.dataset.name || "";
  if (mlbCounter)
    mlbCounter.textContent = `${mlbIndex + 1} / ${mlbItems.length}`;
}

function closeLightbox() {
  if (!mediaLightbox) return;
  mediaLightbox.hidden = true;
  mediaLightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("mlb-open");
}

if (mlbClose) mlbClose.addEventListener("click", closeLightbox);
if (mlbPrev)
  mlbPrev.addEventListener("click", () => {
    if (mlbItems.length > 0) {
      mlbIndex = (mlbIndex - 1 + mlbItems.length) % mlbItems.length;
      updateLightbox();
    }
  });
if (mlbNext)
  mlbNext.addEventListener("click", () => {
    if (mlbItems.length > 0) {
      mlbIndex = (mlbIndex + 1) % mlbItems.length;
      updateLightbox();
    }
  });

function syncPreviewWithViewport() {
  const pane = document.getElementById("previewPane");
  const img = document.getElementById("previewImage");
  if (!pane) return;

  const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

  if (!isDesktop) {
    pane.classList.remove("active");
    pane.hidden = true;
    pane.style.width = "";
    pane.style.flex = "";
    return;
  }

  if (!img || !img.getAttribute("src")) {
    pane.classList.remove("active");
    pane.hidden = true;
    pane.style.width = "";
    pane.style.flex = "";
  }
}

document.addEventListener("DOMContentLoaded", syncPreviewWithViewport);
window.addEventListener("resize", syncPreviewWithViewport);

// --- старт ---
document.addEventListener("DOMContentLoaded", () => {
  const adminRoot =
    document.getElementById("workspace") ||
    document.getElementById("content") ||
    document.querySelector(".admin-preview");
  if (!adminRoot) return;

  workspace = document.getElementById("workspace");
  previewPane = document.getElementById("previewPane");
  resizer = document.getElementById("previewResizer");
  previewImg = document.getElementById("previewImage");

  const inputRenameOld = document.getElementById("renameOld");
  const inputDeleteName = document.getElementById("deleteName");

  if (inputRenameOld) {
    inputRenameOld.addEventListener("focus", () => {
      if (selectedFileName) {
        inputRenameOld.value = selectedFileName;
      }
    });
  }

  if (inputDeleteName) {
    inputDeleteName.addEventListener("focus", () => {
      if (selectedFileName) {
        inputDeleteName.value = selectedFileName;
      }
    });
  }

  typeof attachResizer === "function" && attachResizer();

  if (typeof renderPortfolio === "function") {
    renderPortfolio();
  }

  document.querySelectorAll(".admin-body [data-i18n]").forEach((n) => {
    if (n.childNodes.length === 1 && n.firstChild.nodeType === Node.TEXT_NODE) {
      n.replaceWith(n.firstChild);
    }
  });
});

window.insertFileName = function (name) {
  selectedFileName = name;
  window.selectedFileName = name;
};

// ===== контекстное меню + long-press =====
(function () {
  let menu, lpTimer;

  function ensureMenu() {
    if (menu) return menu;
    menu = document.createElement("div");
    menu.className = "admin-ctx";
    menu.innerHTML = `
      <button data-act="open">Open / Preview</button>
      <button data-act="rename">Rename…</button>
      <button data-act="delete">Delete…</button>
    `;
    document.body.appendChild(menu);

    const close = () => menu.classList.remove("open");
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target)) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    return menu;
  }

  function openDrawerAndFocus(which) {
    const explorer = document.querySelector(".admin-explorer");
    if (!explorer) return;

    if (!window.matchMedia("(max-width: 1023px)").matches) return;

    explorer.classList.add("is-open");

    const focusAndScroll = () => {
      if (which === "rename") {
        const ro = document.getElementById("renameOld");
        const rn = document.getElementById("renameNew");
        const row = document.querySelector(".rename-group");
        ro && ro.scrollIntoView({ block: "center", behavior: "smooth" });
        (rn || ro)?.focus();
      } else if (which === "delete") {
        const del = document.getElementById("deleteName");
        const row = document.querySelector(".delete-group");
        row && row.scrollIntoView({ block: "center", behavior: "smooth" });
        del?.focus();
      }
    };

    requestAnimationFrame(() => requestAnimationFrame(focusAndScroll));
  }

  function showMenu(x, y, targetEl) {
    const name =
      targetEl?.dataset?.name ||
      targetEl?.querySelector?.(".card-title")?.textContent?.trim();
    if (!name) return;

    const m = ensureMenu();
    m.dataset.name = name;

    const prevVis = m.style.visibility;
    m.style.visibility = "hidden";
    m.classList.add("open");
    m.style.left = "0px";
    m.style.top = "0px";

    m.style.maxWidth = "min(260px, 90vw)";
    m.style.maxHeight = window.innerHeight - 16 + "px";
    m.style.overflowY = "auto";
    m.style.zIndex = "3000";

    const pad = 8;
    const r = m.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;

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
    m.style.visibility = prevVis || "visible";

    m.onclick = async (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;
      e.stopPropagation();

      document
        .querySelectorAll("#content .selected")
        .forEach((n) => n.classList.remove("selected"));
      targetEl.classList?.add("selected");
      if (typeof insertFileName === "function") insertFileName(name);

      if (act === "open") {
        if (window.matchMedia("(max-width: 768px)").matches) {
          const all = Array.from(
            document.querySelectorAll("#content .js-file")
          );
          const idx = all.indexOf(targetEl);
          if (idx >= 0 && typeof openLightbox === "function") openLightbox(idx);
        } else {
          if (typeof showPreview === "function") showPreview(name);
        }
      } else if (act === "rename") {
        const ro = document.getElementById("renameOld");
        const rn = document.getElementById("renameNew");
        if (ro) ro.value = name;
        openDrawerAndFocus("rename");
      } else if (act === "delete") {
        const del = document.getElementById("deleteName");
        if (del) {
          del.value = name;
          openDrawerAndFocus("delete");
        }
      }

      m.classList.remove("open");
    };

    const close = () => {
      m.classList.remove("open");
      document.removeEventListener("click", onDoc, { capture: true });
      document.removeEventListener("keydown", onKey);
    };
    const onDoc = (e) => {
      if (!m.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };

    setTimeout(() => {
      document.addEventListener("click", onDoc, { capture: true, once: true });
    }, 0);
    document.addEventListener("keydown", onKey, { once: true });
  }

  function bindContextFor(el) {
    // ПКМ — десктоп
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      document
        .querySelectorAll("#content .selected")
        .forEach((n) => n.classList.remove("selected"));
      el.classList.add("selected");

      const name =
        el.dataset?.name ||
        el.querySelector?.(".card-title")?.textContent?.trim();
      if (name && typeof insertFileName === "function") insertFileName(name);
      if (typeof showMenu === "function") showMenu(e.clientX, e.clientY, el);
    });

    // Long-press — мобилка (~550мс)
    let lpTimer;
    el.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        lpTimer = setTimeout(() => {
          document
            .querySelectorAll("#content .selected")
            .forEach((n) => n.classList.remove("selected"));
          el.classList.add("selected");

          const name =
            el.dataset?.name ||
            el.querySelector?.(".card-title")?.textContent?.trim();
          if (name && typeof insertFileName === "function")
            insertFileName(name);
          if (typeof showMenu === "function")
            showMenu(t.clientX, t.clientY, el);
        }, 550);
      },
      { passive: true }
    );

    ["touchend", "touchcancel", "touchmove"].forEach((type) => {
      el.addEventListener(
        type,
        () => {
          if (lpTimer) clearTimeout(lpTimer);
        },
        { passive: true }
      );
    });
  }

  // вызывать после рендера миниатюр
  window.initAdminContextMenu = function () {
    document
      .querySelectorAll("#content .js-file, #content .category-card")
      .forEach(bindContextFor);
  };
})();
