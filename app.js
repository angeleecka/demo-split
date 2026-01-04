// app.js (Node + Express)

const express = require("express");
const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");

// Импортируем функцию генерации JSON
const { generatePortfolioJson } = require("./generatePortfolioJson.js");

const app = express();

// Раздаём статические файлы (CSS, картинки и т.д.)
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/data", express.static(path.join(__dirname, "data")));

// Автоматическая версия CSS (mtime = время изменения файла)
app.locals.cssVersion = fs
  .statSync(path.join(__dirname, "public/css/contacts.css"))
  .mtime.getTime();

// Рендер через EJS (или Pug/Handlebars, если используешь другой движок)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.get("/", (req, res) => {
  res.render("index"); // index.ejs
});

// --- Первая генерация JSON при старте ---
(async () => {
  try {
    console.log("🔄 Initial generation of portfolio.json...");
    await generatePortfolioJson();
  } catch (err) {
    console.error("❌ Error during initial JSON generation:", err);
  }
})();

// --- Вотчер для папки с файлами ---
const watcher = chokidar.watch(path.join(__dirname, "uploads"), {
  ignoreInitial: true,
  persistent: true,
});

watcher.on("all", async (event, filePath) => {
  console.log(`📂 Изменение в uploads: ${event} ${filePath}`);
  try {
    await generatePortfolioJson();
    console.log("✅ portfolio.json updated automatically");
  } catch (err) {
    console.error("❌ Error updating JSON:", err);
  }
});

app.listen(3000, () =>
  console.log("🚀 Server running on http://localhost:3000")
);
