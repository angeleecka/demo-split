// js/header.js
(() => {
  if (window.__headerInitDone) return;
  window.__headerInitDone = true;

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      const headerEl = document.querySelector("#header");
      if (!headerEl) return;

      // Админка помечена <main class="admin-body">, а не на <body>
      const isAdmin = !!document.querySelector("main.admin-body");
      // sticky отключаем в админке или если стоит data-no-sticky на #header
      const skipSticky = isAdmin || headerEl.hasAttribute("data-no-sticky");

      // ── 1) Липкий хедер (включаем только если НЕ запрещён) ───────────────
      if (!skipSticky) {
        const heroEl = document.querySelector("#hero");
        const triggerEl = document.querySelector("#sticky-trigger");
        const mode = heroEl ? "hero" : triggerEl ? "trigger" : "solid";

        const setStickyOn = () => headerEl.classList.add("sticky", "visible");
        const setStickyOff = () => {
          headerEl.classList.remove("visible");
          headerEl.addEventListener(
            "transitionend",
            () => {
              if (!headerEl.classList.contains("visible")) {
                headerEl.classList.remove("sticky");
              }
            },
            { once: true }
          );
        };

        if (mode === "hero" || mode === "trigger") {
          const observed = mode === "hero" ? heroEl : triggerEl;
          if (observed) {
            const io = new IntersectionObserver(
              (entries) => {
                entries.forEach((entry) => {
                  if (!entry.isIntersecting) setStickyOn();
                  else setStickyOff();
                });
              },
              { threshold: 0, rootMargin: "0px" }
            );
            io.observe(observed);
          }
          // На случай перезагрузки с прокруткой
          requestAnimationFrame(() => {
            if (
              mode === "hero" &&
              window.scrollY > (heroEl?.offsetHeight || 0)
            ) {
              setStickyOn();
            }
            if (mode === "trigger" && triggerEl) {
              const top =
                triggerEl.getBoundingClientRect().top + window.scrollY;
              if (window.scrollY > top) setStickyOn();
            }
          });
        } else {
          // solid: липкий сразу, «компактность» после небольшой прокрутки
          setStickyOn();
          window.addEventListener(
            "scroll",
            () => {
              headerEl.classList.toggle("scrolled", window.scrollY > 10);
            },
            { passive: true }
          );
        }
      }

      // ── 2) Мобильное меню (бургер) — ВСЕГДА активно ─────────────────────
      const navToggle = headerEl.querySelector(".nav-toggle");
      const navMenu = headerEl.querySelector("nav");

      if (navToggle && navMenu) {
        navToggle.addEventListener("click", (evt) => {
          navMenu.classList.toggle("is-open");
          navToggle.classList.toggle("open");
          evt.stopPropagation();
        });

        // Клик вне меню — закрыть
        document.addEventListener("click", (evt) => {
          if (!navMenu.classList.contains("is-open")) return;
          const insideMenu = navMenu.contains(evt.target);
          const onToggle = navToggle.contains(evt.target);
          if (!insideMenu && !onToggle) {
            navMenu.classList.remove("is-open");
            navToggle.classList.remove("open");
          }
        });

        // Переход по якорям — закрыть меню (мобайл UX)
        navMenu.addEventListener("click", (evt) => {
          const a = evt.target.closest("a");
          if (!a) return;
          if (a.getAttribute("href")?.includes("#")) {
            navMenu.classList.remove("is-open");
            navToggle.classList.remove("open");
          }
        });
      }

      // ── 3) Подсветка активной ссылки (в админке пропускаем) ──────────────
      if (!isAdmin) {
        const current =
          window.location.pathname.split("/").pop() || "index.html";
        headerEl.querySelectorAll("nav a").forEach((link) => {
          const href = link.getAttribute("href") || "";
          const file = href.split("#")[0]; // игнорируем якорь
          if (file === current || (file === "index.html" && current === "")) {
            link.classList.add("active-link");
          }
        });
      }
    },
    { once: true }
  );
})();
