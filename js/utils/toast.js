// =============================================================
// TOAST NOTIFICATIONS
// Lightweight, dependency-free toast utility. Any page that wants
// toasts just needs a <div id="toast-stack"></div> in its HTML.
// =============================================================

export function showToast(message, type = "info", duration = 4000) {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    document.body.appendChild(stack);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", "status");

  const icon = { success: "check_circle", error: "error", info: "info", warning: "warning" }[type] || "info";
  toast.innerHTML = `<span class="toast__icon">${icon === "check_circle" ? "✓" : icon === "error" ? "✕" : icon === "warning" ? "!" : "i"}</span><span class="toast__msg"></span>`;
  toast.querySelector(".toast__msg").textContent = message;

  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--visible"));

  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

export function confirmDialog(message, { confirmLabel = "Confirm", cancelLabel = "Cancel" } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-box">
        <p class="confirm-box__msg"></p>
        <div class="confirm-box__actions">
          <button class="btn btn--ghost" data-action="cancel">${cancelLabel}</button>
          <button class="btn btn--danger" data-action="confirm">${confirmLabel}</button>
        </div>
      </div>`;
    overlay.querySelector(".confirm-box__msg").textContent = message;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("confirm-overlay--visible"));

    function close(result) {
      overlay.classList.remove("confirm-overlay--visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", () => close(true));
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
  });
}
