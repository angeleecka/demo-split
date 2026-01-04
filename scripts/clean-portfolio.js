// clean-portfolio.js
const fs = require("fs");
const path = require("path");

const jsonPath     = path.join(__dirname, "data", "portfolio.json");
const uploadsRoot  = path.join(__dirname, "uploads");

// ───────── helpers ─────────
const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir  = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function cleanNodes(nodes, segments = [], stats, logs) {
  const result = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node.name !== "string" || !node.name.trim()) {
      stats.removedUnknown++;
      logs.push(`✖ пропущена пустая/битая запись: ${JSON.stringify(node)}`);
      continue;
    }

    if (node.type === "folder") {
      const folderPath = path.join(uploadsRoot, ...segments, node.name);
      if (!isDir(folderPath)) {
        stats.removedFolders++;
        logs.push(`✖ нет папки на диске → удаляю из JSON: ${path.join(...segments, node.name)}/`);
        continue;
      }
      const cleanedChildren = cleanNodes(node.children || [], [...segments, node.name], stats, logs);
      result.push({ ...node, children: cleanedChildren });
    } else if (node.type === "file") {
      const filePath = path.join(uploadsRoot, ...segments, node.name);
      if (!isFile(filePath)) {
        stats.removedFiles++;
        logs.push(`✖ нет файла на диске → удаляю из JSON: ${path.join(...segments, node.name)}`);
        continue;
      }
      result.push(node);
    } else {
      stats.removedUnknown++;
      logs.push(`✖ неизвестный type "${node.type}" → удаляю: ${path.join(...segments, node.name)}`);
    }
  }
  return result;
}

function cleanPortfolio() {
  if (!fs.existsSync(jsonPath)) {
    console.error("❌ JSON file not found:", jsonPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf-8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("❌ JSON parsing error:", e.message);
    process.exit(1);
  }

  const stats = { removedFolders: 0, removedFiles: 0, removedUnknown: 0 };
  const logs  = [];

  const beforeCount = JSON.stringify(data).length; // грубая метрика объёма
  const cleaned = cleanNodes(data, [], stats, logs);
  const afterCount  = JSON.stringify(cleaned).length;

  // бэкап
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = jsonPath.replace(/\.json$/, `.backup-${ts}.json`);
  fs.copyFileSync(jsonPath, backupPath);

  // запись
  fs.writeFileSync(jsonPath, JSON.stringify(cleaned, null, 2), "utf-8");

  // отчёт
  console.log("─".repeat(60));
  console.log("✅ JSON cleaned and saved:", jsonPath);
  console.log("🗂 Backup:", backupPath);
  console.log(`📉 Удалено: папок ${stats.removedFolders}, файлов ${stats.removedFiles}, прочее ${stats.removedUnknown}`);
  console.log(`↔️ Размер JSON (символов): было ${beforeCount}, стало ${afterCount}`);
  if (logs.length) {
    console.log("— details —");
    logs.forEach(l => console.log(l));
  }
  console.log("─".repeat(60));
}

cleanPortfolio();

/* Асинхронный вариант ===============

const fs = require("fs").promises;
const path = require("path");

async function cleanPortfolio() {
  // Проверка существования файла
  try {
    await fs.access(jsonPath);
  } catch {
    console.error("❌ JSON-файл не найден:", jsonPath);
    process.exit(1);
  }

  // Чтение JSON
  let raw;
  try {
    raw = await fs.readFile(jsonPath, "utf-8");
  } catch (e) {
    console.error("❌ Ошибка чтения JSON:", e.message);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("❌ Ошибка парсинга JSON:", e.message);
    process.exit(1);
  }

  const stats = { removedFolders: 0, removedFiles: 0, removedUnknown: 0 };
  const logs = [];

  const beforeCount = JSON.stringify(data).length; // грубая метрика объёма
  const cleaned = cleanNodes(data, [], stats, logs);
  const afterCount = JSON.stringify(cleaned).length;

  // Создание бэкапа
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = jsonPath.replace(/\.json$/, `.backup-${ts}.json`);
  try {
    await fs.copyFile(jsonPath, backupPath);
  } catch (e) {
    console.error("❌ Ошибка создания бэкапа:", e.message);
    process.exit(1);
  }

  // Запись очищенного JSON
  try {
    await fs.writeFile(jsonPath, JSON.stringify(cleaned, null, 2), "utf-8");
  } catch (e) {
    console.error("❌ Ошибка записи JSON:", e.message);
    process.exit(1);
  }

  // Отчёт
  console.log("─".repeat(60));
  console.log("✅ JSON очищен и сохранён:", jsonPath);
  console.log("🗂 Бэкап:", backupPath);
  console.log(`📉 Удалено: папок ${stats.removedFolders}, файлов ${stats.removedFiles}, прочее ${stats.removedUnknown}`);
  console.log(`↔️ Размер JSON (символов): было ${beforeCount}, стало ${afterCount}`);
  if (logs.length) {
    console.log("— детали —");
    logs.forEach(l => console.log(l));
  }
  console.log("─".repeat(60));
}
*/