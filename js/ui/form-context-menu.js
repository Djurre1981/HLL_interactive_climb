import { state } from "../state.js";
import { canSavePlacement } from "../editor/placement-mode.js";
import { hidePinContextMenu } from "./pin-context-menu.js";

function getFormContextMenu() {
  return document.getElementById("form-context-menu");
}

export function showFormContextMenu(clientX, clientY) {
  const menu = getFormContextMenu();
  if (!menu) return;
  if (state.panelMode !== "add" && state.panelMode !== "edit") return;

  hidePinContextMenu();
  const saveBtn = menu.querySelector('[data-action="save"]');
  if (saveBtn) {
    saveBtn.disabled = !canSavePlacement();
  }
  menu.style.left = clientX + "px";
  menu.style.top = clientY + "px";
  menu.classList.remove("hidden");
}

export function hideFormContextMenu() {
  const menu = getFormContextMenu();
  if (!menu) return;
  menu.classList.add("hidden");
}

export function onFormContextMenuAction(event, { triggerFormSaveFn }) {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  hideFormContextMenu();
  if (action === "save") {
    triggerFormSaveFn();
  }
}
