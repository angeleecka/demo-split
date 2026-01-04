// \src\modules\selection\index.js

import { on, emit } from "../../core/eventBus.js";
import { isDragging } from "../dnd/index.js";
let lastFileEl = null;

const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

function clearSelection() {
  document
    .querySelectorAll("#content .selected")
    .forEach((el) => el.classList.remove("selected"));
}

export function getSelectedItems() {
  return Array.from(
    document.querySelectorAll(
      "#content .js-file.selected, #content .category-card.selected"
    )
  );
}

function emitSelectionChange() {
  const items = getSelectedItems();
  const names = items
    .map(
      (el) =>
        el.dataset.name || el.querySelector(".card-title")?.textContent?.trim()
    )
    .filter(Boolean);
  emit("selection:change", { items, names });
  if (names[0] && typeof window.insertFileName === "function")
    window.insertFileName(names[0]);
}

function selectRange(all, fromEl, toEl) {
  const a = all.indexOf(fromEl);
  const b = all.indexOf(toEl);
  if (a === -1 || b === -1) return;
  const [min, max] = [Math.min(a, b), Math.max(a, b)];
  for (let i = min; i <= max; i++) all[i].classList.add("selected");
}

function bindFile(el) {
  const all = Array.from(document.querySelectorAll("#content .js-file"));

  el.addEventListener("click", (e) => {
    if (isDragging) return;

    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      el.classList.toggle("selected");
    } else if (e.shiftKey && lastFileEl) {
      clearSelection();
      selectRange(all, lastFileEl, el);
    } else {
      clearSelection();
      el.classList.add("selected");
    }

    lastFileEl = el.classList.contains("selected") ? el : lastFileEl;
    emitSelectionChange();

    if (isMobile()) {
      const idx = all.indexOf(el);
      emit("lightbox:open", { index: idx >= 0 ? idx : 0 });
      if (typeof window.openLightbox === "function")
        window.openLightbox(idx >= 0 ? idx : 0);
    }
  });

  el.addEventListener("dblclick", (e) => {
    if (isMobile()) return;
    e.preventDefault();
    const name = el.dataset.name;
    if (name) emit("selection:itemOpen", { name });
  });
}

function bindFolder(el) {
  el.addEventListener("dblclick", (e) => {
    if (isMobile()) return; // оставляем навигацию по ссылке только по одинарному клику
    e.preventDefault();
    clearSelection();
    el.classList.add("selected");
    emitSelectionChange();
  });

  el.addEventListener("click", (e) => {
    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return; // обычный клик — навигация
    e.preventDefault();

    // если нужен эксклюзивный выбор «только папки», очищаем файлы
    document
      .querySelectorAll("#content .js-file.selected")
      .forEach((n) => n.classList.remove("selected"));

    if (e.ctrlKey || e.metaKey) {
      el.classList.toggle("selected");
    } else if (e.shiftKey) {
      el.classList.add("selected"); // упрощенно без диапазона
    }

    emitSelectionChange();
  });
}

function bindAll() {
  document.querySelectorAll("#content .js-file").forEach(bindFile);
  document.querySelectorAll("#content .category-card").forEach(bindFolder);
}

export function init() {
  on("gallery:rendered", bindAll);
  // на случай, если DOM уже есть до первого emit
  bindAll();
}
