//=======================================================
// portfolio.js
//=======================================================

(() => {
  const params = new URLSearchParams(window.location.search);
  const path = [];

  if (params.get("category")) path.push(params.get("category"));
  let i = 1;
  while (params.get("subcategory" + i)) {
    path.push(params.get("subcategory" + i));
    i++;
  }

  // Загружаем JSON
  fetch("/data/portfolio.json?_=" + Date.now(), { cache: "reload" })
    .then((res) => res.json())
    .then((data) => {
      let currentNode = { children: data };
      for (const segment of path) {
        const next = currentNode.children?.find(
          (item) => item.type === "folder" && item.name === segment
        );
        if (!next) {
          currentNode = null;
          break;
        }
        currentNode = next;
      }

      const pageTitle = document.getElementById("pageTitle");
      pageTitle.textContent = path.length
        ? path[path.length - 1].replace(/_/g, " ")
        : "Portfolio";

      const bcContainer = document.getElementById("breadcrumbs");
      if (path.length) {
        let bcLink = `portfolio.html`;
        bcContainer.innerHTML = `<a href="${bcLink}">Portfolio</a>`;
        let subLink = "";
        path.forEach((seg, idx) => {
          subLink +=
            idx === 0
              ? `?category=${encodeURIComponent(seg)}`
              : `&subcategory${idx}=${encodeURIComponent(seg)}`;
          const isLast = idx === path.length - 1;
          bcContainer.innerHTML += ` <span>›</span> <a href="portfolio.html${subLink}"${
            isLast ? ' class="active"' : ""
          }>${seg.replace(/_/g, " ")}</a>`;
        });
      }

      const container = document.getElementById("content");
      container.innerHTML = "";

      if (!currentNode) {
        container.textContent = "❌ Folder not found";
        return;
      }

      // === Галерея файлов ===
      const files = (currentNode.children || []).filter(
        (c) => c.type === "file"
      );
      if (files.length > 0) {
        const gallery = document.createElement("div");
        gallery.className = "gallery";

        files.forEach((fileNode) => {
          const file = fileNode.name;
          const ext = file.split(".").pop().toLowerCase();
          const filePath = `uploads/${path.join("/")}/${file}`;

          if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
            const img = document.createElement("img");
            img.src = filePath;
            img.alt = file;
            img.dataset.caption = file; // фикс: всегда сохраняем подпись

            img.onerror = function onErr() {
              // заменила
              img.onerror = null;
              img.src = "img/no-image.jpg";
            };

            gallery.appendChild(img);
          } else if (["mp4", "mov", "webm"].includes(ext)) {
            const video = document.createElement("video");
            video.src = filePath;
            video.controls = true;
            gallery.appendChild(video);
          }
        });

        container.appendChild(gallery);
      }

      // === Подкатегории ===
      const subs = (currentNode.children || []).filter(
        (c) => c.type === "folder"
      );
      if (subs.length > 0) {
        const list = document.createElement("div");
        list.className = "category-list";

        subs.forEach((subNode) => {
          const subPath = [...path, subNode.name];
          let previewFile = "";
          const firstFile = (subNode.children || []).find(
            (c) => c.type === "file"
          );
          if (firstFile) previewFile = firstFile.name;

          const imgPath = previewFile
            ? `uploads/${subPath.join("/")}/${previewFile}`
            : "img/no-image.jpg";

          let link = `portfolio.html?category=${encodeURIComponent(
            path[0] || subNode.name
          )}`;
          for (let k = 1; k < path.length; k++) {
            link += `&subcategory${k}=${encodeURIComponent(path[k])}`;
          }
          if (path.length) {
            link += `&subcategory${path.length}=${encodeURIComponent(
              subNode.name
            )}`;
          }

          const card = document.createElement("a");
          card.href = link;
          card.className = "category-card";

          const t = new Image();
          // заменила t.onload/t.onerror
          t.onload = () => {
            card.innerHTML = `
            <div class="card-image" style="background-image: url('${imgPath}')"></div>
            <div class="card-title">${subNode.name.replace(/_/g, " ")}</div>
          `;
            t.onload = t.onerror = null;
          };
          t.onerror = () => {
            card.innerHTML = `
            <div class="card-image" style="background-image: url('img/no-image.jpg')"></div>
            <div class="card-title">${subNode.name.replace(/_/g, " ")}</div>
          `;
            t.onload = t.onerror = null;
          };

          t.src = imgPath;

          list.appendChild(card);
        });

        container.appendChild(list);
      }
    })
    .catch((err) => console.error("Error loading JSON:", err));
})();

// ===== Media Lightbox =====
(() => {
  const lbRoot = document.getElementById("mediaLightbox");
  const lbStage = document.getElementById("mlbStage");
  const lbCaption = document.getElementById("mlbCaption");
  const lbCounter = document.getElementById("mlbCounter");
  const btnPrev = document.getElementById("mlbPrev");
  const btnNext = document.getElementById("mlbNext");
  const btnClose = document.getElementById("mlbClose");

  let items = [];
  let index = 0;
  let lastActive = null;
  let isOpen = false;

  function collectItems() {
    items = [];
    document.querySelectorAll(".media-thumb[data-media-src]").forEach((el) => {
      items.push({
        src: el.dataset.mediaSrc,
        type: el.dataset.mediaType || guessType(el.dataset.mediaSrc),
        caption: el.dataset.caption || el.getAttribute("aria-label") || "",
      });
    });

    if (items.length === 0) {
      document.querySelectorAll("#content img").forEach((img) => {
        const src = img.dataset.full || img.src;
        items.push({ src, type: "image", caption: img.alt || "" });
        img.classList.add("media-thumb");
        img.dataset.mediaSrc = src;
        img.dataset.mediaType = "image";
      });
    }
  }

  function guessType(url = "") {
    return /\.(mp4|mov|webm)$/i.test(url) ? "video" : "image";
  }

  function open(idx, fromEl) {
    if (isOpen) return;
    if (!items.length) collectItems();
    index = Math.max(0, Math.min(idx, items.length - 1));
    lastActive = fromEl || document.activeElement;

    render();
    document.body.classList.add("mlb-open");
    lbRoot.hidden = false;
    lbRoot.setAttribute("aria-hidden", "false");
    btnClose.focus();

    window.addEventListener("keydown", onKey);
    lbRoot.addEventListener("click", onBackdrop);
    attachSwipe(lbStage);

    isOpen = true;
  }

  function close() {
    if (!isOpen) return;
    pauseVideo();
    lbRoot.setAttribute("aria-hidden", "true");
    lbRoot.hidden = true;
    document.body.classList.remove("mlb-open");

    window.removeEventListener("keydown", onKey);
    lbRoot.removeEventListener("click", onBackdrop);
    detachSwipe(lbStage);

    if (lastActive && typeof lastActive.focus === "function") {
      try {
        lastActive.focus();
      } catch (e) {
        /* ignore */
      }
    }
    lastActive = null; // освобождаем ссылку на ранее активный элемент
    isOpen = false;

    items = [];
    index = 0;
  }

  function onKey(e) {
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  }

  function onBackdrop(e) {
    const onStage = e.target.closest(".mlb-stage, .mlb-btn");
    if (!onStage) close();
  }

  function next() {
    goTo(index + 1);
  }
  function prev() {
    goTo(index - 1);
  }

  function goTo(i) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    render(true);
  }

  function pauseVideo() {
    const v = lbStage.querySelector("video");
    if (v && !v.paused) v.pause();
  }

  function render(withFade) {
    const it = items[index];
    pauseVideo();
    lbStage.innerHTML = "";

    let node;
    if (it.type === "video") {
      node = document.createElement("video");
      node.src = it.src;
      node.controls = true;
      node.playsInline = true;
      node.preload = "metadata";
      node.style.maxWidth = "100%";
    } else {
      node = document.createElement("img");
      node.src = it.src;
      node.alt = it.caption || "";
      node.decoding = "async";
    }
    if (withFade) {
      node.style.opacity = "0";
      node.style.transition = "opacity .2s ease";
      requestAnimationFrame(() => (node.style.opacity = "1"));
    }

    lbStage.appendChild(node);
    lbCaption.textContent = it.caption || "";
    lbCounter.textContent = `${index + 1} / ${items.length}`;

    preloadNeighbors();
    btnPrev.style.display = btnNext.style.display =
      items.length > 1 ? "" : "none";
  }

  function preloadNeighbors() {
    const left = items[(index - 1 + items.length) % items.length];
    const right = items[(index + 1) % items.length];
    [left, right].forEach((it) => {
      if (it && it.type === "image") {
        const img = new Image();
        img.src = it.src;
      }
    });
  }

  // свайпы
  let touchX = null,
    touchY = null;
  function attachSwipe(el) {
    el.addEventListener("touchstart", onTs, { passive: true });
    el.addEventListener("touchend", onTe, { passive: true });
  }
  function detachSwipe(el) {
    el.removeEventListener("touchstart", onTs);
    el.removeEventListener("touchend", onTe);
  }
  function onTs(e) {
    const t = e.changedTouches[0];
    touchX = t.clientX;
    touchY = t.clientY;
  }
  function onTe(e) {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? next() : prev();
    }
  }

  // кнопки
  btnClose.addEventListener("click", close);
  btnNext.addEventListener("click", next);
  btnPrev.addEventListener("click", prev);

  // делегатор (глобальный флаг предотвращает дублирование)
  if (!window.__portfolio_mlb_delegate_installed) {
    document.addEventListener("click", (e) => {
      const t = e.target.closest(".media-thumb, #content img");
      if (!t) return;

      collectItems();
      const src =
        t.dataset.mediaSrc ||
        t.dataset.full ||
        (t.tagName === "IMG" ? t.src : "");
      const idx = items.findIndex((it) => it.src === src);
      open(idx >= 0 ? idx : 0, t);
    });
    window.__portfolio_mlb_delegate_installed = true;
  }

  // публичный хук
  window.openMediaLightbox = (idx = 0) => {
    collectItems();
    open(idx);
  };
})();
