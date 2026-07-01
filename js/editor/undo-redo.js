import { state } from "../state.js";
import { updatePlacementUi } from "./placement-mode.js";
import { hidePlacementCrosshair, updateDraftMarker } from "./draft-renderer.js";
import { updatePinElementPosition } from "../helpers/proximity.js";
import { persistPinPosition } from "../helpers/pin-persist.js";
import { showEditorToast } from "../ui/editor-toast.js";

const MAX_POSITION_HISTORY = 10;

function canUsePositionUndo() {
  return state.editMode || state.panelMode === "browse";
}

function copyPinMoveSnapshot(pin) {
  return {
    mode: "pin-move",
    pinId: pin.id,
    x: pin.x,
    y: pin.y,
    dirX: pin.dirX,
    dirY: pin.dirY,
  };
}

function copyPlacementSnapshot() {
  return {
    mode: "placement",
    coords: state.pendingCoords ? { ...state.pendingCoords } : null,
    direction: state.pendingDirection ? { ...state.pendingDirection } : null,
  };
}

function pushSnapshot(snapshot) {
  state.redoHistory = [];
  state.positionHistory.push(snapshot);
  if (state.positionHistory.length > MAX_POSITION_HISTORY) {
    state.positionHistory.shift();
  }
}

function applyPinMoveSnapshot(snapshot) {
  const pin = state.pins.find((item) => item.id === snapshot.pinId);
  if (!pin) return false;

  pin.x = snapshot.x;
  pin.y = snapshot.y;
  if (snapshot.dirX != null && snapshot.dirY != null) {
    pin.dirX = snapshot.dirX;
    pin.dirY = snapshot.dirY;
  } else {
    delete pin.dirX;
    delete pin.dirY;
  }

  updatePinElementPosition(pin.id);
  void persistPinPosition(pin).catch((error) => {
    console.error(error);
    alert(error.message || "Could not save pin position");
  });
  return true;
}

function applyPlacementSnapshot(snapshot) {
  state.pendingCoords = snapshot.coords;
  state.pendingDirection = snapshot.direction;
  updatePlacementUi();
  hidePlacementCrosshair();
  updateDraftMarker();
  return true;
}

export function initUndoRedoKeyboard() {
  window.addEventListener("keydown", (event) => {
    const isUndo = event.ctrlKey && (event.key === "w" || event.key === "W" || event.code === "KeyW" || event.key === "z" || event.key === "Z" || event.code === "KeyZ");
    if (isUndo) {
      event.preventDefault();
      event.stopPropagation();
      if (canUsePositionUndo() && popPositionSnapshot()) {
        const coordsEl = document.getElementById("pin-coords");
        if (coordsEl && state.editMode) {
          coordsEl.textContent = "Undo: reverted to previous position";
        } else if (state.panelMode === "browse") {
          showEditorToast("Undo: reverted position");
        }
      }
      return;
    }
    if (event.ctrlKey && (event.key === "y" || event.key === "Y" || event.code === "KeyY")) {
      event.preventDefault();
      event.stopPropagation();
      if (canUsePositionUndo() && popRedoSnapshot()) {
        const coordsEl = document.getElementById("pin-coords");
        if (coordsEl && state.editMode) {
          coordsEl.textContent = "Redo: reapplied position";
        } else if (state.panelMode === "browse") {
          showEditorToast("Redo: reapplied position");
        }
      }
    }
  }, { capture: true });
}

export function pushPositionSnapshot() {
  pushSnapshot(copyPlacementSnapshot());
}

export function pushPinMoveSnapshot(pin) {
  pushSnapshot(copyPinMoveSnapshot(pin));
}

export function popPositionSnapshot() {
  if (state.positionHistory.length === 0) return false;

  const snap = state.positionHistory.pop();

  if (snap.mode === "pin-move") {
    const pin = state.pins.find((item) => item.id === snap.pinId);
    if (pin) {
      state.redoHistory.push(copyPinMoveSnapshot(pin));
      if (state.redoHistory.length > MAX_POSITION_HISTORY) {
        state.redoHistory.shift();
      }
    }
    return applyPinMoveSnapshot(snap);
  }

  state.redoHistory.push(copyPlacementSnapshot());
  if (state.redoHistory.length > MAX_POSITION_HISTORY) {
    state.redoHistory.shift();
  }
  return applyPlacementSnapshot(snap);
}

export function popRedoSnapshot() {
  if (state.redoHistory.length === 0) return false;

  const snap = state.redoHistory.pop();

  if (snap.mode === "pin-move") {
    const pin = state.pins.find((item) => item.id === snap.pinId);
    if (pin) {
      state.positionHistory.push(copyPinMoveSnapshot(pin));
      if (state.positionHistory.length > MAX_POSITION_HISTORY) {
        state.positionHistory.shift();
      }
    }
    return applyPinMoveSnapshot(snap);
  }

  state.positionHistory.push(copyPlacementSnapshot());
  if (state.positionHistory.length > MAX_POSITION_HISTORY) {
    state.positionHistory.shift();
  }
  return applyPlacementSnapshot(snap);
}
