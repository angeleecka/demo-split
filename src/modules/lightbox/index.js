// src\modules\lightbox\index.js

import { on } from "../../core/eventBus.js";

let box, stage, caption, counter, btnClose, btnPrev, btnNext;
let items = [];
let idx = 0;

function collectItems() {
  items = Array.from(document.querySelectorAll("#content .js-file"));
}

function update() {
  if (!items.length || !stage) return;
  const el = items[idx];
  stage.innerHTML = "";
  if (!el) return;
  const img = document.createElement("img");
  img.src = el.src;
  img.alt = el.dataset.name || "";
  stage.appendChild(img);
  if (caption) caption.textContent = el.dataset.name || "";
  if (counter) counter.textContent = `${idx + 1} / ${items.length}`;
}

export function openAt(i = 0) {
  collectItems();
  if (!items.length) return;
  idx = Math.max(0, Math.min(i, items.length - 1));
  if (typeof window.hidePreview === "function") window.hidePreview();
  if (box) {
    box.hidden = false;
    box.setAttribute("aria-hidden", "false");
  }
  document.body.classList.add("mlb-open");
  update();
}

export function close() {
  if (!box) return;
  box.hidden = true;
  box.setAttribute("aria-hidden", "true");
  document.body.classList.remove("mlb-open");
}

function next() {
  if (items.length) {
    idx = (idx + 1) % items.length;
    update();
  }
}
function prev() {
  if (items.length) {
    idx = (idx - 1 + items.length) % items.length;
    update();
  }
}

function bindControls() {
  if (btnClose) btnClose.addEventListener("click", close);
  if (btnPrev) btnPrev.addEventListener("click", prev);
  if (btnNext) btnNext.addEventListener("click", next);

  document.addEventListener("keydown", (e) => {
    if (box?.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  });
}

export function init() {
  box = document.getElementById("mediaLightbox");
  stage = document.getElementById("mlbStage");
  caption = document.getElementById("mlbCaption");
  counter = document.getElementById("mlbCounter");
  btnClose = document.getElementById("mlbClose");
  btnPrev = document.getElementById("mlbPrev");
  btnNext = document.getElementById("mlbNext");

  bindControls();

  on("lightbox:open", ({ index = 0 } = {}) => openAt(index));

  // мосты для обратной совместимости
  window.openLightbox = openAt;
  window.closeLightbox = close;
}
