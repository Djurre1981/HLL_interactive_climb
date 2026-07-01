import { state } from "../state.js";
import { getFilteredPins } from "../ui/filter-bar.js";
import { hasPinDirection } from "../ui/mg-spot-arrows.js";
import { getMgLabelDirection, getOppositeDirection, getNeutralDirection } from "./constants.js";

function getViewport() {
  return document.getElementById("map-viewport");
}

function getImage() {
  return document.getElementById("map-image");
}

function getPinsLayer() {
  return document.getElementById("map-pins");
}

function getPinList() {
  return document.getElementById("pin-list");
}

export function highlightPin(pinId) {
  const changed = state.highlightedPinId !== pinId;
  state.highlightedPinId = pinId;
  syncPinHighlightClasses();

  const pinList = getPinList();
  pinList.querySelectorAll(".pin-list__row").forEach((row) => {
    const id = row.querySelector(".pin-list__item")?.dataset.id;
    row.classList.toggle("is-active", id === pinId);
  });

  pinList.querySelectorAll(".pin-list__item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.id === pinId);
  });

  if (pinId && changed) {
    const item = pinList.querySelector(`.pin-list__item[data-id="${pinId}"]`);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

export function focusPin(pin, { zoomPercent = 65 } = {}) {
  const viewport = getViewport();
  const rect = viewport.getBoundingClientRect();
  const image = getImage();
  const imgW = image.naturalWidth;
  const imgH = image.naturalHeight;
  const mapViewer = state.mapViewer;

  let focusX = pin.x;
  let focusY = pin.y;
  if (pin.tag === "mg-spot" && hasPinDirection(pin)) {
    focusX = pin.dirX;
    focusY = pin.dirY;
  }

  mapViewer.scale = mapViewer.clampScale(zoomPercent / 100);
  mapViewer.translateX = rect.width / 2 - (focusX / 100) * imgW * mapViewer.scale;
  mapViewer.translateY = rect.height / 2 - (focusY / 100) * imgH * mapViewer.scale;
  mapViewer.clampTranslation();
  mapViewer.applyTransform();
  highlightPin(pin.id);
}

function syncPinHighlightClasses() {
  const pinsLayer = getPinsLayer();
  const highlightedPinId = state.highlightedPinId;

  pinsLayer.querySelectorAll(".map-pin").forEach((button) => {
    button.classList.toggle("is-highlighted", button.dataset.id === highlightedPinId);
  });

  pinsLayer.querySelectorAll(".map-mg-spot").forEach((group) => {
    group.classList.toggle("is-highlighted", group.dataset.id === highlightedPinId);
  });
}

const LABEL_DIRECTION_CLASSES = [
  "map-pin__label--left",
  "map-pin__label--right",
  "map-pin__label--top",
  "map-pin__label--bottom",
];

function getMgLabelDirectionClass(pin) {
  const alliesDir = getMgLabelDirection(state.currentMapId);
  const axisDir = getOppositeDirection(alliesDir);
  const neutralDir = getNeutralDirection(alliesDir);

  if (pin.faction === "allies") return alliesDir;
  if (pin.faction === "axis") return axisDir;
  return neutralDir;
}

/**
 * Position a pin label during drag (px or %) or at rest. Preserves MG faction offset classes.
 * @param {object} pin
 * @param {HTMLElement} label
 * @param {{ x: number, y: number, unit?: "px" | "percent" }} position
 */
export function applyLabelPosition(pin, label, position) {
  if (!label || !position) return;

  const unit = position.unit || "percent";
  label.style.left = unit === "px" ? `${position.x}px` : `${position.x}%`;
  label.style.top = unit === "px" ? `${position.y}px` : `${position.y}%`;

  if (pin.tag === "mg-spot" && pin.dirX != null && pin.dirY != null) {
    label.classList.remove(...LABEL_DIRECTION_CLASSES);
    label.classList.add(`map-pin__label--${getMgLabelDirectionClass(pin)}`);
    return;
  }

  label.classList.remove(...LABEL_DIRECTION_CLASSES);
}

function applyPinDomPosition(pin, pinsLayer = getPinsLayer()) {
  const button = pinsLayer.querySelector(`.map-pin[data-id="${pin.id}"]`);
  if (button) {
    button.style.left = `${pin.x}%`;
    button.style.top = `${pin.y}%`;
  }

  const label = pinsLayer.querySelector(`.map-pin__label[data-id="${pin.id}"]`);
  if (!label) return;

  if (pin.tag === "mg-spot" && pin.dirX != null && pin.dirY != null) {
    applyLabelPosition(pin, label, { x: pin.dirX, y: pin.dirY, unit: "percent" });
  } else {
    applyLabelPosition(pin, label, { x: pin.x, y: pin.y, unit: "percent" });
  }
}

export function updatePinElementPosition(pinId) {
  const pin = state.pins.find((item) => item.id === pinId);
  if (!pin) return;
  applyPinDomPosition(pin);
  syncPinHighlightClasses();
}

export function positionPins() {
  const pinsLayer = getPinsLayer();

  for (const pin of getFilteredPins()) {
    applyPinDomPosition(pin, pinsLayer);
  }

  syncPinHighlightClasses();
}
