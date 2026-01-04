// admin-actions.js (ИСПРАВЛЕННАЯ ВЕРСИЯ для нового файлового менеджера)

const API_BASE_URL = "https://demo-split-backend.onrender.com";
// Замени на реальный адрес, когда создашь новый сервис на Render

/**
 * Получает текущий путь из активной панели файлового менеджера
 * ВАЖНО: Теперь использует window.getActivePath() из FileOperations.js
 */
function getCurrentPath() {
  try {
    // 1) Берем ID активной панели (file-list-1 / file-list-2)
    const activeId =
      (typeof window.getActiveListId === "function" &&
        window.getActiveListId()) ||
      (window.__fmState && window.__fmState.activePanel) ||
      "file-list-1";

    // 2) Пробуем взять путь прямо из DOM (его пишет navigateToFolder)
    const listEl = document.getElementById(activeId);
    const domPath = (
      listEl && listEl.dataset && listEl.dataset.path ? listEl.dataset.path : ""
    ).trim();

    console.log("[getCurrentPath] activeId:", activeId, "domPath:", domPath);

    if (domPath) return domPath;

    // 3) Фоллбек: берём путь из FileOperations.js (уже БЕЗ Upload/Portfolio)
    if (typeof window.getActivePath === "function") {
      const arr = window.getActivePath();
      console.log("[getCurrentPath] getActivePath():", arr);

      if (Array.isArray(arr) && arr.length) return arr.join("/");
    }
  } catch (e) {
    console.warn("[getCurrentPath] error:", e);
  }

  return "";
}

window.getCurrentPath = getCurrentPath;

function toServerRelPath(pathValue) {
  let p = String(pathValue ?? "").trim();

  // убираем внешние слэши
  p = p.replace(/^\/+/, "").replace(/\/+$/, "");

  // ✅ удаляем только ПЕРВЫЙ СЕГМЕНТ, если это ровно Upload/Uploads/Portfolio (регистр не важен)
  // важно: (?:\/|$) — значит "сегмент закончился", а не просто начинается похоже
  p = p.replace(/^(?:upload|uploads|portfolio)(?:\/|$)/i, "");

  // нормализуем слэши ещё раз
  p = p.replace(/^\/+/, "").replace(/\/+$/, "");

  return p;
}

/**
 * Обработка ответа сервера с автоматическим обновлением интерфейса
 */
async function handleResponse(res) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let data = null;
  let text = "";

  try {
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      text = await res.text();
    }
  } catch (e) {
    console.error("[handleResponse] parse failed:", e);
  }

  // унифицированное "ок"
  const ok = Boolean(data?.ok ?? data?.success ?? res.ok);

  // унифицированное сообщение
  const msg =
    data?.message ||
    data?.error ||
    (text && text.trim()) ||
    (ok ? "Operation completed" : "Operation error");

  // Show toasts only for errors (success is too noisy and can be duplicated)
  if (!ok && typeof showToast === "function") {
    showToast(msg, "error");
  }

  // ✅ авто-refresh только на успех
  if (ok && typeof window.refreshFileManager === "function") {
    console.log("[handleResponse] Вызов refreshFileManager");
    await window.refreshFileManager();
  }

  // возвращаем объект в одном формате
  return data || { ok, message: msg };
}

window.handleResponse = handleResponse;

// ============================================================================
// CRUD ОПЕРАЦИИ
// ============================================================================

/**
 * СОЗДАТЬ ПАПКУ
 */
async function createFolder(name) {
  const trimmedName = (name || "").trim();
  if (!trimmedName) {
    if (typeof showToast === "function")
      showToast("Enter the folder name", "warning");
    return false;
  }

  try {
    const activeId =
      (typeof window.getActiveListId === "function" &&
        window.getActiveListId()) ||
      "file-list-1";

    const otherId = activeId === "file-list-1" ? "file-list-2" : "file-list-1";

    const activeDomPath =
      document.getElementById(activeId)?.dataset?.path?.trim() || "";
    const otherDomPath =
      document.getElementById(otherId)?.dataset?.path?.trim() || "";

    // корень считается валидным состоянием (Portfolio или Upload)
    const activeIsRoot = /^(portfolio|upload)\/?$/i.test(
      activeDomPath.replace(/\/+$/, "")
    );

    let basePath = toServerRelPath(activeDomPath);

    // ✅ фоллбэк ТОЛЬКО если путь НЕ корень и реально пустой
    if (!basePath && !activeIsRoot) {
      const otherBase = toServerRelPath(otherDomPath);
      if (otherBase) basePath = otherBase;
    }

    const folderPath = basePath ? `${basePath}/${trimmedName}` : trimmedName;

    console.log("[createFolder][debug]", {
      activeId,
      activeDomPath,
      activeIsRoot,
      chosenBasePath: basePath,
      folderPath,
    });

    const res = await fetch(`${API_BASE_URL}/create-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath }),
    });

    const data = await handleResponse(res);
    return data?.ok ?? res.ok;
  } catch (err) {
    console.error("[createFolder] Ошибка:", err);
    if (typeof showToast === "function")
      showToast("Error creating folder", "error");
    return false;
  }
}

window.createFolder = createFolder;

/**
 * ЗАГРУЗИТЬ ФАЙЛ
 */
async function uploadFile(file) {
  if (!file) {
    if (typeof showToast === "function") {
      showToast("No file selected", "warning");
    }
    return false;
  }

  const formData = new FormData();

  // 1) Получаем путь из активной панели.
  // ⚠️ Важно отличать "корень" от "не смогли определить путь".
  const activeId =
    (typeof window.getActiveListId === "function" &&
      window.getActiveListId()) ||
    window.__fmState?.activePanel ||
    "file-list-1";

  const otherId = activeId === "file-list-1" ? "file-list-2" : "file-list-1";
  const activeDomPath = (
    document.getElementById(activeId)?.dataset?.path || ""
  ).trim();
  const otherDomPath = (
    document.getElementById(otherId)?.dataset?.path || ""
  ).trim();

  const activeIsRoot = ["portfolio", "upload"].includes(
    activeDomPath.toLowerCase()
  );
  let basePath = toServerRelPath(activeDomPath);

  // Фоллбек только если путь *не определился*, а не потому что мы в корне.
  if (!basePath && !activeIsRoot) {
    const otherBase = toServerRelPath(otherDomPath);
    if (otherBase) {
      console.warn(
        "[uploadFile] basePath empty (not root), I take the path from another panel:",
        { activeId, activeDomPath, otherId, otherDomPath, otherBase }
      );
      basePath = otherBase;
    }
  }

  console.log("[uploadFile] activeId:", activeId);
  console.log("[uploadFile] activeDomPath:", activeDomPath);
  console.log("[uploadFile] folderPath(basePath):", basePath);

  formData.append("folderPath", basePath); // "" = корень uploads/
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE_URL}/upload-file`, {
      method: "POST",
      body: formData,
    });

    const result = await handleResponse(res);

    // Очищаем input при успехе
    if (result && result.ok) {
      const input = document.getElementById("fileInput");
      if (input) input.value = "";
      return true;
    }

    return false;
  } catch (err) {
    console.error("[uploadFile] Error:", err);
    if (typeof showToast === "function") {
      showToast(`Download error: ${err.message}`, "error");
    }
    return false;
  }
}

window.uploadFile = uploadFile;

/**
 * ПЕРЕИМЕНОВАТЬ
 */
async function renameItem(oldName, newName, basePathOverride = undefined) {
  if (!oldName || !newName) {
    if (typeof showToast === "function") {
      showToast("Please indicate your old and new name", "warning");
    }
    return false;
  }

  // Автоматическое добавление расширения для файлов
  const lastDotIndex = oldName.lastIndexOf(".");
  if (lastDotIndex > 0) {
    const oldExt = oldName.substring(lastDotIndex + 1);
    if (newName.indexOf(".") === -1) newName += "." + oldExt;
  }

  // basePathOverride приходит строкой из FileOperations.initializeRename()
  const rawBase =
    typeof basePathOverride === "string" ? basePathOverride : getCurrentPath();
  const basePath = toServerRelPath(rawBase);

  // targetPath здесь не нужен, и раньше был баг: name не определён
  const oldPath = basePath ? `${basePath}/${oldName}` : oldName;
  const newPath = basePath ? `${basePath}/${newName}` : newName;

  try {
    const res = await fetch(`${API_BASE_URL}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPath, newPath }),
    });

    const result = await handleResponse(res);
    return !!(result && result.ok);
  } catch (err) {
    console.error("[renameItem] Error:", err);
    if (typeof showToast === "function") {
      showToast(`Renaming error: ${err.message}`, "error");
    }
    return false;
  }
}

window.renameItem = renameItem;

/**
 * УДАЛИТЬ
 */
let lastDeletedItem = null;

async function deleteItem(name, options = {}) {
  const { basePathOverride, skipConfirm } = options || {};

  if (!name) {
    if (typeof showToast === "function") {
      showToast("Specify a name to delete", "warning");
    }
    return false;
  }

  // 1. Получаем базовый путь (учитываем basePathOverride)
  const rawBase =
    typeof basePathOverride === "string" ? basePathOverride : getCurrentPath();
  const basePath = toServerRelPath(rawBase);
  const targetPath = basePath ? `${basePath}/${name}` : name;

  console.log("[deleteItem] name:", name);
  console.log("[deleteItem] basePath:", basePath);
  console.log("[deleteItem] targetPath:", targetPath);

  // 3. Подтверждение (кастомная модалка, если доступна)

  let confirmed = true;

  if (!skipConfirm) {
    confirmed = confirm(`Delete "${name}"?\nThis action cannot be undone.`);
    if (!confirmed) {
      showToast?.("Deletion cancelled", "info");
      return false;
    }
  }

  if (!confirmed) {
    if (typeof showToast === "function")
      showToast("Deletion cancelled", "info");
    return false;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPath }),
    });

    // ВАЖНО: Проверяем статус ДО вызова handleResponse
    if (!res.ok) {
      const errorText = await res.text();
      console.error("[deleteItem] Server error:", res.status, errorText);

      if (typeof showToast === "function") {
        showToast(`Error deleting: ${errorText || res.statusText}`, "error");
      }
      return false;
    }

    // Вызываем handleResponse для обновления UI
    const result = await handleResponse(res);

    // Сохраняем информацию для восстановления
    if (result && result.ok) {
      lastDeletedItem = { name, path: targetPath };

      const inputDelete = document.getElementById("deleteName");
      if (inputDelete) inputDelete.value = "";

      if (typeof window.selectedFileName !== "undefined") {
        window.selectedFileName = null;
      }

      // Показываем toast с кнопкой отмены
      if (typeof showToast === "function") {
        showToast(`"${name}" deleted`, "warning", "Cancel", restoreItem, 7000);
      }

      return true;
    }

    return false;
  } catch (err) {
    console.error("[deleteItem] Error:", err);
    if (typeof showToast === "function") {
      showToast(`Error deleting: ${err.message}`, "error");
    }
    return false;
  }
}

window.deleteItem = deleteItem;

/**
 * ВОССТАНОВИТЬ
 */
async function restoreItem() {
  if (!lastDeletedItem) {
    if (typeof showToast === "function") {
      showToast("There are no items to recover", "info");
    }
    return false;
  }

  console.log("[restoreItem] Recovery:", lastDeletedItem);

  try {
    const res = await fetch(`${API_BASE_URL}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPath: lastDeletedItem.path }),
    });

    const result = await handleResponse(res);

    if (result && result.ok) {
      if (typeof showToast === "function") {
        showToast(`"${lastDeletedItem.name}" restored`, "success");
      }
      lastDeletedItem = null;
      return true;
    }

    return false;
  } catch (err) {
    console.error("[restoreItem] Error:", err);
    if (typeof showToast === "function") {
      showToast(`Recovery error: ${err.message}`, "error");
    }
    return false;
  }
}

window.restoreItem = restoreItem;

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Загрузить файл в конкретную папку (для DnD)
 */
async function uploadFileTo(file, folderPath) {
  const formData = new FormData();

  // folderPath уже должен включать "Upload/" если нужно
  formData.append("folderPath", folderPath);
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE_URL}/upload-file`, {
      method: "POST",
      body: formData,
    });

    return await handleResponse(res);
  } catch (err) {
    console.error("[uploadFileTo] Error:", err);
    if (typeof showToast === "function") {
      showToast(`Loading error: ${err.message}`, "error");
    }
    return false;
  }
}

window.uploadFileTo = uploadFileTo;
