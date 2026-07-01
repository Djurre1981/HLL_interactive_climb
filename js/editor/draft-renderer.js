import { state } from "../state.js";
import { renderDraftMgSpot } from "../ui/mg-spot-arrows.js";
import { getPinTag, DEFAULT_PIN_TAG } from "../pin-tags.js";
import { isMgSpotPlacement, getPinFormTag, isPlacementComplete, syncViewportFormClasses } from "./placement-mode.js";

function getDraftPin() {
  return document.getElementById("map-draft-pin");
}

function getDraftArrow() {
  return document.getElementById("map-draft-arrow");
}

function getCrosshair() {
  return document.getElementById("map-crosshair");
}

function getViewport() {
  return document.getElementById("map-viewport");
}

export function ensureDraftPinIcon(tagId) {
  const draftPin = getDraftPin();
  const existingIcon = draftPin.querySelector(".map-pin__icon");
  if (existingIcon) existingIcon.remove();
  const icon = document.createElement("i");
  icon.className = "fa-solid map-pin__icon";
  if (tagId === "mg-spot") {
    icon.classList.add("fa-play");
  } else {
    icon.classList.add("fa-map-pin");
  }
  draftPin.appendChild(icon);
}

export function updateDraftMarker(previewTip = null) {
  const draftPin = getDraftPin();
  const draftArrow = getDraftArrow();
  if (state.panelMode !== "add" && state.panelMode !== "edit") {
    draftPin?.classList.remove("is-draggable");
    draftPin?.classList.add("hidden");
    renderDraftMgSpot(draftArrow, null, null);
    syncViewportFormClasses();
    return;
  }

  if (isMgSpotPlacement()) {
    draftPin?.classList.remove("is-draggable");
    draftPin?.classList.add("hidden");
    if (state.pendingCoords && state.pendingDirection) {
      renderDraftMgSpot(draftArrow, state.pendingCoords, state.pendingDirection, { faction: state.pendingFaction });
      draftArrow?.querySelector(".map-mg-spot--draft")?.classList.add("is-placement-complete");
    } else if (state.pendingDirection) {
      renderDraftMgSpot(draftArrow, previewTip || state.pendingCoords, state.pendingDirection, {
        preview: Boolean(previewTip && !state.pendingCoords),
        faction: state.pendingFaction,
      });
    } else {
      renderDraftMgSpot(draftArrow, null, null);
    }
    syncViewportFormClasses();
    return;
  }

  if (!state.pendingCoords) {
    draftPin?.classList.remove("is-draggable");
    draftPin?.classList.add("hidden");
    renderDraftMgSpot(draftArrow, null, null);
    syncViewportFormClasses();
    return;
  }

  renderDraftMgSpot(draftArrow, null, null);
  const tagId = getPinFormTag() || DEFAULT_PIN_TAG;
  const tag = getPinTag(tagId);
  draftPin.className = `map-pin map-pin--draft ${tag?.className || ""}`;
  draftPin.style.left = `${state.pendingCoords.x}%`;
  draftPin.style.top = `${state.pendingCoords.y}%`;
  ensureDraftPinIcon(tagId);
  draftPin.classList.toggle("is-draggable", isPlacementComplete());
  draftPin.classList.remove("hidden");
  syncViewportFormClasses();
}

export function updateDraftPin() {
  updateDraftMarker();
}

export function hidePlacementCrosshair() {
  getCrosshair().classList.add("hidden");
}

export function showPlacementCrosshairAtScreen(x, y) {
  const viewport = getViewport();
  const crosshair = getCrosshair();
  const rect = viewport.getBoundingClientRect();
  crosshair.classList.remove("hidden");
  crosshair.style.left = `${x - rect.left}px`;
  crosshair.style.top = `${y - rect.top}px`;
}
