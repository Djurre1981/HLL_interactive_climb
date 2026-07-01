import { state } from "../state.js";
import { deletePin as apiDeletePin } from "../api/pins.js";
import { hideFormContextMenu } from "./form-context-menu.js";

function getPinContextMenu() {
  return document.getElementById("pin-context-menu");
}

export function showPinContextMenu(clientX, clientY) {
  const menu = getPinContextMenu();
  if (!menu || !state.contextMenuPin) return;
  hideFormContextMenu();
  menu.style.left = clientX + "px";
  menu.style.top = clientY + "px";
  menu.classList.remove("hidden");
}

export function hidePinContextMenu() {
  const menu = getPinContextMenu();
  if (!menu) return;
  menu.classList.add("hidden");
  state.contextMenuPin = null;
}

export function onPinContextMenuAction(event, { canModifyFn, reloadPinsForMapFn, startEditPinFn }) {
  const button = event.target.closest("[data-action]");
  if (!button || !state.contextMenuPin) return;
  const action = button.dataset.action;
  const pin = state.contextMenuPin;
  hidePinContextMenu();
  if (action === "edit") {
    if (canModifyFn(pin)) startEditPinFn(pin);
  } else if (action === "delete") {
    if (!canModifyFn(pin)) return;
    if (!window.confirm('Delete "' + pin.title + '"? This cannot be undone.')) return;
    (async function () {
      try {
        await apiDeletePin(state.currentMapId, pin.id);
        await reloadPinsForMapFn(state.currentMapId);
      } catch (error) {
        console.error(error);
        alert(error.message || "Could not delete trick");
      }
    })();
  }
}

export function onContextMenuKeyDown(event) {
  if (event.key === "Escape") {
    hidePinContextMenu();
    hideFormContextMenu();
  }
}
