// server.js (ESM)
import express from "express";
import multer from "multer";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import chokidar from "chokidar";
import { fileURLToPath } from "url";

import { generatePortfolioJson } from "./scripts/generatePortfolioJson.js";

export const JSON_PATH = path.join(process.cwd(), "data", "portfolio.json");

// ─────────────────────────────────────────────────────────────
// Корректный __dirname для ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Пути проекта
const ROOT_DIR = __dirname;
const UPLOADS_DIR = path.join(__dirname, "uploads");
const TRASH_DIR = path.join(__dirname, "trash");

// Пробуем загрузить Swagger спецификацию (если нет — просто отключим /api-docs)
const swaggerPath = path.join(__dirname, "docs", "swagger.json");
let swaggerDocument = null;
try {
  swaggerDocument = JSON.parse(fs.readFileSync(swaggerPath, "utf-8"));
} catch (e) {
  console.warn(
    "Swagger file not found or invalid JSON at",
    swaggerPath,
    "- API docs will be disabled.",
    e.message
  );
  swaggerDocument = null;
}

const app = express();
const PORT = process.env.PORT || 4000;
// dev-only: отключить кэш для html/js/css
if (process.env.NODE_ENV !== "production") {
  app.set("etag", false);
  app.use((req, res, next) => {
    if (/\.(?:html|js|css)$/.test(req.path)) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    next();
  });
}

// ─────────────────────────────────────────────────────────────
// Базовые middleware (ОДИН раз)
app.use(
  cors({
    origin: "*", // Разрешаем всем (для этапа разработки это проще всего)
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ⛔️ Бан-лист: защищаем служебные файлы и каталоги
// ВАЖНО: этот middleware должен быть ПЕРЕД express.static(...)
const deny = [
  /^\/server\.js$/i,
  /^\/config\.js$/i,
  /^\/package(-lock)?\.json$/i,
  /^\/(check-filenames|clean-portfolio|regen|generatePortfolioJson)\.js$/i,
  /^\/(trash|versions|scripts|node_modules)\//i,
  /^\/(trash|versions|scripts|node_modules|logs)\//i,
];

app.use((req, res, next) => {
  if (deny.some((rx) => rx.test(req.path))) return res.status(404).end();
  next();
});

// Если Swagger выключен, не “светим” сырой /docs/swagger.json
if (process.env.SWAGGER_ENABLED !== "1") {
  app.use((req, res, next) => {
    if (/^\/docs\//i.test(req.path)) return res.status(404).end();
    next();
  });
}

// 🔐 Swagger только по флагу (оставляем в демо)
if (process.env.SWAGGER_ENABLED === "1" && swaggerDocument) {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      explorer: true,
      customSiteTitle: "Portfolio API Docs (Demo)",
    })
  );
  console.log("[swagger] /api-docs enabled");
} else {
  console.log("[swagger] disabled");
}

// ⚙️ Раздача статики (после бан-листа)
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "1h" }));
app.use(express.static(ROOT_DIR, { dotfiles: "ignore", maxAge: "1h" }));

// ─────────────────────────────────────────────────────────────
// Гарантируем наличие директорий uploads/trash
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log("📁 'uploads' folder created");
}
if (!fs.existsSync(TRASH_DIR)) {
  fs.mkdirSync(TRASH_DIR, { recursive: true });
  console.log("📁 'trash' folder created");
}

try {
  const watcher = chokidar.watch(UPLOADS_DIR, {
    ignored: /(^|[\/\\])\../, // игнор dot-файлов
    ignoreInitial: true,
    persistent: true,
    depth: 6,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on("add", (p) =>
    generatePortfolioJson().catch((err) => console.error("Error on add:", err))
  );
  watcher.on("addDir", (p) =>
    generatePortfolioJson().catch((err) =>
      console.error("Error on addDir:", err)
    )
  );
  watcher.on("change", (p) =>
    generatePortfolioJson().catch((err) =>
      console.error("Error on change:", err)
    )
  );
  watcher.on("unlink", (p) =>
    generatePortfolioJson().catch((err) =>
      console.error("Error on unlink:", err)
    )
  );
  watcher.on("unlinkDir", (p) =>
    generatePortfolioJson().catch((err) =>
      console.error("Error on unlinkDir:", err)
    )
  );
  watcher.on("error", (err) => console.error("Watcher error:", err));

  console.log(
    "Watcher started on uploads/ — filesystem changes will auto-update portfolio.json"
  );
} catch (e) {
  console.warn("Failed to start chokidar watcher:", e);
}

// ─────────────────────────────────────────────────────────────
// Отдаём data/portfolio.json без кеша (клиент всегда получает свежий JSON)
app.get("/data/portfolio.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  const jsonPath = path.join(ROOT_DIR, "data", "portfolio.json");
  fs.stat(jsonPath, (err) => {
    if (err) return res.status(204).end(); // нет файла — 204 No Content
    res.sendFile(jsonPath, (e) => {
      if (e) {
        console.error("Error sending portfolio.json:", e);
        res.status(500).end();
      }
    });
  });
});

// === helpers ===
function safeJoin(base, targetRel = "") {
  const target = targetRel ? path.join(base, targetRel) : base;
  const resolved = path.normalize(target);
  const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;
  if (resolved !== base && !resolved.startsWith(baseWithSep)) {
    throw new Error("Invalid path");
  }
  return resolved;
}
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// === Windows-like name guard (for demo parity with Explorer) ===
// Forbidden characters: \ / : * ? " < > |
const WIN_FORBIDDEN_NAME_RE = /[\\\/\:\*\?"\<\>\|]/;

function getPathSegments(rel) {
  return (rel || "").toString().replace(/^\/+/, "").split("/").filter(Boolean);
}

function validateWinNameSegment(seg, { kind } = {}) {
  const s = (seg || "").toString().trim();
  if (!s) return { ok: false, error: "Empty name" };
  if (s === "." || s === "..") return { ok: false, error: "Invalid name" };
  if (WIN_FORBIDDEN_NAME_RE.test(s)) {
    return { ok: false, error: 'Forbidden characters: \\ / : * ? " < > |' };
  }
  if (kind === "folder" && s.includes(".")) {
    return { ok: false, error: "Folder name cannot contain dot (.)" };
  }
  if (kind === "file" && s.startsWith(".")) {
    return { ok: false, error: "File name cannot start with dot (.)" };
  }
  return { ok: true, value: s };
}

function validateRelPathSegments(rel) {
  const segs = getPathSegments(rel);
  if (!segs.length) return { ok: false, error: "Path is empty" };
  for (const s of segs) {
    if (s === "." || s === "..")
      return { ok: false, error: "Invalid path segment" };
    if (WIN_FORBIDDEN_NAME_RE.test(s)) {
      return { ok: false, error: 'Forbidden characters: \\ / : * ? " < > |' };
    }
  }
  return { ok: true, segments: segs };
}

async function waitJsonStable(filePath, attempts = 6, delayMs = 150) {
  for (let i = 0; i < attempts; i++) {
    try {
      const txt = await fsp.readFile(filePath, "utf8");
      JSON.parse(txt);
      return true; // ок
    } catch (e) {
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(Math.round(delayMs * 1.6), 1500);
    }
  }
  return false; // не дождались — не критично, просто вернёмся
}

// === multer storage & API (safe, совместимо) ===

const ALLOWED_MIME =
  /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|x-msvideo|x-matroska))$/;

function sanitize(name) {
  // нормализуем unicode, удаляем опасные символы, ограничиваем длину
  let safe = name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "_");
  if (!safe.includes(".")) safe += ".bin";
  return safe.slice(0, 120);
}

async function uniquePath(p) {
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  let i = 0,
    cand = p;
  while (fs.existsSync(cand)) {
    i++;
    cand = path.join(dir, `${base}__${i}${ext}`);
  }
  return cand;
}

// временно кладём в корень uploads, потом переносим в целевую папку по body.folderPath
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}_${sanitize(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 30 }, // 8MB, максимум 30 файлов
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.test(file.mimetype))
      return cb(new Error("Unsupported file type"));
    cb(null, true);
  },
});

// === API ===

// создать папку
app.post("/create-folder", async (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath || typeof folderPath !== "string") {
      return res.status(400).send("folderPath is mandatory/required");
    }

    // Windows-like name restrictions (demo parity)
    const folderRel = folderPath.toString().replace(/^\/+/, "");
    const segCheck = validateRelPathSegments(folderRel);
    if (!segCheck.ok) {
      return res.status(400).json({ success: false, error: segCheck.error });
    }
    const folderName = segCheck.segments[segCheck.segments.length - 1];
    const nameCheck = validateWinNameSegment(folderName, { kind: "folder" });
    if (!nameCheck.ok) {
      return res.status(400).json({ success: false, error: nameCheck.error });
    }
    const full = safeJoin(UPLOADS_DIR, folderRel);

    ensureDir(full);

    await generatePortfolioJson();
    await waitJsonStable(JSON_PATH);

    // дождаться, что data/portfolio.json уже полностью записан и парсится
    await waitJsonStable(JSON_PATH); // ← используем константу
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      success: false,
      error: "Failed to create folder",
      code: e?.code || null,
      message: e?.message || String(e),
    });
  }
});

// загрузить файл (поле формы 'file' + body.folderPath)
app.post("/upload-file", (req, res) => {
  upload.single("file")(req, res, async function (err) {
    try {
      if (err) {
        console.error(err);
        return res.status(400).send(err.message || "Upload error");
      }
      if (!req.file) return res.status(400).send("File not received");

      const folderPath = (req.body.folderPath || "")
        .toString()
        .replace(/^\/+/, "");
      const targetDir = safeJoin(UPLOADS_DIR, folderPath);
      ensureDir(targetDir);

      const originalName = sanitize(req.file.originalname);
      const targetPath = await uniquePath(path.join(targetDir, originalName));

      await fsp.rename(req.file.path, targetPath);

      console.log(`✅ Загружен файл: ${originalName}`);
      console.log(`📂 Папка назначения: ${folderPath || "(root)"}`);

      await generatePortfolioJson();
      await waitJsonStable(JSON_PATH);

      return res.json({
        success: true,
        filename: path.basename(targetPath),
        path: path.relative(UPLOADS_DIR, targetPath),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).send("Error moving file");
    }
  });
});

// переименовать
app.post(["/api/rename", "/rename"], async (req, res) => {
  try {
    const { oldPath, newPath } = req.body || {};
    if (!oldPath || !newPath) {
      return res
        .status(400)
        .json({ success: false, error: "oldPath and newPath are required" });
    }

    // Windows-like name restrictions (demo parity)
    const oldRel = oldPath.toString().replace(/^\/+/, "");
    const newRel = newPath.toString().replace(/^\/+/, "");

    const oldCheck = validateRelPathSegments(oldRel);
    if (!oldCheck.ok) {
      return res.status(400).json({ success: false, error: oldCheck.error });
    }

    const newCheck = validateRelPathSegments(newRel);
    if (!newCheck.ok) {
      return res.status(400).json({ success: false, error: newCheck.error });
    }

    const from = safeJoin(UPLOADS_DIR, oldRel);
    const to = safeJoin(UPLOADS_DIR, newRel);

    // Determine source type to apply dot-rule (folder vs file)
    const isDir = fs.existsSync(from) && fs.statSync(from).isDirectory();
    const newLast = newCheck.segments[newCheck.segments.length - 1];
    const nameCheck = validateWinNameSegment(newLast, {
      kind: isDir ? "folder" : "file",
    });
    if (!nameCheck.ok) {
      return res.status(400).json({ success: false, error: nameCheck.error });
    }

    if (!fs.existsSync(from)) {
      return res
        .status(404)
        .json({ success: false, error: "Source not found", oldPath, newPath });
    }

    ensureDir(path.dirname(to));
    const finalDest = await uniquePath(to);

    try {
      await fsp.rename(from, finalDest);
    } catch (e) {
      // ⚠️ Windows/locks/watcher: иногда папку нельзя "rename", но можно copy+remove
      const isDir = fs.existsSync(from) && fs.statSync(from).isDirectory();
      const code = e?.code;

      console.error("[/rename] rename failed:", {
        oldPath,
        newPath,
        from,
        finalDest,
        code,
        message: e?.message,
      });

      if (isDir && (code === "EPERM" || code === "EACCES")) {
        // fallback: копируем директорию и удаляем исходник
        await fsp.cp(from, finalDest, { recursive: true });
        await fsp.rm(from, { recursive: true, force: true });
      } else {
        throw e;
      }
    }

    await generatePortfolioJson();
    await waitJsonStable(JSON_PATH);

    return res.json({
      success: true,
      newPath: path.relative(UPLOADS_DIR, finalDest),
    });
  } catch (e) {
    console.error("[/rename] exception:", {
      code: e?.code,
      message: e?.message,
      stack: e?.stack,
    });
    return res.status(500).json({
      success: false,
      error: e?.message || "Failed to rename",
      code: e?.code || null,
    });
  }
});

// удалить (в корзину) + метаданные для восстановления
app.post(["/api/delete", "/delete"], async (req, res) => {
  try {
    const { targetPath } = req.body || {};

    console.log("[/delete] incoming targetPath:", targetPath);

    if (!targetPath) {
      console.warn("[/delete] targetPath is missing in body");
      return res.status(400).send("targetPath is required");
    }

    const full = safeJoin(UPLOADS_DIR, targetPath);
    console.log("[/delete] resolved full path:", full);

    if (!fs.existsSync(full)) {
      console.warn("[/delete] path not found on disk:", full);
      return res.status(404).send("Not found");
    }

    const baseName = path.basename(full);
    ensureDir(TRASH_DIR);

    let trashFilePath = path.join(TRASH_DIR, baseName);
    trashFilePath = await uniquePath(trashFilePath);

    try {
      await fsp.rename(full, trashFilePath);
    } catch (e) {
      const code = e?.code;
      const isDir = fs.existsSync(full) && fs.statSync(full).isDirectory();

      console.error("[/delete] rename failed:", {
        targetPath,
        full,
        trashFilePath,
        code,
        message: e?.message,
      });

      // Windows иногда не дает rename папок/файлов (EPERM/EACCES) — делаем fallback
      if (code === "EPERM" || code === "EACCES") {
        if (isDir) {
          await fsp.cp(full, trashFilePath, { recursive: true });
          await fsp.rm(full, { recursive: true, force: true });
        } else {
          await fsp.copyFile(full, trashFilePath);
          await fsp.unlink(full);
        }
      } else {
        throw e;
      }
    }

    const meta = { oldDir: path.dirname(full), originalName: baseName };
    await fsp.writeFile(trashFilePath + ".json", JSON.stringify(meta));

    await generatePortfolioJson();
    console.log("[/delete] OK, moved to trash:", trashFilePath);
    await waitJsonStable(JSON_PATH);

    return res.json({ success: true, targetPath });
  } catch (e) {
    console.error("[/delete] exception:", e);
    return res.status(500).json({
      success: false,
      error: "Failed to delete",
      code: e?.code || null,
      message: e?.message || String(e),
    });
  }
});

// восстановить
app.post("/restore", async (req, res) => {
  try {
    const { targetPath } = req.body || {};
    if (!targetPath) return res.status(400).send("targetPath is required");

    const base = path.basename(targetPath);
    let trashFilePath = path.join(TRASH_DIR, base);

    if (!fs.existsSync(trashFilePath)) {
      const files = await fsp.readdir(TRASH_DIR);
      const cand = files.find((f) => f === base || f.startsWith(base + "__"));
      if (!cand)
        return res.status(404).send("File not found in trash/recycle bin");
      trashFilePath = path.join(TRASH_DIR, cand);
    }

    const metadataPath = trashFilePath + ".json";
    if (!fs.existsSync(metadataPath))
      return res.status(404).send("Metadata not found");

    const { oldDir, originalName } = JSON.parse(
      await fsp.readFile(metadataPath, "utf-8")
    );
    ensureDir(oldDir);

    const dest = await uniquePath(path.join(oldDir, originalName));
    await fsp.rename(trashFilePath, dest);
    await fsp.unlink(metadataPath);

    await generatePortfolioJson();
    await waitJsonStable(JSON_PATH);

    return res.json({
      success: true,
      restoredPath: path.relative(UPLOADS_DIR, dest),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      success: false,
      error: "Failed to restore",
      code: e?.code || null,
      message: e?.message || String(e),
    });
  }
});

// очистка корзины
app.post("/clear-trash", async (req, res) => {
  try {
    ensureDir(TRASH_DIR);
    const files = await fsp.readdir(TRASH_DIR);
    await Promise.all(
      files.map(async (name) => {
        const p = path.join(TRASH_DIR, name);
        const s = await fsp.stat(p);
        if (s.isFile()) await fsp.unlink(p);
      })
    );
    return res.json({ success: true, message: "Trash/Recycle Bin cleared" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      success: false,
      error: "Failed to clear trash/recycle bin",
      code: e?.code || null,
      message: e?.message || String(e),
    });
  }
});

// ручной rebuild
app.post("/save", async (req, res) => {
  try {
    await generatePortfolioJson();
    await waitJsonStable(JSON_PATH);

    return res.json({ success: true });
  } catch (e) {
    console.error("generatePortfolioJson failed:", e);
    return res.status(500).json({
      success: false,
      error: "Failed to regenerate JSON",
      code: e?.code || null,
      message: e?.message || String(e),
    });
  }
});

const LOGS_DIR = path.join(process.cwd(), "logs");
const CLIENT_LOG_FILE = path.join(LOGS_DIR, "client-errors.log");

// анти-спам в памяти
const _errRate = new Map(); // key -> lastTs
const ERR_COOLDOWN_MS = 5000; // 5 секунд
const MAX_FIELD_LEN = 10000; // чтобы не улетало мегабайтами
const ROTATE_BYTES = 5 * 1024 * 1024; // 5 MB

async function ensureLogsDir() {
  await fsp.mkdir(LOGS_DIR, { recursive: true });
}

function clip(v, max = MAX_FIELD_LEN) {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max) + "…(clipped)" : s;
}

async function rotateIfNeeded() {
  try {
    const st = await fsp.stat(CLIENT_LOG_FILE);
    if (st.size < ROTATE_BYTES) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rotated = path.join(LOGS_DIR, `client-errors.${stamp}.log`);
    await fsp.rename(CLIENT_LOG_FILE, rotated);
  } catch {
    // файла ещё нет — ок
  }
}

// сам роут
app.post("/log-error", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "unknown";
    const body = req.body || {};

    // нормализуем + режем слишком большие поля
    const payload = {
      type: clip(body.type),
      message: clip(body.message),
      stack: clip(body.stack),
      filename: clip(body.filename),
      lineno: body.lineno ?? null,
      colno: body.colno ?? null,
      href: clip(body.href),
      ua: clip(body.ua),
      time: clip(body.time) || new Date().toISOString(),
      ip,
    };

    // анти-спам
    const key = `${ip}|${payload.type}|${payload.message}|${
      payload.filename || ""
    }|${payload.lineno || ""}`;
    const now = Date.now();
    const last = _errRate.get(key) || 0;
    if (now - last < ERR_COOLDOWN_MS) {
      return res.json({ ok: true, skipped: true });
    }
    _errRate.set(key, now);

    // запись в файл
    await ensureLogsDir();
    await rotateIfNeeded();
    await fsp.appendFile(
      CLIENT_LOG_FILE,
      JSON.stringify(payload) + "\n",
      "utf8"
    );

    // можно оставить краткий лог в консоль (не обязателен)
    console.warn("[client-error]", payload.type, payload.message);

    return res.json({ ok: true });
  } catch (e) {
    console.error("[client-error] failed:", e);
    return res.status(500).json({ ok: false });
  }
});

// Глобальный ловец ошибок Multer/валидаторов
app.use((err, req, res, next) => {
  if (err)
    return res
      .status(400)
      .json({ success: false, error: err.message || "Upload error" });
  next();
});

// стартуем сервер
app.listen(PORT, async () => {
  console.log(`✅ Admin server running at http://localhost:${PORT}`);

  if (process.env.SWAGGER_ENABLED === "1" && swaggerDocument) {
    console.log(`📑 Swagger docs: http://localhost:${PORT}/api-docs`);
  }

  try {
    await generatePortfolioJson();
    await waitJsonStable(JSON_PATH);

    console.log("📂 portfolio.json synced with 'uploads' folder");
  } catch (err) {
    console.error("Error during primary JSON generation:", err);
  }
});
