// src/modules/clipboard/index.js
// Простой буфер обмена для файлов/папок: режим CUT (перемещение)

let clip = null; // { mode:'cut', sourcePath:'a/b', items:[{name, kind:'file'|'folder'}] }

export function cutFromSelection() {
  // берём выделенные в сетке (файлы и папки)
  const selectedEls = Array.from(
    document.querySelectorAll(
      "#content .js-file.selected, #content .category-card.selected"
    )
  );
  // если ничего не выделено — выходим (меню потом подстрахуем)
  if (!selectedEls.length) return false;

  const items = selectedEls
    .map((el) => ({
      name: el.dataset.name,
      kind: el.classList.contains("category-card") ? "folder" : "file",
      el,
    }))
    .filter((it) => !!it.name);

  const sourcePath =
    (typeof window.getCurrentPath === "function"
      ? window.getCurrentPath()
      : "") || "";

  clip = { mode: "cut", sourcePath, items };

  // лёгкая визуализация "вырезано"
  items.forEach((it) => it.el?.classList.add("cutting"));
  return true;
}

export function hasCut() {
  return (
    !!clip &&
    clip.mode === "cut" &&
    Array.isArray(clip.items) &&
    clip.items.length > 0
  );
}

export function getCut() {
  return hasCut()
    ? { ...clip, items: clip.items.map(({ name, kind }) => ({ name, kind })) }
    : null;
}

export function clear() {
  document
    .querySelectorAll("#content .cutting")
    .forEach((n) => n.classList.remove("cutting"));
  clip = null;
}
