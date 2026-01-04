// src\modules\preview\index.js

import { on, emit } from "../../core/eventBus.js";

let workspace, previewPane, resizer, previewImg;
let isResizing = false;

const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

function getMaxPreviewWidth() {
  if (!workspace) return window.innerWidth * 0.8;
  const rect = workspace.getBoundingClientRect();
  const workspaceLimit = Math.max(300, rect.width * 0.8);
  const imgNaturalWidth = previewImg?.naturalWidth || 0;
  return imgNaturalWidth > 0
    ? Math.min(imgNaturalWidth, workspaceLimit)
    : workspaceLimit;
}

function fitPreviewToImage() {
  if (!previewPane || !previewImg) return;
  if (!previewPane.classList.contains("active")) return;
  if (!previewImg.naturalWidth || previewImg.naturalWidth <= 0) return;
  const maxWidth = getMaxPreviewWidth();
  const minWidth = 280;
  const target = Math.max(
    minWidth,
    Math.min(previewImg.naturalWidth, maxWidth)
  );
  previewPane.style.width = `${target}px`;
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
    const rect = workspace.getBoundingClientRect();
    const minWidth = 280;
    const maxWidth = getMaxPreviewWidth();
    const newWidth = Math.max(0, Math.round(rect.right - e.clientX));
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      previewPane.style.width = `${newWidth}px`;
      previewPane.style.flex = "0 0 auto";
    }
  });

  document.addEventListener("mouseup", () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    previewPane.classList.remove("resizing");
  });

  window.addEventListener("resize", () => {
    if (previewPane?.classList.contains("active")) fitPreviewToImage();
  });
}

function previewUrlFor(name) {
  const p =
    typeof window.getCurrentPath === "function" ? window.getCurrentPath() : "";
  return `uploads/${p ? p + "/" : ""}${name}`;
}

export function show(name) {
  const pane = document.getElementById("previewPane");
  if (pane) {
    pane.hidden = false;
    pane.classList.add("active");
    if (!pane.style.width) {
      pane.style.width = "400px";
      pane.style.flex = "0 1 400px";
    }
  }

  if (!isDesktop()) {
    // На мобиле — в лайтбокс
    const all = Array.from(document.querySelectorAll("#content .js-file"));
    const index = all.findIndex((el) => el.dataset.name === name);
    emit("lightbox:open", { index: index >= 0 ? index : 0 });
    if (typeof window.openLightbox === "function")
      window.openLightbox(index >= 0 ? index : 0);
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
  emit("preview:open", { name });
}

export function hide() {
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
  emit("preview:close");
}

function syncPreviewWithViewport() {
  if (!previewPane) return;
  if (!isDesktop()) {
    previewPane.classList.remove("active");
    previewPane.hidden = true;
    previewPane.style.width = "";
    previewPane.style.flex = "";
    return;
  }
  if (!previewImg || !previewImg.getAttribute("src")) {
    previewPane.classList.remove("active");
    previewPane.hidden = true;
    previewPane.style.width = "";
    previewPane.style.flex = "";
  }
}

export function init() {
  workspace = document.getElementById("workspace");
  previewPane = document.getElementById("previewPane");
  resizer = document.getElementById("previewResizer");
  previewImg = document.getElementById("previewImage");

  attachResizer();

  const closeBtn = document.getElementById("previewCloseBtn");
  if (closeBtn) closeBtn.onclick = hide;

  on("selection:itemOpen", ({ name }) => show(name));

  document.addEventListener("DOMContentLoaded", syncPreviewWithViewport);
  window.addEventListener("resize", syncPreviewWithViewport);

  // мост для обратной совместимости со старым кодом
  window.showPreview = show;
  window.hidePreview = hide;
}
