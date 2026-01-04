//=======================================================
/** render.js
 * Рендер портфолио (ранее window.renderPortfolio)
 * - читает путь из URL (?category=&subcategory1=&...)
 * - грузит data/portfolio.json
 * - отрисовывает файлы и папки
 * - эмитит 'gallery:rendered' для подписчиков (selection/dnd/contextmenu)
 * - оставляет мост: window.renderPortfolio = render
 */
//=======================================================

import { emit } from "../../core/eventBus.js";
import { EVENTS } from "../../schemas/events.js";

let cfg = { basePage: "admin-portfolio.html", dataUrl: "data/portfolio.json" };

function readPathFromURL() {
  const params = new URLSearchParams(window.location.search);
  const path = [];
  if (params.get("category")) path.push(params.get("category"));
  let i = 1;
  while (params.get("subcategory" + i)) {
    path.push(params.get("subcategory" + i));
    i++;
  }
  return path;
}

async function loadData() {
  const url = `${cfg.dataUrl}?_=${Date.now()}`; // форсим обновление
  const r = await fetch(url, { cache: "reload" });
  return await r.json();
}

function setPageTitle(path) {
  const pageTitle = document.getElementById("pageTitle");
  if (!pageTitle) return;
  pageTitle.textContent = path.length
    ? path[path.length - 1].replace(/_/g, " ")
    : "Portfolio";
}

function buildBreadcrumbs(path) {
  const bc = document.getElementById("breadcrumbs");
  if (!bc) return;
  bc.innerHTML = "";
  if (!path.length) return;

  let link = `${cfg.basePage}`;
  bc.innerHTML = `<a href="${link}">Portfolio</a>`;
  let subLink = "";
  path.forEach((seg, idx) => {
    subLink +=
      idx === 0
        ? `?category=${encodeURIComponent(seg)}`
        : `&subcategory${idx}=${encodeURIComponent(seg)}`;
    const isLast = idx === path.length - 1;
    bc.innerHTML += ` <span>›</span> <a href="${cfg.basePage}${subLink}"${
      isLast ? ' class="active"' : ""
    }>${seg.replace(/_/g, " ")}</a>`;
  });
}

function renderFiles(container, files, path) {
  if (!files.length) return;
  const gallery = document.createElement("div");
  gallery.className =
    files.length <= 2 ? "gallery gallery--compact" : "gallery";

  files.forEach((fileNode) => {
    const file = fileNode.name;
    const ext = file.split(".").pop().toLowerCase();
    const filePath = `uploads/${path.join("/")}/${file}`;
    const cell = document.createElement("div");
    cell.className = "cell js-file";
    cell.dataset.name = file; // <-- ДАННЫЕ ПЕРЕНОСИМ СЮДА
    cell.dataset.type = "file"; // <-- (Опционально, но полезно)

    if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      const img = document.createElement("img");
      img.src = filePath;
      img.alt = file;
      img.style.pointerEvents = "none";
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
      video.style.pointerEvents = "none";
      const caption = document.createElement("div"); // ← ДОБАВЬ
      caption.className = "file-caption";
      caption.textContent = file;

      cell.appendChild(video);
      cell.appendChild(caption); // ← ДОБАВЬ
    }

    gallery.appendChild(cell);
  });

  container.appendChild(gallery);
}

function folderLinkFor(path, subNode) {
  const subPath = [...path, subNode.name];
  let link = `${cfg.basePage}?category=${encodeURIComponent(
    path[0] || subNode.name
  )}`;
  for (let k = 1; k < path.length; k++)
    link += `&subcategory${k}=${encodeURIComponent(path[k])}`;
  if (path.length)
    link += `&subcategory${path.length}=${encodeURIComponent(subNode.name)}`;
  return { link, subPath };
}

function renderFolders(container, subs, path) {
  if (!subs.length) return;
  const list = document.createElement("div");
  list.className = "category-list";

  subs.forEach((subNode) => {
    const { link, subPath } = folderLinkFor(path, subNode);

    let previewFile = "";
    const firstFile = (subNode.children || []).find((c) => c.type === "file");
    if (firstFile) previewFile = firstFile.name;

    const imgPath = previewFile
      ? `uploads/${subPath.join("/")}/${previewFile}`
      : "img/no-image.jpg";

    const card = document.createElement("div");
    card.className = "category-card";
    card.style.cursor = "pointer";
    card.dataset.href = link; // сохраняем ссылку в data-атрибуте

    card.dataset.path = subPath.join("/");
    card.dataset.name = subNode.name;

    // Навигация по клику (НЕ во время drag)
    card.addEventListener("click", (e) => {
      // Если идёт drag — не навигируем
      if (card.classList.contains("drop-target")) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        window.open(card.dataset.href, "_blank");
      } else {
        window.location.href = card.dataset.href;
      }
    });
    /*
    card.onclick = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return; // мультивыбор — без навигации
      if (card.classList.contains("drop-target")) {
        // во время DnD — блок
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const href = card.dataset.href;
      if (href) window.location.href = href; // обычная навигация
    };*/

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

export async function render() {
  const path = readPathFromURL();
  try {
    const data = await loadData();

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

    setPageTitle(path);
    buildBreadcrumbs(path);

    const container = document.getElementById("content");
    if (!container) return;
    container.innerHTML = "";

    if (!currentNode) {
      container.textContent = "❌ Folder not found";
      emit(EVENTS.GALLERY_RENDERED);
      return;
    }

    const subs = (currentNode.children || []).filter(
      (c) => c.type === "folder"
    );
    renderFolders(container, subs, path);

    const files = (currentNode.children || []).filter((c) => c.type === "file");
    renderFiles(container, files, path);

    // уведомляем подписчиков (selection/dnd/contextmenu)
    emit(EVENTS.GALLERY_RENDERED);
  } catch (e) {
    console.error("JSON loading error:", e);
  }
}

export function getCurrentPath() {
  return readPathFromURL().join("/");
}

export function init(config = {}) {
  cfg = { ...cfg, ...config };
  // обратная совместимость — старый код вызывает window.renderPortfolio()
  window.renderPortfolio = render;
  window.getCurrentPath = getCurrentPath;
  // автозапуск (если DOM уже готов — рендерим сразу)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
}
