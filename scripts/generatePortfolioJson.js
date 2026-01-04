//generatePortfolioJson.js

import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve();
const UPLOADS_DIR = path.join(ROOT, "uploads");
const DATA_DIR = path.join(ROOT, "data");
const OUTPUT_FILE = path.join(DATA_DIR, "portfolio.json");

// имена файлов/папок, которые нужно игнорировать (нижний регистр)
const IGNORE_FILES = new Set([".ds_store", "thumbs.db", ".gitkeep"]);
/*
  Для директорий допустимы:
   - точные имена: "tmp", "trash"
   - с точкой: ".tmp"
   - префиксы/суффиксы, например "tmp-" или "-tmp"
  Здесь можно расширить правило под свои нужды.
*/
const IGNORE_DIR_PATTERNS = [
  "tmp",      // точное совпадение
  ".tmp",     // скрытая
  "_tmp", 
  "trash",
  "temp",     // "temp" тоже
];

// включаем игнор скрытых папок (начинающихся с '.')
const IGNORE_HIDDEN_DIRS = true;

// Проверка директорий
function isIgnoredDir(name) {
  if (!name) return false;
  const lower = name.toLowerCase();

  if (IGNORE_HIDDEN_DIRS && lower.startsWith(".")) return true;

  for (const p of IGNORE_DIR_PATTERNS) {
    const lp = p.toLowerCase();
    if (lp === lower) return true;               // точное совпадение
    if (lower.startsWith(lp + "-")) return true; // tmp-*
    if (lower.endsWith("-" + lp)) return true;   // *-tmp
  }
  return false;
}

async function walkDir(dir, relBase = "") {
  let result = [];
  let entries;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.error("Error reading folder:", dir, err);
    return result;
  }

  for (const entry of entries) {
    // игнор по имени файла
    if (entry.isFile() && IGNORE_FILES.has(entry.name.toLowerCase())) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(relBase, entry.name);

    try {
      if (entry.isSymbolicLink()) {
        console.log(`Пропускаем симлинк: ${relPath}`);
        continue;
      }
    } catch (e) {
      console.warn("Failed to check symlink:", fullPath, e);
    }

    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) {
        console.log(`Пропускаем директорию (ignore): ${relPath}`);
        continue;
      }

      const children = await walkDir(fullPath, relPath);
      result.push({
        type: "folder",
        name: entry.name,
        path: relPath,
        children,
      });
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        result.push({
          type: "file",
          name: entry.name,
          path: relPath,
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch (err) {
        console.error("Error reading file:", fullPath, err);
      }
    } else {
      console.log(`Пропускаем неизвестный тип узла: ${relPath}`);
    }
  }

  return result;
}

export async function generatePortfolioJson() {
  try {
    console.log("Starting portfolio.json generation — reading:", UPLOADS_DIR);
    const tree = await walkDir(UPLOADS_DIR);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(tree, null, 2), "utf-8");
    console.log("✅ portfolio.json updated:", OUTPUT_FILE);
  } catch (err) {
    console.error("JSON generation error:", err);
  }
}
