// error-handler.js

(function () {
  const _lastSent = new Map(); // key -> timestamp
  const _cooldownMs = 5000; // 5 секунд на одинаковую ошибку

  function sendClientError(payload) {
    try {
      const key = `${payload.type}|${payload.message}|${
        payload.filename || ""
      }|${payload.lineno || ""}`;
      const now = Date.now();
      const last = _lastSent.get(key) || 0;
      if (now - last < _cooldownMs) return;
      _lastSent.set(key, now);

      return fetch(window.API_BASE_URL + "/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true, // чтобы успело уйти даже при перезагрузке/закрытии вкладки
      }).catch(() => {});
    } catch {
      // на всякий случай, чтобы не было каскада
    }
  }

  // 1) Необработанные rejection (промисы)
  window.addEventListener("unhandledrejection", (event) => {
    console.error("⚠️ Unhandled Promise rejection:", event.reason);

    sendClientError({
      type: "unhandledrejection",
      message: String(
        event.reason?.message || event.reason || "Unknown rejection"
      ),
      stack: String(event.reason?.stack || ""),
      href: location.href,
      ua: navigator.userAgent,
      time: new Date().toISOString(),
    });
  });

  // 2) Обычные JS-ошибки (throw, ReferenceError и т.п.)
  window.addEventListener("error", (event) => {
    // event может быть ErrorEvent или ошибка загрузки ресурса (script/img)
    const msg = event?.message || "Script error";
    const filename = event?.filename || "";
    const lineno = event?.lineno || 0;
    const colno = event?.colno || 0;

    console.error(
      "❌ Uncaught error:",
      msg,
      filename,
      lineno,
      colno,
      event?.error
    );

    sendClientError({
      type: "error",
      message: String(msg),
      filename,
      lineno,
      colno,
      stack: String(event?.error?.stack || ""),
      href: location.href,
      ua: navigator.userAgent,
      time: new Date().toISOString(),
    });
  });
})();
