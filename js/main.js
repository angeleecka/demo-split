// main.js
import { initErrorHandler } from "./js/error-handler.js";
import { initHeader } from "./js/header.js";
import { initScript } from "./js/script.js";
import { initPortfolio } from "./js/portfolio.js";

// Админка
import { initAdminActions } from "./js/admin-actions.js";
//import { initAdminPortfolio } from "./js/admin-portfolio.js";
import { initAdminUI } from "./js/admin-ui.js";

document.addEventListener("DOMContentLoaded", () => {
  const el = document.querySelector("#someId");
  if (!el) return; // защита от ошибки
  initErrorHandler();
  initHeader();
  initScript();
  initPortfolio();

  if (document.querySelector(".admin-body")) {
    initAdminActions?.();
    //initAdminPortfolio?.();
    initAdminUI?.();
  }
});
