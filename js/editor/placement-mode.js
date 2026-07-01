import { state } from "../state.js";
import { isDirectionalPinTag, DEFAULT_PIN_TAG } from "../pin-tags.js";
import { generatePositionCode, roundCoord } from "../helpers/position-code.js";
import { MG_COLLAPSE_HINT, mgHandlesCollapsed } from "../helpers/mg-placement.js";
import { hidePlacementCrosshair } from "./draft-renderer.js";

export function setPinFormTag(tagId) {
  document.querySelectorAll("#pin-tag-options [data-tag]").forEach((button) => {
    const active = button.dataset.tag === tagId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

export function getPinFormTag() {
  const active = document.querySelector("#pin-tag-options [data-tag].is-active");
  return active?.dataset.tag || null;
}

export function isMgSpotPlacement() {
  return isDirectionalPinTag(getPinFormTag() || DEFAULT_PIN_TAG);
}

export function isPlacementComplete() {
  if (isMgSpotPlacement()) return Boolean(state.pendingCoords) && Boolean(state.pendingDirection);
  return Boolean(state.pendingCoords);
}

export function canSavePlacement() {
  return isPlacementComplete() && !state.mgCollapseHint;
}

export function syncViewportFormClasses() {
  const viewport = document.getElementById("map-viewport");
  if (!viewport) return;
  const placing = state.panelMode === "add" && !isPlacementComplete();
  viewport.classList.toggle("is-placing-pin", placing);
  viewport.classList.toggle("is-editing-pin", state.panelMode === "edit");
}

export function getPlacementHint() {
  if (state.panelMode === "edit") return "";
  if (isMgSpotPlacement()) {
    return "1st click: arrowhead. 2nd click: bar + line. Then drag to adjust.";
  }
  return "Click the map to place a pin, then drag to adjust.";
}

export function updatePlacementUi() {
  updatePositionCode();
  const coordsEl = document.getElementById("pin-coords");
  const saveBtn = document.getElementById("btn-save-pin");
  if (!state.pendingCoords) {
    coordsEl.textContent = "No position selected";
    saveBtn.disabled = true;
    syncViewportFormClasses();
    return;
  }

  if (isMgSpotPlacement()) {
    if (!state.pendingDirection) {
      saveBtn.disabled = true;
      coordsEl.textContent = "No position selected";
      syncViewportFormClasses();
      return;
    }
    if (!state.pendingCoords) {
      coordsEl.textContent = `Arrowhead: ${state.pendingDirection.x}%, ${state.pendingDirection.y}% — click again for the bar`;
      saveBtn.disabled = true;
      syncViewportFormClasses();
      return;
    }
    if (state.mgCollapseHint) {
      coordsEl.textContent = MG_COLLAPSE_HINT;
      saveBtn.disabled = true;
      syncViewportFormClasses();
      return;
    }
    coordsEl.textContent = `Arrowhead: ${state.pendingDirection.x}%, ${state.pendingDirection.y}% · Bar: ${state.pendingCoords.x}%, ${state.pendingCoords.y}%`;
    saveBtn.disabled = false;
    syncViewportFormClasses();
    return;
  }

  coordsEl.textContent = `Position: ${state.pendingCoords.x}%, ${state.pendingCoords.y}%`;
  saveBtn.disabled = false;
  syncViewportFormClasses();
}

function updatePositionCode() {
  const pinPositionCode = document.getElementById("pin-position-code");
  const { pendingCoords, pendingDirection } = state;
  if (!pendingCoords && !pendingDirection) {
    pinPositionCode.value = "";
  } else if (isMgSpotPlacement() && pendingDirection) {
    if (!pendingCoords) {
      pinPositionCode.value = generatePositionCode(pendingDirection.x, pendingDirection.y);
    }
  } else if (pendingCoords) {
    pinPositionCode.value = generatePositionCode(pendingCoords.x, pendingCoords.y);
  }
}

export { generatePositionCode, roundCoord };

export function onViewportClick(event) {
  if (!state.editMode) return;
  if (state.pinDragSession) return;
  if (state.panelMode === "edit") return;
  if (state.panelMode === "add" && isPlacementComplete()) return;
  if (event.target.closest(".map-pin:not(.map-pin--draft), .map-mg-spot:not(.map-mg-spot--draft)")) {
    return;
  }

  const mapViewer = state.mapViewer;
  const coords = mapViewer.screenToMapPercent(event.clientX, event.clientY);
  if (coords.x < 0 || coords.y < 0 || coords.x > 100 || coords.y > 100) return;

  const point = {
    x: roundCoord(coords.x),
    y: roundCoord(coords.y),
  };

  if (isMgSpotPlacement()) {
    if (state.pendingDirection) {
      pushPositionSnapshot();
      state.pendingCoords = point;
      state.mgCollapseHint = mgHandlesCollapsed(point.x, point.y, state.pendingDirection.x, state.pendingDirection.y);
    } else {
      pushPositionSnapshot();
      state.pendingDirection = point;
    }
  } else {
    pushPositionSnapshot();
    state.pendingCoords = point;
    state.pendingDirection = null;
  }

  updatePlacementUi();
  hidePlacementCrosshair();
  updateDraftMarker();
}

export function cancelMgSpotHeadPlacement() {
  state.pendingDirection = null;
  state.pendingCoords = null;
  updatePlacementUi();
  updateDraftMarker();
}

export function onViewportContextMenu(event) {
  if (state.editMode && isMgSpotPlacement() && state.pendingDirection && !state.pendingCoords) {
    event.preventDefault();
    cancelMgSpotHeadPlacement();
    return;
  }

  if (state.panelMode !== "add" && state.panelMode !== "edit") {
    return;
  }

  if (
    event.target.closest(".map-pin:not(.map-pin--draft), .map-mg-spot:not(.map-mg-spot--draft)")
  ) {
    return;
  }

  event.preventDefault();
  showFormContextMenu(event.clientX, event.clientY);
}

export function shouldShowPlacementCrosshair() {
  if (!state.editMode) return false;
  if (state.panelMode === "edit") return false;
  if (isMgSpotPlacement()) return state.pendingDirection && !state.pendingCoords;
  return !state.pendingCoords;
}

export function onViewportMouseMove(event) {
  if (shouldShowPlacementCrosshair()) {
    showPlacementCrosshairAtScreen(event.clientX, event.clientY);
    const mapViewer = state.mapViewer;
    const coords = mapViewer.screenToMapPercent(event.clientX, event.clientY);
    if (coords.x >= 0 && coords.y >= 0 && coords.x <= 100 && coords.y <= 100) {
      if (isMgSpotPlacement() && state.pendingDirection && !state.pendingCoords) {
        updateDraftMarker({
          x: roundCoord(coords.x),
          y: roundCoord(coords.y),
        });
      }
    }
    return;
  }

  if (state.panelMode === "browse") {
    return;
  }

}

export function onViewportMouseLeave() {
  if (shouldShowPlacementCrosshair()) {
    hidePlacementCrosshair();
    if (isMgSpotPlacement() && state.pendingDirection && !state.pendingCoords) {
      updateDraftMarker();
    }
    return;
  }

  if (!state.editMode) {
    highlightPin(null);
  }
}

import { pushPositionSnapshot } from "./undo-redo.js";
import { showPlacementCrosshairAtScreen, updateDraftMarker } from "./draft-renderer.js";
import { highlightPin } from "../helpers/proximity.js";
import { showFormContextMenu } from "../ui/form-context-menu.js";
