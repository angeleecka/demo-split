// src/index.js

import { emit } from "./core/eventBus.js";
import * as gallery from "./modules/gallery/render.js";
import * as selection from "./modules/selection/index.js";
import * as preview from "./modules/preview/index.js";
import * as dnd from "./modules/dnd/index.js";
import * as lightbox from "./modules/lightbox/index.js";
import * as contextmenu from "./modules/contextmenu/index.js";

export function initApp({ mode = "public" } = {}) {
  gallery.init({
    basePage: "admin-portfolio.html",
    dataUrl: "/data/portfolio.json", // идём через маршрут Express без кеша
  });

  // выделение нужно везде
  selection.init();

  if (mode === "admin") {
    preview.init(); // предпросмотр справа
    dnd.init(); // drag & drop + внешние файлы
    contextmenu.init(); // rename/delete/move/cut/paste
  } else {
    lightbox.init(); // публичный просмотр картинок/видео
  }

  emit("app:ready");
}

// ES-модули не имеют document.currentScript — запускаем всегда один раз
if (!window.__appInitialized) {
  window.__appInitialized = true;
  initApp();
}

// --- авто-рефреш после успешных операций CRUD
(() => {
  if (window.__crudRefreshHookInstalled) return;
  window.__crudRefreshHookInstalled = true;

  let refreshTimer = null;
  const scheduleRefresh = (delay = 300) => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (typeof window.renderPortfolio === "function")
        window.renderPortfolio();
    }, delay);
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    try {
      const req = args[0];
      const url = String(typeof req === "string" ? req : req?.url || "");
      if (
        res.ok &&
        /\/(create-folder|rename|delete|upload-file)(\/|\?|$)/.test(url)
      ) {
        scheduleRefresh(300); // небольшая задержка, чтобы файл дописался
      }
    } catch {}
    return res;
  };
})();
