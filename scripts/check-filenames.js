// check-filenames.js ---- Как запускать Скрипт (safety first)
//-----------------------------------------------------------------
/*  Открыть терминал в корне проекта.
Запустить:
1). node check-filenames.js — интерактивно.
2). node check-filenames.js --auto — автоматически применять все предложенные переименования (ОПАСНО — используй с осторожностью).
3). node check-filenames.js --dir=otherdir — сканировать другую папку (по желанию).

В выводе увидишь все проблемные файлы, например:
⚠️ В имени есть пробел/невидимый символ: "admin-portfolio .js"
--------------------------------------------------
Рекомендации по безопасности и использованию
--------------------------------------------------
- Не запускай от администратора / root — достаточно обычного пользователя.
- Перед массовым применением запусти сначала: node check-filenames.js (без --auto) и выбери вариант P (перфайл) или Y после просмотра.
- Резервная копия: скрипт сохраняет rename-backup-<ts>.json с картой переименований.
- Если есть CI / репозиторий — закоммить изменения в контролируемой среде (git) — будет ещё проще откатить.
- По желанию могу добавить --dry флаг, отдельный режим симуляции, или автоматический откатный скрипт, который читает rename-backup-*.json и откатывает.
*/

// check-filenames.js
// Node >= 14 (works both CJS/ESM runtimes). Run with: node check-filenames.js
// Options:
//   --auto        : apply changes without asking (use with care)
//   --dir=PATH    : target directory (default "js")
//   --ext=csv     : comma separated extensions (default "js,mjs,cjs,json,map")

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const argv = process.argv.slice(2);
const args = {};
argv.forEach(a => {
  if (a.startsWith("--dir=")) args.dir = a.split("=")[1];
  else if (a === "--auto") args.auto = true;
  else if (a.startsWith("--ext=")) args.ext = a.split("=")[1];
});

const TARGET_DIR = path.resolve(process.cwd(), args.dir || "js");
const ALLOWED_EXT = (args.ext || "js,mjs,cjs,json,map").split(",").map(s => s.trim().toLowerCase());
const IGNORE_DIRS = ["node_modules", ".git", ".github"];
const DRY_RUN = !args.auto;

function normalizeName(name) {
  // 1) trim spaces at ends, remove control/invisible chars
  // 2) replace sequences of spaces by single dash
  // 3) remove characters other than a-z0-9._- 
  // 4) collapse multiple dots to single dot (but keep extension)
  const trimmed = name.trim();
  const withoutControl = trimmed.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  // split name/ext
  const ext = path.extname(withoutControl);
  const base = path.basename(withoutControl, ext);
  // normalize base
  let nb = base.replace(/\s+/g, "-")        // spaces -> dash
               .normalize("NFKC")           // unicode normalization
               .replace(/[^\w\-\.]/g, "");  // remove other chars
  // collapse multiple dashes
  nb = nb.replace(/-+/g, "-");
  // lowercase
  nb = nb.toLowerCase();
  // extension to lower case and keep dot
  const ne = ext ? ext.toLowerCase() : "";
  return nb + ne;
}

function askQuestion(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(q, ans => { rl.close(); resolve(ans.trim()); }));
}

function collectFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // ignore hidden
    if (IGNORE_DIRS.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (e.isFile()) {
      const ext = path.extname(e.name).replace(/^\./, "").toLowerCase();
      if (ALLOWED_EXT.includes(ext)) {
        out.push({ dir, name: e.name, full });
      }
    }
  }
  return out;
}

(async () => {
  try {
    if (!fs.existsSync(TARGET_DIR)) {
      console.error(`❌ Target directory not found: ${TARGET_DIR}`);
      process.exit(1);
    }

    console.log(`🔎 Scanning: ${TARGET_DIR}`);
    const files = collectFiles(TARGET_DIR);
    if (!files.length) {
      console.log("ℹ️ No files found (matching extensions). Nothing to do.");
      process.exit(0);
    }

    const proposals = [];
    for (const f of files) {
      const normalized = normalizeName(f.name);
      if (normalized !== f.name) {
        proposals.push({ ...f, normalized });
      }
    }

    if (!proposals.length) {
      console.log("✅ No problematic filenames found.");
      process.exit(0);
    }

    console.log("\nProposed renames:");
    proposals.forEach((p, i) => {
      console.log(`${i+1}. ${path.relative(process.cwd(), p.full)}  →  ${p.normalized}`);
    });

    if (args.auto) {
      console.log("\n--auto flag present: applying changes without prompt.");
    } else {
      const answer = (await askQuestion("\nApply changes? (Y = yes all, P = per-file, N = no, C = cancel/dry-run): ")).toLowerCase();
      if (answer === "n" || answer === "c" || answer === "") {
        console.log("Aborted by user. No changes applied.");
        process.exit(0);
      }
      if (answer === "p") {
        // per-file loop
        const mapping = {};
        for (const p of proposals) {
          const rel = path.relative(process.cwd(), p.full);
          const a = (await askQuestion(`Rename "${rel}" → "${p.normalized}" ? (y/n): `)).toLowerCase();
          if (a === "y") {
            const newPath = path.join(p.dir, p.normalized);
            if (fs.existsSync(newPath)) {
              console.warn(`⚠️ Target exists, skipping: ${newPath}`);
              continue;
            }
            mapping[p.full] = newPath;
            // perform rename now (since user confirmed)
            fs.renameSync(p.full, newPath);
            console.log(`✅ Renamed: ${rel} → ${path.relative(process.cwd(), newPath)}`);
          } else {
            console.log(`⏭ Skipped: ${rel}`);
          }
        }
        // save backup map
        const ts = Date.now();
        fs.writeFileSync(path.join(process.cwd(), `rename-backup-${ts}.json`), JSON.stringify(mapping, null, 2), "utf-8");
        console.log("Done. Backup map saved.");
        process.exit(0);
      }
      // if Y -> fall through and apply all
    }

    // apply all (either --auto or user pressed Y)
    const applyMapping = {};
    for (const p of proposals) {
      const newPath = path.join(p.dir, p.normalized);
      if (fs.existsSync(newPath)) {
        console.warn(`⚠️ Target already exists, skipping: ${newPath}`);
        continue;
      }
      applyMapping[p.full] = newPath;
    }

    // show final mapping and ask to proceed (if not auto)
    if (!args.auto) {
      console.log("\nFinal changes to apply:");
      Object.entries(applyMapping).forEach(([from, to], i) => {
        console.log(`${i+1}. ${path.relative(process.cwd(), from)} -> ${path.relative(process.cwd(), to)}`);
      });
      const ok = (await askQuestion("\nProceed with these changes? (y/n): ")).toLowerCase();
      if (ok !== "y") {
        console.log("Aborted by user. No changes applied.");
        process.exit(0);
      }
    }

    // perform renames
    Object.entries(applyMapping).forEach(([from, to]) => {
      fs.renameSync(from, to);
      console.log(`✅ ${path.relative(process.cwd(), from)} -> ${path.relative(process.cwd(), to)}`);
    });

    // save mapping for rollback
    const ts = Date.now();
    fs.writeFileSync(path.join(process.cwd(), `rename-backup-${ts}.json`), JSON.stringify(applyMapping, null, 2), "utf-8");
    console.log(`\nDone. Backup mapping written to rename-backup-${ts}.json`);
    console.log("If something goes wrong, you can use that map to revert names.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
