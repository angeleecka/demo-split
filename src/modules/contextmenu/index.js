// \src\modules\contextmenu\index.js

import { on } from "../../core/eventBus.js";

let menu = null; // DOM-элемент контекст-меню (создадим в init)
let lpTimer = null; // таймер long-press
let cutClip = null; // { mode:'cut', sourcePath, items:[{name, kind, el}] } для Cut/Paste

const CLIP_KEY = "admin.clip";

function saveClipToStorage(clip) {
  const safe = {
    mode: "cut",
    sourcePath: clip.sourcePath || "",
    items: (clip.items || []).map(({ name, kind }) => ({ name, kind })),
  };
  sessionStorage.setItem(CLIP_KEY, JSON.stringify(safe));
}

function loadClipFromStorage() {
  try {
    const raw = sessionStorage.getItem(CLIP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearClipStorage() {
  sessionStorage.removeItem(CLIP_KEY);
}

function reapplyCutMarkersIfVisible() {
  const clip = loadClipFromStorage();
  const here = window.getCurrentPath?.() || "";
  if (!clip || clip.mode !== "cut" || clip.sourcePath !== here) return;

  document
    .querySelectorAll("#content .cutting")
    .forEach((n) => n.classList.remove("cutting"));
  const names = new Set(clip.items.map((i) => i.name));
  document
    .querySelectorAll("#content .js-file, #content .category-card")
    .forEach((el) => {
      const nm =
        el.dataset.name ||
        el.querySelector?.(".card-title")?.textContent?.trim();
      if (nm && names.has(nm)) el.classList.add("cutting");
    });
}

function ensureMenu() {
  if (menu) return menu;
  menu = document.createElement("div");
  menu.className = "admin-ctx";
  menu.innerHTML = `
<button data-act="open">Open / Preview</button>
<button data-act="rename">Rename…</button>
<button data-act="delete">Delete…</button>
<button data-act="delete-selected">Delete selected</button>
<button data-act="move-selected">Move selected here</button>
<hr>
  <button data-act="cut">Cut</button>
  <button data-act="paste-here">Paste here</button>
<button data-act="cancel-cut">Cancel cut</button>
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
  const isBg = !targetEl; // клик по пустому месту сетки
  const name = isBg
    ? ""
    : targetEl?.dataset?.name ||
      targetEl?.querySelector?.(".card-title")?.textContent?.trim();

  const m = ensureMenu();
  m.dataset.name = name || "";

  // включаем/прячем пункты по контексту и буферу
  const clip = loadClipFromStorage() || cutClip;
  const hasClip = !!(clip && clip.items && clip.items.length);
  const isFolder = !!targetEl?.classList?.contains("category-card");

  const toggle = (sel, show) => {
    const el = m.querySelector(sel);
    if (el) el.style.display = show ? "" : "none";
  };

  toggle('[data-act="open"]', !isBg);
  toggle('[data-act="rename"]', !isBg);
  toggle('[data-act="delete"]', !isBg);
  toggle('[data-act="delete-selected"]', true); // можно оставить всегда
  toggle('[data-act="move-selected"]', !isBg && isFolder);
  toggle('[data-act="cut"]', !isBg);
  toggle('[data-act="paste-here"]', hasClip);
  toggle('[data-act="cancel-cut"]', hasClip);

  // ——— дальше оставляешь свой существующий код позиционирования ———
  const prevVis = m.style.visibility;
  m.style.visibility = "hidden";
  m.classList.add("open");
  m.style.left = "0px";
  m.style.top = "0px";
  // включаем/выключаем Paste по наличию буфера
  const pasteBtn = m.querySelector('[data-act="paste-here"]');
  if (pasteBtn)
    //
    m.style.maxWidth = "min(260px, 90vw)";
  m.style.maxHeight = window.innerHeight - 16 + "px";
  m.style.overflowY = "auto";
  m.style.zIndex = "3000";

  const pad = 8;
  const r = m.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;

  if (left + r.width > window.innerWidth - pad)
    left = Math.max(pad, window.innerWidth - r.width - pad);
  if (top + r.height > window.innerHeight - pad) {
    const above = y - r.height - pad;
    top =
      above >= pad ? above : Math.max(pad, window.innerHeight - r.height - pad);
  }

  m.style.left = left + "px";
  m.style.top = top + "px";
  m.style.visibility = prevVis || "visible";

  /*const moveBtn = m.querySelector('[data-act="move-selected"]');
  const isFolder = targetEl?.classList?.contains("category-card");
  if (moveBtn) moveBtn.style.display = isFolder ? "" : "none";*/

  m.onclick = async (e) => {
    const act = e.target?.dataset?.act;
    if (!act) return;
    e.stopPropagation();

    const selectedNow = Array.from(
      document.querySelectorAll(
        "#content .js-file.selected, #content .category-card.selected"
      )
    );

    // сбрасываем выделение ТОЛЬКО для одиночных действий

    if (act !== "delete-selected" && act !== "move-selected" && act !== "cut") {
      document
        .querySelectorAll("#content .selected")
        .forEach((n) => n.classList.remove("selected"));
      if (targetEl) {
        targetEl.classList.add("selected");
        if (typeof insertFileName === "function" && name) insertFileName(name);
      }
    }

    if (act === "open") {
      if (window.matchMedia("(max-width: 768px)").matches) {
        const all = Array.from(document.querySelectorAll("#content .js-file"));
        const i = all.indexOf(targetEl);
        if (i >= 0 && typeof window.openLightbox === "function")
          window.openLightbox(i);
      } else {
        if (typeof window.showPreview === "function") window.showPreview(name);
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
    } else if (act === "delete-selected") {
      const selected = Array.from(
        document.querySelectorAll(
          "#content .js-file.selected, #content .category-card.selected"
        )
      );
      if (!selected.length) {
        window.showToast?.("Nothing selected", "info");
        return;
      }
      // собираем имена
      const names = selected
        .map(
          (el) =>
            el.dataset.name ||
            el.querySelector?.(".card-title")?.textContent?.trim()
        )
        .filter(Boolean);
      // текущий путь
      const base =
        (typeof window.getCurrentPath === "function"
          ? window.getCurrentPath()
          : "") || "";
      // удаляем по одному, но без лишних перерисовок/тостов
      for (const name of names) {
        const targetPath = base ? `${base}/${name}` : name;
        const res = await fetch(window.API_BASE_URL + "/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPath }),
        });
        // единый обработчик, если есть
        if (typeof window.handleResponse === "function") {
          await window.handleResponse(res);
        } else {
          await res.json().catch(() => ({}));
        }
      }
      // одна перерисовка и один тост по итогам
      if (typeof window.renderPortfolio === "function")
        await window.renderPortfolio();
      window.showToast?.(`Deleted ${names.length} item(s)`, "success");
    } else if (act === "move-selected") {
      const targetName = m.dataset.name; // имя целевой папки
      const base = window.getCurrentPath?.() || ""; // текущая папка
      const targetPath = base ? `${base}/${targetName}` : targetName;

      // берём ВСЁ выделенное: файлы и папки в текущей папке
      const selected = Array.from(
        document.querySelectorAll(
          "#content .js-file.selected, #content .category-card.selected"
        )
      );
      if (!selected.length) {
        window.showToast?.("Nothing selected", "info");
        return;
      }

      // переносим по одному (без лишних перерисовок)
      for (const el of selected) {
        const name =
          el.dataset.name ||
          el.querySelector?.(".card-title")?.textContent?.trim();
        if (!name) continue;
        // не двигаем папку в саму себя
        if (el.classList.contains("category-card") && name === targetName)
          continue;
        const oldPath = base ? `${base}/${name}` : name;
        const newPath = `${targetPath}/${name}`;
        try {
          const res = await fetch(window.API_BASE_URL + "/rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldPath, newPath }),
          });
          if (window.handleResponse) {
            await window.handleResponse(res);
          } else {
            await res.json().catch(() => ({}));
          }
        } catch (err) {
          console.error("Move failed:", name, err);
        }
      }
      // одна перерисовка и один тост по итогам
      await window.renderPortfolio?.();
      window.showToast?.(
        `Moved ${selected.length} item(s) → ${targetName}`,
        "success"
      );
    } else if (act === "cut") {
      // соберём текущее выделение (если пусто — возьмём targetEl)
      const selected = Array.from(
        document.querySelectorAll(
          "#content .js-file.selected, #content .category-card.selected"
        )
      );
      const pack = selected.length ? selected : targetEl ? [targetEl] : [];
      const items = pack
        .map((el) => ({
          name:
            el.dataset.name ||
            el.querySelector?.(".card-title")?.textContent?.trim(),
          kind: el.classList.contains("category-card") ? "folder" : "file",
          el,
        }))
        .filter((it) => !!it.name);

      const sourcePath = window.getCurrentPath?.() || "";
      if (!items.length) {
        window.showToast?.("Nothing selected", "info");
        return;
      }

      // сохранить в буфер и слегка «побледнить» вырезанные
      cutClip = { mode: "cut", sourcePath, items };
      document
        .querySelectorAll("#content .cutting")
        .forEach((n) => n.classList.remove("cutting"));
      items.forEach((it) => it.el?.classList.add("cutting"));

      saveClipToStorage(cutClip);

      window.showToast?.(`Cut ${items.length} item(s)`, "info");
    } else if (act === "paste-here") {
      // берём клипборд из памяти или из sessionStorage
      const clip = cutClip || loadClipFromStorage();
      if (!(clip && clip.items && clip.items.length)) {
        window.showToast?.("Clipboard is empty", "info");
        return;
      }

      // куда вставляем
      let targetPath = window.getCurrentPath?.() || "";
      if (targetEl?.classList?.contains("category-card")) {
        const p = targetEl.dataset.path;
        const n =
          targetEl.dataset.name ||
          targetEl.querySelector?.(".card-title")?.textContent?.trim();
        targetPath = p || (targetPath ? `${targetPath}/${n}` : n);
      }

      // защита: не переносим в саму себя / в потомка
      const safe = clip.items.filter((it) => {
        const oldPath = clip.sourcePath
          ? `${clip.sourcePath}/${it.name}`
          : it.name;
        if (targetPath === oldPath) return false;
        if (targetPath.startsWith(oldPath + "/")) return false;
        return true;
      });
      if (!safe.length) {
        window.showToast?.("Nothing to paste here", "info");
        return;
      }

      // переносим по одному (как в dnd)
      let okCount = 0;
      for (const it of safe) {
        const oldPath = clip.sourcePath
          ? `${clip.sourcePath}/${it.name}`
          : it.name;
        const newPath = targetPath ? `${targetPath}/${it.name}` : it.name;
        try {
          const res = await fetch(window.API_BASE_URL + "/rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldPath, newPath }),
          });
          if (window.handleResponse) {
            await window.handleResponse(res);
          } else if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          okCount++;
        } catch (err) {
          console.error("Paste move failed:", it.name, err);
        }
      }

      // очистка буфера и отметок «вырезано»
      document
        .querySelectorAll("#content .cutting")
        .forEach((n) => n.classList.remove("cutting"));
      cutClip = null;
      clearClipStorage();

      await window.renderPortfolio?.();
      window.showToast?.(`Moved ${okCount} item(s)`, "success");
    } else if (act === "cancel-cut") {
      // снять «вырезано»: очистить буфер и подсветку
      document
        .querySelectorAll("#content .cutting")
        .forEach((n) => n.classList.remove("cutting"));
      cutClip = null;
      clearClipStorage();
      window.showToast?.("Cut canceled", "info");
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
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    // Проверяем, есть ли выделенные элементы
    const hasSelection =
      document.querySelectorAll("#content .selected").length > 0;
    const isFolder = el.classList.contains("category-card");

    // Если это папка И есть выделение — НЕ сбрасываем (для "Move selected here")
    if (isFolder && hasSelection) {
      // Ничего не делаем с выделением
    } else if (!el.classList.contains("selected")) {
      // Обычное поведение: сбрасываем выделение
      document
        .querySelectorAll("#content .selected")
        .forEach((n) => n.classList.remove("selected"));
      el.classList.add("selected");
    }

    const name =
      el.dataset?.name ||
      el.querySelector?.(".card-title")?.textContent?.trim();
    if (name && typeof insertFileName === "function") insertFileName(name);
    if (typeof showMenu === "function") showMenu(e.clientX, e.clientY, el);
  });

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
        if (name && typeof window.insertFileName === "function")
          window.insertFileName(name);
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
export function init() {
  on("gallery:rendered", () => {
    // существующее: биндим на карточки/файлы
    document
      .querySelectorAll("#content .js-file, #content .category-card")
      .forEach(bindContextFor);

    // НОВОЕ: ПКМ по пустому месту — наше меню с targetEl = null
    const grid = document.getElementById("content");
    if (grid && !grid.dataset.ctxBg) {
      grid.dataset.ctxBg = "1";
      grid.addEventListener("contextmenu", (e) => {
        const onItem = e.target.closest(".js-file, .category-card");
        if (onItem) return; // для самих карточек работает bindContextFor
        e.preventDefault();
        showMenu(e.clientX, e.clientY, null); // ← целимся в ТЕКУЩУЮ папку
      });
    }

    reapplyCutMarkersIfVisible();
  });
}
