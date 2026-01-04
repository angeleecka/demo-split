// Используем fileStructure из FileOperations.js
// Предполагается, что window.SVG_FOLDER_ICON доступен глобально

const treeContainer = document.getElementById("file-tree");

// ПКМ по дереву → используем общее контекстное меню из FileOperations.js
if (!window.__fmTreeCtxBound && treeContainer) {
  window.__fmTreeCtxBound = true;

  treeContainer.addEventListener(
    "contextmenu",
    (e) => {
      const li = e.target.closest(".tree-item.is-folder");
      if (!li) return;

      e.preventDefault();
      e.stopPropagation();

      // активная панель (чтобы CRUD работал “в контексте” активного окна)
      const activeId =
        (typeof window.getActiveListId === "function" &&
          window.getActiveListId()) ||
        (window.__fmState && window.__fmState.activePanel) ||
        "file-list-1";

      // готовим dataset как у элементов списка
      li.dataset.panel = activeId;
      li.dataset.type = "folder";

      // имя папки берём из data-path (последний сегмент)
      const fullPath = String(li.dataset.path || "").trim(); // например: Upload/Portrait/new
      const parts = fullPath.split("/").filter(Boolean);

      const name = parts[parts.length - 1] || "";
      li.dataset.name = name;

      // ВАЖНО: showContextMenu получает "текущий путь папки" (родителя),
      // а имя берёт из dataset.name.
      const parentPath = parts.length > 1 ? parts.slice(0, -1) : parts;

      if (typeof window.showContextMenu === "function") {
        window.showContextMenu(e, li, parentPath);
      }
    },
    true // capture — чтобы не конфликтовать с другими обработчиками
  );
}

// ✅ ИЗМЕНЕНО: Используем 'Portfolio' для консистентности с FileOperations.js
const ROOT_FOLDER_NAME = "Upload";

const META_KEYS = new Set(["type", "date", "size"]);

function hasSubfolders(node) {
  if (!node || typeof node !== "object") return false;
  return Object.entries(node).some(([k, v]) => {
    if (META_KEYS.has(k)) return false;
    return v && typeof v === "object" && v.type === "folder";
  });
}

/**
 * Форматирует сегмент пути:
 * 'Historical_portrait' -> 'Historical portrait'
 */
function formatPathSegment(segment) {
  if (!segment) return "";
  const withSpaces = segment.replace(/[_-]+/g, " ");
  // Капитализация первого символа
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Генерирует HTML для отображения подпапок
 * @param {object} folderContents - Содержимое текущей папки
 * @param {string[]} currentActivePath - Путь к папке, которую нужно выделить
 * @param {string[]} parentPath - Путь до текущего уровня
 * @returns {string} HTML-разметка для списка <ul>
 */
function buildTreeHTML(folderContents, currentActivePath, parentPath = []) {
  let html = '<ul class="tree-children">';

  // Сортируем: папки сначала
  const sortedEntries = Object.entries(folderContents).sort(
    ([nameA, itemA], [nameB, itemB]) => {
      if (itemA.type === "folder" && itemB.type !== "folder") return -1;
      if (itemA.type !== "folder" && itemB.type === "folder") return 1;
      return nameA.localeCompare(nameB);
    }
  );

  for (const [name, item] of sortedEntries) {
    // В дереве отображаем ТОЛЬКО папки
    if (item.type !== "folder") continue;

    const currentPath = [...parentPath, name];
    const isSelected =
      JSON.stringify(currentActivePath) === JSON.stringify(currentPath);

    // ✅ ИЗМЕНЕНИЕ: Проверяем, есть ли вложенные папки/файлы
    const hasChildren = hasSubfolders(item);

    // Класс 'expanded' будем добавлять/убирать кликом, но пока ставим его по умолчанию
    // Класс 'is-collapsible' нужен, чтобы показать, что это папка, которую можно раскрыть
    const itemClass = `tree-item is-folder expanded ${
      isSelected ? "selected" : ""
    } ${hasChildren ? "is-collapsible" : ""}`;

    // Получаем SVG-иконки (Предполагаем, что вы добавили SVG_CHEVRON_ICON в FileOperations.js)
    const folderIcon =
      window.SVG_FOLDER_ICON || '<i class="icon folder-icon"></i>';
    // Нам нужна иконка-шеврона (треугольник)
    const chevronIcon =
      window.SVG_CHEVRON_ICON || '<i class="icon chevron-icon"></i>';

    html += `<li class="${itemClass}" data-path="${currentPath.join("/")}">`;

    // ✅ ИЗМЕНЕНИЕ: Вставляем иконку-шеврона
    html += `<span class="folder-name-wrapper">
                <span class="chevron-toggle ${
                  hasChildren ? "" : "empty-space"
                }">
                    ${hasChildren ? chevronIcon : ""}
                </span>
                <span class="folder-name">
                    ${folderIcon} ${formatPathSegment(name)}
                </span>
             </span>`;

    // Рекурсивный вызов для вложенных папок
    if (hasChildren) {
      html += buildTreeHTML(item, currentActivePath, currentPath);
    }

    html += "</li>";
  }

  html += "</ul>";
  return html;
}

/**
 * Инициализирует и рендерит дерево папок
 * @param {object} structure - Полная структура данных
 * @param {string[]} activePath - Текущий активный путь для выделения
 */
function renderFileTree(structure, activePath) {
  // Нормализуем путь: менеджер может жить с "Portfolio", а дерево — с "Upload"
  const normalizeTreePath = (p) => {
    const arr = Array.isArray(p)
      ? [...p]
      : String(p || "")
          .split("/")
          .filter(Boolean);
    if (!arr.length) return [ROOT_FOLDER_NAME];
    if (arr[0] === "Portfolio") arr[0] = ROOT_FOLDER_NAME;
    return arr;
  };

  const activePathNorm = normalizeTreePath(activePath);

  // ✅ ИЗМЕНЕНО: Проверка на ROOT_FOLDER_NAME
  if (!structure[ROOT_FOLDER_NAME]) {
    treeContainer.innerHTML = `<div>Ошибка: Папка ${ROOT_FOLDER_NAME} не найдена.</div>`;
    return;
  }

  // ❗ ИСПРАВЛЕНИЕ ОШИБКИ: Объявляем переменную folderIcon здесь
  const folderIcon =
    window.SVG_FOLDER_ICON || '<i class="icon folder-icon"></i>';

  // Начальный корневой элемент 'Portfolio'
  const rootPath = [ROOT_FOLDER_NAME];
  const isRootSelected =
    JSON.stringify(activePathNorm) === JSON.stringify(rootPath);

  const hasChildren = hasSubfolders(structure[ROOT_FOLDER_NAME]);
  const chevronIcon =
    window.SVG_CHEVRON_ICON || '<i class="icon chevron-icon"></i>';

  let html = `<ul class="tree-root">`;
  html += `<li class="tree-item is-folder expanded ${
    isRootSelected ? "selected" : ""
  } ${hasChildren ? "is-collapsible" : ""}" data-path="${ROOT_FOLDER_NAME}">`;

  // ✅ ИСПРАВЛЕНИЕ: Добавляем wrapper и chevron
  html += `<span class="folder-name-wrapper">
                <span class="chevron-toggle ${
                  hasChildren ? "" : "empty-space"
                }">
                ${hasChildren ? chevronIcon : ""}
                </span>

                <span class="folder-name">
                    ${folderIcon} Portfolio/ 
                </span>
             </span>`; // <-- Отображаем "Portfolio/"

  // Рендерим вложенные элементы
  html += buildTreeHTML(structure[ROOT_FOLDER_NAME], activePathNorm, rootPath);

  html += `</li></ul>`;
  treeContainer.innerHTML = html;

  // Назначаем обработчики кликов
  treeContainer.querySelectorAll(".folder-name").forEach((el) => {
    el.addEventListener("click", (e) => {
      const pathStr = e.currentTarget.closest(".tree-item").dataset.path;
      const newPath = pathStr.split("/");

      // Выбираем, в какое окно идти: в активное
      const targetPanelId =
        typeof window.getActiveListId === "function"
          ? window.getActiveListId()
          : "file-list-1"; // на всякий случай дефолт

      // Используем глобальную функцию перехода из FileOperations.js
      window.navigateToFolder(newPath, targetPanelId);

      // ✅ Mobile: после перехода закрываем левую off-canvas панель
      const explorer = document.querySelector(".admin-explorer");
      if (explorer && window.matchMedia("(max-width: 900px)").matches) {
        explorer.classList.remove("is-open");
      }

      // Сброс всех выделений и выделение нового
      /*treeContainer
        .querySelectorAll(".tree-item")
        .forEach((item) => item.classList.remove("selected"));
      e.currentTarget.closest(".tree-item").classList.add("selected");*/
    });
  });

  // ✅ ДОБАВЛЕНИЕ: Обработчик для сворачивания/разворачивания
  treeContainer
    .querySelectorAll(".chevron-toggle:not(.empty-space)")
    .forEach((el) => {
      el.addEventListener("click", (e) => {
        const treeItem = e.currentTarget.closest(".tree-item");

        // Предотвращаем срабатывание клика по родителю (если бы он был)
        e.stopPropagation();

        // Переключаем класс 'expanded' на элементе <li>
        treeItem.classList.toggle("expanded");
      });
    });
}
