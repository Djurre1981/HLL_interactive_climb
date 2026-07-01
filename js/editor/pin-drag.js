import { state } from "../state.js";
import { canModifyPin } from "../helpers/permissions.js";
import { applyLabelPosition, highlightPin, updatePinElementPosition } from "../helpers/proximity.js";
import { persistPinPosition } from "../helpers/pin-persist.js";
import { roundCoord } from "../helpers/position-code.js";
import { enforceMgHandleSeparation, mgHandlesCollapsed } from "../helpers/mg-placement.js";
import { pushPinMoveSnapshot, pushPositionSnapshot } from "./undo-redo.js";
import { isPlacementComplete, updatePlacementUi } from "./placement-mode.js";
import { updateDraftMarker } from "./draft-renderer.js";
import { refreshMgSpotGroup } from "../ui/mg-spot-arrows.js";
import { showEditorToast } from "../ui/editor-toast.js";

const DRAG_THRESHOLD_PX = 4;

function getViewport() {
  return document.getElementById("map-viewport");
}

function getImage() {
  return document.getElementById("map-image");
}

function getPinLabel(pinId) {
  return document.querySelector(`.map-pin__label[data-id="${pinId}"]`);
}

function clampMapCoord(value) {
  return Math.min(100, Math.max(0, value));
}

function getImageSize() {
  const image = getImage();
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

// Convert a client (viewport) point to map pixel coordinates. This stays inside
// the same coordinate space #map-pins uses (the stage is sized to the image's
// natural pixel dimensions), so it works regardless of the current pan/zoom.
function screenToMapPx(clientX, clientY) {
  const { width, height } = getImageSize();
  const percent = state.mapViewer.screenToMapPercent(clientX, clientY);
  return {
    x: (percent.x / 100) * width,
    y: (percent.y / 100) * height,
  };
}

function mapPxToPercent(px, py, imgW, imgH) {
  return {
    x: clampMapCoord((px / imgW) * 100),
    y: clampMapCoord((py / imgH) * 100),
  };
}

function clearDragStyles(element, label) {
  element.classList.remove("map-pin--dragging");
  element.style.left = "";
  element.style.top = "";

  if (label) {
    label.classList.remove("map-pin__label--dragging");
    label.style.left = "";
    label.style.top = "";
  }
}

// Begin an in-place drag: the pin never leaves #map-pins, so it keeps riding
// the stage's pan/zoom transform (no reparent, no position:fixed, no size
// mismatch). The grab offset is computed in map-pixel space so the pin stays
// glued under the pointer exactly where it was grabbed.
function hasExceededDragThreshold(dx, dy) {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

function beginMapDrag(element, label, anchor, clientX, clientY) {
  const { width: imgW, height: imgH } = getImageSize();
  const anchorPx = {
    x: (anchor.x / 100) * imgW,
    y: (anchor.y / 100) * imgH,
  };
  const pointerPx = screenToMapPx(clientX, clientY);

  element.classList.add("map-pin--dragging");
  if (label) {
    label.classList.add("map-pin__label--dragging");
  }

  return {
    grabOffsetX: anchorPx.x - pointerPx.x,
    grabOffsetY: anchorPx.y - pointerPx.y,
    imgW,
    imgH,
    lastPx: anchorPx.x,
    lastPy: anchorPx.y,
  };
}

function moveMapDrag(element, pin, label, clientX, clientY, dragState) {
  const pointerPx = screenToMapPx(clientX, clientY);
  const px = Math.min(dragState.imgW, Math.max(0, pointerPx.x + dragState.grabOffsetX));
  const py = Math.min(dragState.imgH, Math.max(0, pointerPx.y + dragState.grabOffsetY));

  dragState.lastPx = px;
  dragState.lastPy = py;

  element.style.left = `${px}px`;
  element.style.top = `${py}px`;

  if (label && pin) {
    applyLabelPosition(pin, label, { x: px, y: py, unit: "px" });
  }
}

function endMapDrag(element, label, dragState) {
  const coords = mapPxToPercent(dragState.lastPx, dragState.lastPy, dragState.imgW, dragState.imgH);
  clearDragStyles(element, label);
  return coords;
}

export function isPinDragActive() {
  return Boolean(state.pinDragSession);
}

export function canDragDraftInEditor() {
  return (
    state.editMode &&
    (state.panelMode === "add" || state.panelMode === "edit") &&
    isPlacementComplete() &&
    !state.pinSaveInFlight
  );
}

export function canDragPinInEditor(pin) {
  return state.panelMode === "browse" && canModifyPin(pin) && !state.pinSaveInFlight;
}

function finishDraftPlacement(coordsUpdater) {
  coordsUpdater();
  updatePlacementUi();
  updateDraftMarker();
}

const DRAFT_DRAG_BOUND = "data-draft-drag-bound";

export function attachDraftClimbDrag(draftPin) {
  if (!draftPin || draftPin.hasAttribute(DRAFT_DRAG_BOUND)) return;
  draftPin.setAttribute(DRAFT_DRAG_BOUND, "true");

  draftPin.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (!canDragDraftInEditor()) return;
    startDraftClimbDrag(event, draftPin);
  });
}

export function attachDraftMgSpotDrag(draftArrow) {
  if (!draftArrow || draftArrow.hasAttribute(DRAFT_DRAG_BOUND)) return;
  draftArrow.setAttribute(DRAFT_DRAG_BOUND, "true");

  draftArrow.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (!canDragDraftInEditor()) return;

    const head = event.target.closest(".mg-spot-head");
    const base = event.target.closest(".mg-spot-base");
    if (!head && !base) return;

    const group = draftArrow.querySelector(".map-mg-spot--draft.is-placement-complete");
    if (!group) return;

    startDraftMgSpotDrag(event, group, head ? "head" : "bar", head || base);
  });
}

export function initDraftPinDrag() {
  attachDraftClimbDrag(document.getElementById("map-draft-pin"));
  attachDraftMgSpotDrag(document.getElementById("map-draft-arrow"));
}

export function attachClimbPinDrag(button, pin) {
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (!canDragPinInEditor(pin)) return;
    startClimbPinDrag(event, pin, button);
  });
}

function startClimbPinDrag(event, pin, element) {
  event.preventDefault();
  event.stopPropagation();
  if (state.pinSaveInFlight) return;

  const pinRef = state.pins.find((item) => item.id === pin.id);
  if (!pinRef) return;

  const viewport = getViewport();
  const label = getPinLabel(pin.id);
  const startClient = { x: event.clientX, y: event.clientY };
  let dragging = false;
  let snapshotPushed = false;
  let activePointerId = event.pointerId;
  let beforeDrag = null;
  let dragState = null;

  const onPointerMove = (moveEvent) => {
    if (moveEvent.pointerId !== activePointerId) return;

    const dx = moveEvent.clientX - startClient.x;
    const dy = moveEvent.clientY - startClient.y;
    if (!dragging && !hasExceededDragThreshold(dx, dy)) return;

    if (!dragging) {
      dragging = true;
      beforeDrag = { x: pinRef.x, y: pinRef.y, dirX: pinRef.dirX, dirY: pinRef.dirY };
      if (!snapshotPushed) {
        pushPinMoveSnapshot(pinRef);
        snapshotPushed = true;
      }
      dragState = beginMapDrag(element, label, pinRef, startClient.x, startClient.y);
      state.pinDragSession = { pinId: pinRef.id, type: "climb" };
      viewport?.classList.add("is-pin-dragging");
      element.setPointerCapture(activePointerId);
    }

    moveMapDrag(element, pinRef, label, moveEvent.clientX, moveEvent.clientY, dragState);
  };

  const finishDrag = async (upEvent) => {
    if (upEvent.pointerId !== activePointerId) return;

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", finishDrag);
    window.removeEventListener("pointercancel", finishDrag);

    state.pinDragSession = null;
    viewport?.classList.remove("is-pin-dragging");

    try {
      element.releasePointerCapture(activePointerId);
    } catch {
      /* pointer may already be released */
    }

    if (!dragging) {
      if (state.panelMode === "browse") {
        highlightPin(pinRef.id);
      }
      return;
    }

    const coords = endMapDrag(element, label, dragState);
    pinRef.x = coords.x;
    pinRef.y = coords.y;
    updatePinElementPosition(pinRef.id);

    try {
      await persistPinPosition(pinRef);
    } catch (error) {
      console.error(error);
      if (beforeDrag) {
        pinRef.x = beforeDrag.x;
        pinRef.y = beforeDrag.y;
        if (beforeDrag.dirX != null) {
          pinRef.dirX = beforeDrag.dirX;
          pinRef.dirY = beforeDrag.dirY;
        }
        updatePinElementPosition(pinRef.id);
      }
      alert(error.message || "Could not save pin position");
    }
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
}

// MG spot drag: same in-map, no-reparent pattern as climb pins, but the
// "element" being dragged is a handle (arrowhead or tail bar) inside the SVG
// group. Dragging the head only moves dirX/dirY (bar stays put); dragging the
// bar only moves x/y (head stays put). The dotted stem is never a handle - it
// is simply redrawn to follow whichever end moved via refreshMgSpotGroup().
function beginMgHandleDrag(anchor, clientX, clientY) {
  const { width: imgW, height: imgH } = getImageSize();
  const anchorPx = {
    x: (anchor.x / 100) * imgW,
    y: (anchor.y / 100) * imgH,
  };
  const pointerPx = screenToMapPx(clientX, clientY);

  return {
    grabOffsetX: anchorPx.x - pointerPx.x,
    grabOffsetY: anchorPx.y - pointerPx.y,
    imgW,
    imgH,
    lastX: anchor.x,
    lastY: anchor.y,
    hadSeparationIssue: false,
  };
}

function beginMgSpotDrag(pinRef, handle, clientX, clientY) {
  const anchorX = handle === "head" ? pinRef.dirX : pinRef.x;
  const anchorY = handle === "head" ? pinRef.dirY : pinRef.y;
  return beginMgHandleDrag({ x: anchorX, y: anchorY }, clientX, clientY);
}

function moveMgSpotDrag(clientX, clientY, dragState, fixedAnchor = null) {
  const pointerPx = screenToMapPx(clientX, clientY);
  const px = Math.min(dragState.imgW, Math.max(0, pointerPx.x + dragState.grabOffsetX));
  const py = Math.min(dragState.imgH, Math.max(0, pointerPx.y + dragState.grabOffsetY));
  let coords = mapPxToPercent(px, py, dragState.imgW, dragState.imgH);

  if (fixedAnchor) {
    const enforced = enforceMgHandleSeparation(fixedAnchor.x, fixedAnchor.y, coords.x, coords.y);
    coords = { x: enforced.x, y: enforced.y };
    dragState.hadSeparationIssue = dragState.hadSeparationIssue || enforced.wasCollapsed;
  }

  dragState.lastX = coords.x;
  dragState.lastY = coords.y;
  return coords;
}

function applyMgHeadLabel(pinRef, label, dirX, dirY) {
  if (!label) return;
  applyLabelPosition({ ...pinRef, dirX, dirY }, label, { x: dirX, y: dirY, unit: "percent" });
}

function syncDraftMgCollapseHint(barX, barY, headX, headY) {
  state.mgCollapseHint = mgHandlesCollapsed(barX, barY, headX, headY);
}

export function attachMgSpotDrag(group, pin) {
  const headEl = group.querySelector(".mg-spot-head");
  const baseEl = group.querySelector(".mg-spot-base");

  headEl?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (!canDragPinInEditor(pin)) return;
    startMgSpotDrag(event, pin, group, "head");
  });

  baseEl?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (!canDragPinInEditor(pin)) return;
    startMgSpotDrag(event, pin, group, "bar");
  });
}

function startMgSpotDrag(event, pin, group, handle) {
  event.preventDefault();
  event.stopPropagation();
  if (state.pinSaveInFlight) return;

  const pinRef = state.pins.find((item) => item.id === pin.id);
  if (!pinRef) return;

  const viewport = getViewport();
  const label = getPinLabel(pin.id);
  const handleEl = event.currentTarget;
  const startClient = { x: event.clientX, y: event.clientY };
  let dragging = false;
  let snapshotPushed = false;
  const activePointerId = event.pointerId;
  let beforeDrag = null;
  let dragState = null;

  const onPointerMove = (moveEvent) => {
    if (moveEvent.pointerId !== activePointerId) return;

    const dx = moveEvent.clientX - startClient.x;
    const dy = moveEvent.clientY - startClient.y;
    if (!dragging && !hasExceededDragThreshold(dx, dy)) return;

    if (!dragging) {
      dragging = true;
      beforeDrag = { x: pinRef.x, y: pinRef.y, dirX: pinRef.dirX, dirY: pinRef.dirY };
      if (!snapshotPushed) {
        pushPinMoveSnapshot(pinRef);
        snapshotPushed = true;
      }
      dragState = beginMgSpotDrag(pinRef, handle, startClient.x, startClient.y);
      state.pinDragSession = { pinId: pinRef.id, type: "mg-spot", handle };
      group.classList.add("map-mg-spot--dragging");
      group.parentNode?.appendChild(group);
      viewport?.classList.add("is-pin-dragging");
      handleEl.setPointerCapture(activePointerId);
    }

    const coords = moveMgSpotDrag(
      moveEvent.clientX,
      moveEvent.clientY,
      dragState,
      handle === "head" ? { x: pinRef.x, y: pinRef.y } : { x: pinRef.dirX, y: pinRef.dirY }
    );

    if (handle === "head") {
      refreshMgSpotGroup(group, { x: pinRef.x, y: pinRef.y, dirX: coords.x, dirY: coords.y });
      applyMgHeadLabel(pinRef, label, coords.x, coords.y);
    } else {
      refreshMgSpotGroup(group, { x: coords.x, y: coords.y, dirX: pinRef.dirX, dirY: pinRef.dirY });
    }
  };

  const finishDrag = async (upEvent) => {
    if (upEvent.pointerId !== activePointerId) return;

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", finishDrag);
    window.removeEventListener("pointercancel", finishDrag);

    state.pinDragSession = null;
    viewport?.classList.remove("is-pin-dragging");
    group.classList.remove("map-mg-spot--dragging");

    try {
      handleEl.releasePointerCapture(activePointerId);
    } catch {
      /* pointer may already be released */
    }

    if (!dragging) {
      if (state.panelMode === "browse") {
        highlightPin(pinRef.id);
      }
      return;
    }

    if (handle === "head") {
      pinRef.dirX = dragState.lastX;
      pinRef.dirY = dragState.lastY;
    } else {
      pinRef.x = dragState.lastX;
      pinRef.y = dragState.lastY;
    }

    refreshMgSpotGroup(group, pinRef);
    updatePinElementPosition(pinRef.id);

    if (dragState.hadSeparationIssue) {
      showEditorToast("Head and bar were too close — position adjusted");
    }

    try {
      await persistPinPosition(pinRef);
    } catch (error) {
      console.error(error);
      if (beforeDrag) {
        pinRef.x = beforeDrag.x;
        pinRef.y = beforeDrag.y;
        pinRef.dirX = beforeDrag.dirX;
        pinRef.dirY = beforeDrag.dirY;
        refreshMgSpotGroup(group, pinRef);
        updatePinElementPosition(pinRef.id);
      }
      alert(error.message || "Could not save pin position");
    }
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
}

function startDraftClimbDrag(event, element) {
  event.preventDefault();
  event.stopPropagation();
  if (state.pinSaveInFlight) return;

  const coords = state.pendingCoords;
  if (!coords) return;

  const viewport = getViewport();
  const startClient = { x: event.clientX, y: event.clientY };
  let dragging = false;
  let snapshotPushed = false;
  let activePointerId = event.pointerId;
  let dragState = null;

  const onPointerMove = (moveEvent) => {
    if (moveEvent.pointerId !== activePointerId) return;

    const dx = moveEvent.clientX - startClient.x;
    const dy = moveEvent.clientY - startClient.y;
    if (!dragging && !hasExceededDragThreshold(dx, dy)) return;

    if (!dragging) {
      dragging = true;
      if (!snapshotPushed) {
        pushPositionSnapshot();
        snapshotPushed = true;
      }
      dragState = beginMapDrag(element, null, coords, startClient.x, startClient.y);
      state.pinDragSession = { type: "draft-climb" };
      viewport?.classList.add("is-pin-dragging");
      element.setPointerCapture(activePointerId);
    }

    moveMapDrag(element, { tag: "climb", x: coords.x, y: coords.y }, null, moveEvent.clientX, moveEvent.clientY, dragState);
  };

  const finishDrag = (upEvent) => {
    if (upEvent.pointerId !== activePointerId) return;

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", finishDrag);
    window.removeEventListener("pointercancel", finishDrag);

    state.pinDragSession = null;
    viewport?.classList.remove("is-pin-dragging");

    try {
      element.releasePointerCapture(activePointerId);
    } catch {
      /* pointer may already be released */
    }

    if (!dragging) return;

    const nextCoords = endMapDrag(element, null, dragState);
    finishDraftPlacement(() => {
      state.pendingCoords = {
        x: roundCoord(nextCoords.x),
        y: roundCoord(nextCoords.y),
      };
    });
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
}

function beginDraftMgSpotDrag(handle, clientX, clientY) {
  const anchor = handle === "head" ? state.pendingDirection : state.pendingCoords;
  return beginMgHandleDrag(anchor, clientX, clientY);
}

function startDraftMgSpotDrag(event, group, handle, handleEl) {
  event.preventDefault();
  event.stopPropagation();
  if (state.pinSaveInFlight) return;

  if (!state.pendingCoords || !state.pendingDirection) return;

  const viewport = getViewport();
  const startClient = { x: event.clientX, y: event.clientY };
  let dragging = false;
  let snapshotPushed = false;
  const activePointerId = event.pointerId;
  let dragState = null;

  const onPointerMove = (moveEvent) => {
    if (moveEvent.pointerId !== activePointerId) return;

    const dx = moveEvent.clientX - startClient.x;
    const dy = moveEvent.clientY - startClient.y;
    if (!dragging && !hasExceededDragThreshold(dx, dy)) return;

    if (!dragging) {
      dragging = true;
      if (!snapshotPushed) {
        pushPositionSnapshot();
        snapshotPushed = true;
      }
      dragState = beginDraftMgSpotDrag(handle, startClient.x, startClient.y);
      state.pinDragSession = { type: "draft-mg-spot", handle };
      group.classList.add("map-mg-spot--dragging");
      group.parentNode?.appendChild(group);
      viewport?.classList.add("is-pin-dragging");
      handleEl.setPointerCapture(activePointerId);
    }

    const coords = moveMgSpotDrag(
      moveEvent.clientX,
      moveEvent.clientY,
      dragState,
      handle === "head"
        ? { x: state.pendingCoords.x, y: state.pendingCoords.y }
        : { x: state.pendingDirection.x, y: state.pendingDirection.y }
    );

    if (handle === "head") {
      refreshMgSpotGroup(group, {
        x: state.pendingCoords.x,
        y: state.pendingCoords.y,
        dirX: coords.x,
        dirY: coords.y,
      });
      syncDraftMgCollapseHint(state.pendingCoords.x, state.pendingCoords.y, coords.x, coords.y);
    } else {
      refreshMgSpotGroup(group, {
        x: coords.x,
        y: coords.y,
        dirX: state.pendingDirection.x,
        dirY: state.pendingDirection.y,
      });
      syncDraftMgCollapseHint(coords.x, coords.y, state.pendingDirection.x, state.pendingDirection.y);
    }
  };

  const finishDrag = (upEvent) => {
    if (upEvent.pointerId !== activePointerId) return;

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", finishDrag);
    window.removeEventListener("pointercancel", finishDrag);

    state.pinDragSession = null;
    viewport?.classList.remove("is-pin-dragging");
    group.classList.remove("map-mg-spot--dragging");

    try {
      handleEl.releasePointerCapture(activePointerId);
    } catch {
      /* pointer may already be released */
    }

    if (!dragging) return;

    finishDraftPlacement(() => {
      if (handle === "head") {
        state.pendingDirection = {
          x: roundCoord(dragState.lastX),
          y: roundCoord(dragState.lastY),
        };
      } else {
        state.pendingCoords = {
          x: roundCoord(dragState.lastX),
          y: roundCoord(dragState.lastY),
        };
      }
      syncDraftMgCollapseHint(
        state.pendingCoords.x,
        state.pendingCoords.y,
        state.pendingDirection.x,
        state.pendingDirection.y
      );
    });
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
}
