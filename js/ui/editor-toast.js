let hideTimer = null;

export function showEditorToast(message, { durationMs = 2200 } = {}) {
  const viewport = document.getElementById("map-viewport");
  if (!viewport || !message) return;

  let toast = viewport.querySelector(".editor-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "editor-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    viewport.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("is-visible");

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    hideTimer = null;
  }, durationMs);
}
