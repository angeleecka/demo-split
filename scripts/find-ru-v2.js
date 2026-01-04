// ───────────────────────────────────────────────────────────────────────────
// scripts/find-ru.js  (v2)
// Extracts ONLY user‑visible Russian texts (ignores comments), from JS & HTML.
// Outputs:
//   i18n/en.todo.json          → { "Русская строка": "" }
//   i18n/ru.occurrences.json   → where each string appears
// Usage:  node scripts/find-ru.js
// Requires:  npm i -D acorn node-html-parser
// ───────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { parse } from "acorn";
import { parse as parseHtml, NodeType } from "node-html-parser";

const ROOT = process.cwd();
const SRC_DIRS = ["."]; // scan current project
const OUT_DIR = path.join(ROOT, "i18n");
const OUT_EN = path.join(OUT_DIR, "en.todo.json");
const OUT_OCC = path.join(OUT_DIR, "ru.occurrences.json");

const JS_EXT = new Set([".js", ".mjs"]);
const HTML_EXT = new Set([".html", ".htm"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "uploads",
  "trash",
  "versions",
  "docs/swagger-ui-dist",
]);
const RU_RE = /[\u0400-\u04FF]/; // Cyrillic block

/** Walk FS */
function* walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(name)) yield* walk(p);
    } else {
      yield p;
    }
  }
}

function collectFromJS(code, file) {
  const found = [];
  let ast;
  try {
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });
  } catch (e) {
    // Try script mode
    ast = parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      locations: true,
    });
  }

  function visit(node) {
    if (!node || typeof node !== "object") return;

    // StringLiteral: { type: 'Literal', value: '...', raw: '"..."' }
    if (node.type === "Literal" && typeof node.value === "string") {
      const text = node.value;
      if (RU_RE.test(text)) {
        found.push({
          text,
          file,
          line: node.loc.start.line,
          column: node.loc.start.column,
          kind: "js:string",
        });
      }
    }

    // TemplateLiteral with NO expressions: `...`
    if (
      node.type === "TemplateLiteral" &&
      node.expressions.length === 0 &&
      node.quasis.length === 1
    ) {
      const text = node.quasis[0].value.cooked ?? "";
      if (RU_RE.test(text)) {
        found.push({
          text,
          file,
          line: node.loc.start.line,
          column: node.loc.start.column,
          kind: "js:template",
        });
      }
    }

    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object" && v.type) visit(v);
    }
  }
  visit(ast);
  return found;
}

function collectFromHTML(code, file) {
  const root = parseHtml(code, { lowerCaseTagName: false, comment: true });
  const found = [];

  function walkHtml(node) {
    if (!node) return;

    // text nodes
    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = (node.rawText || "").replace(/\s+/g, " ").trim();
      if (text && RU_RE.test(text)) {
        found.push({
          text,
          file,
          line: node.range ? node.range[0] : 0,
          column: 0,
          kind: "html:text",
        });
      }
    }

    // attributes we care about
    const EL_ATTRS = ["title", "alt", "placeholder", "aria-label"];
    if (node.nodeType === NodeType.ELEMENT_NODE) {
      for (const a of EL_ATTRS) {
        const val = node.getAttribute?.(a);
        if (val && RU_RE.test(val)) {
          found.push({
            text: val,
            file,
            line: 0,
            column: 0,
            kind: `html:attr:${a}`,
          });
        }
      }
    }

    node.childNodes?.forEach(walkHtml);
  }

  walkHtml(root);
  return found;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const occurrences = new Map(); // text → [{file,line,column,kind}]

for (const base of SRC_DIRS) {
  for (const file of walk(path.join(ROOT, base))) {
    const ext = path.extname(file).toLowerCase();
    if (!JS_EXT.has(ext) && !HTML_EXT.has(ext)) continue;

    const code = fs.readFileSync(file, "utf-8");
    const list = JS_EXT.has(ext)
      ? collectFromJS(code, file)
      : collectFromHTML(code, file);

    for (const item of list) {
      const key = item.text;
      const arr = occurrences.get(key) || [];
      arr.push({
        file: path.relative(ROOT, item.file),
        line: item.line,
        column: item.column,
        kind: item.kind,
      });
      occurrences.set(key, arr);
    }
  }
}

// Build en.todo.json (empty values for translator)
const dict = {};
[...occurrences.keys()]
  .sort((a, b) => a.localeCompare(b, "ru"))
  .forEach((k) => {
    dict[k] = "";
  });

ensureDir(OUT_DIR);
fs.writeFileSync(OUT_EN, JSON.stringify(dict, null, 2), "utf-8");
fs.writeFileSync(
  OUT_OCC,
  JSON.stringify(Object.fromEntries(occurrences), null, 2),
  "utf-8"
);

console.log(`Extracted ${Object.keys(dict).length} unique Russian strings.`);
console.log(`→ ${path.relative(ROOT, OUT_EN)}`);
console.log(`→ ${path.relative(ROOT, OUT_OCC)}`);
