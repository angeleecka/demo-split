// \src\modules\dnd\index.js

import { on } from "../../core/eventBus.js";
import { API } from "../../schemas/api.js";
import { EVENTS } from "../../schemas/events.js";

let cfg = { renameUrl: API.renameUrl, uploadUrl: API.uploadUrl };
export let isDragging = false;

const TYPE = "application/x-admin-dnd";

const hasFiles = (e) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
const hasAdminPayload = (e) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(TYPE);

function payloadFromEvent(e) {
  try {
    const raw =
      e.dataTransfer.getData(TYPE) || e.dataTransfer.getData("text/plain");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function markDragging(items, on) {
  document
    .querySelectorAll("#content .js-file")
    .forEach((n) => n.classList.remove("dragging"));
  if (on) items.forEach((n) => n.classList.add("dragging"));
}

export async function moveItems(items, targetPath) {
  for (const it of items) {
    const base =
      (typeof window.getCurrentPath === "function"
        ? window.getCurrentPath()
        : "") || "";
    const oldPath = base ? `${base}/${it.name}` : it.name;
    const newPath = targetPath ? `${targetPath}/${it.name}` : it.name;

    console.log(`[moveItems] Moving: ${oldPath} → ${newPath}`);

    const res = await fetch(`${window.API_BASE_URL}${cfg.renameUrl}`, {
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

async function uploadFilesTo(path, files) {
  for (const f of files) {
    const form = new FormData();
    form.append("folderPath", path || "");
    form.append("file", f);
    const res = await fetch(`${window.API_BASE_URL}${cfg.uploadUrl}`, {
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

function bindDraggables(root) {
  root.querySelectorAll(".js-file").forEach((el) => {
    if (el.dataset.dnd === "1") return;
    el.dataset.dnd = "1";
    el.setAttribute("draggable", "true");
    el.style.webkitUserDrag = "element";
    el.addEventListener("dragstart", (e) => {
      isDragging = true;

      const selectedFiles = Array.from(
        document.querySelectorAll("#content .js-file.selected")
      );
      const pack = selectedFiles.length ? selectedFiles : [el];

      const payload = {
        sourcePath:
          (typeof getCurrentPath === "function" ? getCurrentPath() : "") || "",
        items: pack.map((n) => ({ name: n.dataset.name, type: "file" })),
      };

      // console.log("[dragstart] Payload:", payload);

      e.dataTransfer.setData(TYPE, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        "text/plain",

        payload.items.map((i) => i.name).join(",")
      );
      e.dataTransfer.setData("text/html", "");
      markDragging(pack, true);
    });

    el.addEventListener("dragend", () => {
      markDragging([], false);
      isDragging = false;
    });
  });
}

function bindFolderDraggables(root) {
  root.querySelectorAll(".category-card").forEach((folderEl) => {
    if (folderEl.dataset.dnd === "1") return;
    folderEl.dataset.dnd = "1";
    folderEl.setAttribute("draggable", "true");

    folderEl.addEventListener("dragstart", (e) => {
      const selected = Array.from(
        document.querySelectorAll(
          "#content .js-file.selected, #content .category-card.selected"
        )
      );
      const pack = selected.length ? selected : [folderEl];

      const payload = {
        sourcePath:
          (typeof getCurrentPath === "function" ? getCurrentPath() : "") || "",
        items: pack
          .map((n) => ({
            name: n.dataset.name,
            type: n.classList.contains("category-card") ? "folder" : "file",
          }))
          .filter((it) => !!it.name),
      };

      const txt = JSON.stringify(payload);
      e.dataTransfer.setData("application/x-admin-dnd", txt);
      e.dataTransfer.setData("text/plain", txt); // для Chrome
      e.dataTransfer.effectAllowed = "move";

      // подсветка — достаточно файлов
      document
        .querySelectorAll("#content .js-file")
        .forEach((n) => n.classList.remove("dragging"));
      document
        .querySelectorAll("#content .js-file.selected")
        .forEach((n) => n.classList.add("dragging"));
    });

    folderEl.addEventListener("dragend", () => {
      document
        .querySelectorAll("#content .js-file")
        .forEach((n) => n.classList.remove("dragging"));
    });
  });
}

function bindFolderDrops(root) {
  root.querySelectorAll(".category-card").forEach((card) => {
    if (card.dataset.droptarget === "1") return;
    card.dataset.droptarget = "1";

    card.addEventListener(
      "click",
      (e) => {
        // Блокируем навигацию ТОЛЬКО во время drag
        if (card.classList.contains("drop-target")) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      },
      true
    );

    const allow = (e) => {
      // console.log("[dragover] Over folder:", card.dataset.name);
      e.preventDefault();
      e.stopPropagation();
      card.classList.add("drop-target");
      e.dataTransfer.dropEffect = hasFiles(e) ? "copy" : "move";
    };

    // Убираем href во время drag
    card.addEventListener("dragenter", allow, true);

    card.addEventListener("dragover", allow, true);

    // Восстанавливаем href
    card.addEventListener("dragleave", () => {
      card.classList.remove("drop-target");
      if (card.dataset.originalHref) {
        card.href = card.dataset.originalHref;
        delete card.dataset.originalHref;
      }
    });

    card.addEventListener(
      "drop",
      async (e) => {
        // 1. СНАЧАЛА блокируем браузер
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // 2. ПОТОМ логируем
        //  console.log("[drop] RAW EVENT FIRED!");

        // 3. ПОТОМ чистим UI
        card.classList.remove("drop-target");

        const folderName =
          card.dataset?.name ||
          card.querySelector(".card-title")?.textContent?.trim();
        if (!folderName) return;

        const base =
          (typeof window.getCurrentPath === "function"
            ? window.getCurrentPath()
            : "") || "";
        const targetPath = base ? `${base}/${folderName}` : folderName;

        const skipSelf = new Set([folderName]);

        // ДЕБАГ
        console.log("[DnD:drop] EVENT:", {
          folderName,
          targetPath,
          hasFiles: hasFiles(e),
          hasPayload: hasAdminPayload(e),
          dataTransferTypes: Array.from(e.dataTransfer.types),
          selectedElements: Array.from(
            document.querySelectorAll(
              "#content .js-file.selected, #content .category-card.selected"
            )
          ).map((n) => n.dataset.name),
        });

        try {
          // 1) ПРИОРИТЕТ: выделенные элементы (если это НЕ внешний дроп)
          if (!hasFiles(e)) {
            const selectedEls = Array.from(
              document.querySelectorAll(
                "#content .js-file.selected, #content .category-card.selected"
              )
            );

            const items = selectedEls
              .map((el) => ({
                name: el.dataset.name,
                kind: el.classList.contains("category-card")
                  ? "folder"
                  : "file",
              }))
              .filter((it) => !!it.name)
              .filter(
                (it) => !(it.kind === "folder" && it.name === folderName)
              );

            console.log("[DnD:drop] Selected items to move:", items);
            // --- защита: не переносим в саму себя / в своего потомка
            const base0 =
              (typeof getCurrentPath === "function" ? getCurrentPath() : "") ||
              "";
            const itemsSafe = items.filter((it) => {
              const oldPath = base0 ? `${base0}/${it.name}` : it.name;
              if (targetPath === oldPath) return false; // та же папка/тот же путь
              if (targetPath.startsWith(oldPath + "/")) return false; // перенос папки в её подпапку
              return true;
            });
            if (itemsSafe.length !== items.length) {
              console.warn(
                "[DnD:drop] skipped",
                items.length - itemsSafe.length,
                "invalid self/descendant move(s)"
              );
            }

            if (itemsSafe.length) {
              await moveItems(itemsSafe, targetPath);
              if (typeof window.renderPortfolio === "function")
                await window.renderPortfolio();
              if (typeof window.showToast === "function")
                window.showToast(
                  `Moved ${itemsSafe.length} item(s) → ${folderName}`,
                  "success"
                );
            }
            return;
          }

          // 2) FALLBACK: payload от dragstart (если выделения нет)
          if (hasAdminPayload(e) && !hasFiles(e)) {
            const data = payloadFromEvent(e);
            console.log("[DnD:drop] Payload data:", data);

            const items = (data?.items || [])
              .map((it) => ({ name: it.name, kind: "file" }))
              .filter((it) => !!it.name);

            const base0 =
              (typeof getCurrentPath === "function" ? getCurrentPath() : "") ||
              "";
            const itemsSafe = items.filter((it) => {
              const oldPath = data?.sourcePath
                ? `${data.sourcePath}/${it.name}`
                : it.name;
              if (targetPath === oldPath) return false;
              if (targetPath.startsWith(oldPath + "/")) return false;
              return true;
            });

            if (itemsSafe.length) {
              await moveItems(itemsSafe, targetPath);
              if (typeof window.renderPortfolio === "function")
                await window.renderPortfolio();
              if (typeof window.showToast === "function")
                window.showToast(
                  `Moved ${itemsSafe.length} item(s) → ${folderName}`,
                  "success"
                );
              return;
            }
          }

          // 3) Внешние файлы из проводника (РАБОТАЕТ, НЕ ТРОГАЕМ)
          if (hasFiles(e)) {
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) {
              await uploadFilesTo(targetPath, files);
              if (typeof window.showToast === "function")
                window.showToast(
                  `Uploaded ${files.length} file(s) → ${folderName}`,
                  "success"
                );
              if (typeof window.renderPortfolio === "function")
                await window.renderPortfolio();
            }
          }
        } catch (err) {
          console.error("DnD drop error:", err);
          if (typeof window.showToast === "function")
            window.showToast("Operation failed", "error");
        }
      },
      true
    );
  });
}

function bindGridExternalDrop(grid) {
  if (!grid || grid.dataset.gridDrop === "1") return;
  grid.dataset.gridDrop = "1";

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
    const base =
      (typeof window.getCurrentPath === "function"
        ? window.getCurrentPath()
        : "") || "";
    try {
      await uploadFilesTo(base, files);
      if (typeof window.showToast === "function")
        window.showToast(`Uploaded ${files.length} file(s)`, "success");
    } catch (err) {
      console.error("DnD upload error:", err);
      if (typeof window.showToast === "function")
        window.showToast("Upload failed", "error");
    } finally {
      if (typeof window.renderPortfolio === "function")
        await window.renderPortfolio();
    }
  });
}

export function init(config = {}) {
  cfg = { ...cfg, ...config };

  const bindAll = () => {
    const grid = document.getElementById("content");
    if (!grid) return;
    bindDraggables(grid);
    bindFolderDraggables(grid);
    bindFolderDrops(grid);
    bindGridExternalDrop(grid);
    // маленький лог для проверки в Chrome:
    const f = grid.querySelectorAll(".js-file").length;
    const d = grid.querySelectorAll(".category-card").length;
    console.log(`[dnd] bound: files=${f}, folders=${d}`);
  };

  // слушаем обе формы события (на случай рассинхрона)
  on("gallery:rendered", bindAll);
  on(EVENTS?.GALLERY_RENDERED || "gallery:rendered", bindAll);

  // и сразу пробуем привязаться к уже существующему DOM
  // (в Chrome это часто решает проблему гонки)
  requestAnimationFrame(bindAll);
}
// export { init, isDragging, moveItems };
