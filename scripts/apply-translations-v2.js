// ───────────────────────────────────────────────────────────────────────────
// scripts/apply-translations-v2.js
// Applies translations from i18n/en.todo.json back into JS (string literals &
// simple template literals) and HTML (text nodes and title|alt|placeholder|aria-label).
// Usage:
//   node scripts/apply-translations.js       # writes changes
//   node scripts/apply-translations.js --dry # only shows planned changes
// ───────────────────────────────────────────────────────────────────────────

import fs2 from "fs";
import path2 from "path";
import { parse as parse2 } from "acorn";
import { parse as parseHtml2, NodeType as NodeType2 } from "node-html-parser";

const DRY = process.argv.includes("--dry");
const ROOT2 = process.cwd();
const SRC_DIRS2 = ["."];
const JS_EXT2 = new Set([".js", ".mjs"]);
const HTML_EXT2 = new Set([".html", ".htm"]);
const IGNORE_DIRS2 = new Set([
  "node_modules",
  ".git",
  "uploads",
  "trash",
  "versions",
  "docs/swagger-ui-dist",
]);

const DICT_FILE = path2.join(ROOT2, "i18n", "en.todo.json");
if (!fs2.existsSync(DICT_FILE)) {
  console.error("Dictionary not found:", DICT_FILE);
  process.exit(1);
}
const DICT = JSON.parse(fs2.readFileSync(DICT_FILE, "utf-8"));
const REPLACEMENTS = Object.fromEntries(
  Object.entries(DICT).filter(
    ([, v]) => typeof v === "string" && v.trim() !== ""
  )
);
const HAS = Object.keys(REPLACEMENTS).length > 0;
if (!HAS) {
  console.log("No translations to apply (all values are empty).");
  process.exit(0);
}

function* walk2(dir) {
  for (const name of fs2.readdirSync(dir)) {
    const p = path2.join(dir, name);
    const st = fs2.statSync(p);
    if (st.isDirectory()) {
      if (!IGNORE_DIRS2.has(name)) yield* walk2(p);
    } else {
      yield p;
    }
  }
}

const RU_RE2 = /[\u0400-\u04FF]/;

function replaceJS(file, src) {
  let ast;
  try {
    ast = parse2(src, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });
  } catch (e) {
    ast = parse2(src, {
      ecmaVersion: "latest",
      sourceType: "script",
      locations: true,
    });
  }

  const edits = []; // {start,end,newRaw}

  function visit(node) {
    if (!node || typeof node !== "object") return;

    if (
      node.type === "Literal" &&
      typeof node.value === "string" &&
      RU_RE2.test(node.value)
    ) {
      const ru = node.value;
      const en = REPLACEMENTS[ru];
      if (en) {
        // preserve original quote style
        const raw = node.raw || JSON.stringify(ru);
        const quote = raw.startsWith("'")
          ? "'"
          : raw.startsWith('"')
          ? '"'
          : '"';
        const escaped = en.replace(new RegExp(quote, "g"), `\\${quote}`);
        const newRaw = quote + escaped + quote;
        edits.push({ start: node.start, end: node.end, newRaw });
      }
    }

    if (
      node.type === "TemplateLiteral" &&
      node.expressions.length === 0 &&
      node.quasis.length === 1
    ) {
      const ru = node.quasis[0].value.cooked ?? "";
      if (RU_RE2.test(ru)) {
        const en = REPLACEMENTS[ru];
        if (en) {
          const escaped = en.replace(/`/g, "\\`").replace(/\\/g, "\\\\");
          const newRaw = "`" + escaped + "`";
          edits.push({ start: node.start, end: node.end, newRaw });
        }
      }
    }

    for (const k in node) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object" && v.type) visit(v);
    }
  }

  visit(ast);
  if (!edits.length) return null;

  // Apply from the end to keep indices stable
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.newRaw + out.slice(e.end);
  }
  return out;
}

function replaceHTML(file, src) {
  const root = parseHtml2(src, { lowerCaseTagName: false, comment: true });
  let changed = false;

  function walk(node) {
    if (!node) return;

    if (node.nodeType === NodeType2.TEXT_NODE) {
      const txt = node.rawText;
      if (RU_RE2.test(txt) && REPLACEMENTS[txt.trim()]) {
        const en = REPLACEMENTS[txt.trim()];
        node.rawText = txt.replace(txt.trim(), en);
        changed = true;
      }
    }

    if (node.nodeType === NodeType2.ELEMENT_NODE) {
      const attrs = ["title", "alt", "placeholder", "aria-label"];
      for (const a of attrs) {
        const val = node.getAttribute?.(a);
        if (val && RU_RE2.test(val) && REPLACEMENTS[val]) {
          node.setAttribute(a, REPLACEMENTS[val]);
          changed = true;
        }
      }
    }

    node.childNodes?.forEach(walk);
  }

  walk(root);
  if (!changed) return null;
  return root.toString();
}

let touched = 0;
for (const base of SRC_DIRS2) {
  for (const file of walk2(path2.join(ROOT2, base))) {
    const ext = path2.extname(file).toLowerCase();
    if (!JS_EXT2.has(ext) && !HTML_EXT2.has(ext)) continue;

    const src = fs2.readFileSync(file, "utf-8");
    const next = JS_EXT2.has(ext)
      ? replaceJS(file, src)
      : replaceHTML(file, src);

    if (next && next !== src) {
      touched++;
      if (DRY) {
        console.log("[dry] would change:", path2.relative(ROOT2, file));
      } else {
        fs2.writeFileSync(file, next, "utf-8");
        console.log("changed:", path2.relative(ROOT2, file));
      }
    }
  }
}

console.log(
  DRY
    ? `Dry-run complete. Files to change: ${touched}`
    : `Applied. Files changed: ${touched}`
);
