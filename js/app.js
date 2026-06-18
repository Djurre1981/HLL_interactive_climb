import { MapViewer } from "./map-viewer.js";
import {
  createVideoElement,
  isDirectVideo,
  toEmbedUrl,
  youtubeThumbnail,
} from "./video-utils.js";

const STORAGE_KEY = "hll-climb-pins";

const els = {
  viewport: document.getElementById("map-viewport"),
  stage: document.getElementById("map-stage"),
  image: document.getElementById("map-image"),
  pinsLayer: document.getElementById("map-pins"),
  pinList: document.getElementById("pin-list"),
  pinCount: document.getElementById("pin-count"),
  zoomLabel: document.getElementById("zoom-label"),
  previewTooltip: document.getElementById("preview-tooltip"),
  previewMedia: document.getElementById("preview-media"),
  previewTitle: document.getElementById("preview-title"),
  previewDescription: document.getElementById("preview-description"),
  modal: document.getElementById("video-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalDescription: document.getElementById("modal-description"),
  modalPlayer: document.getElementById("modal-player"),
  editPanel: document.getElementById("edit-panel"),
  pinForm: document.getElementById("pin-form"),
  pinCoords: document.getElementById("pin-coords"),
  crosshair: document.getElementById("map-crosshair"),
  btnSavePin: document.getElementById("btn-save-pin"),
};

let mapViewer;
let pins = [];
let mapName = "Map";
let editMode = false;
let pendingCoords = null;
let highlightedPinId = null;
let previewHideTimer = null;

async function init() {
  const config = await loadConfig();
  mapName = config.mapName || "Map";
  els.image.src = config.mapImage || "maps/SMDM.webp";
  document.title = `HLL Climb Guide — ${mapName}`;

  await waitForImage(els.image);

  mapViewer = new MapViewer(els.viewport, els.stage, els.image);
  mapViewer.onTransform = () => {
    updateZoomLabel();
    positionPins();
  };

  pins = mergePins(config.pins || [], loadUserPins());
  renderPins();
  renderPinList();
  bindUi();
  mapViewer.fitToView();
}

async function loadConfig() {
  try {
    const response = await fetch("data/pins.json");
    if (!response.ok) throw new Error("Failed to load pin data");
    return response.json();
  } catch (error) {
    console.warn(error);
    return {
      mapImage: "maps/SMDM.webp",
      mapName: "Saint Marie du Mont",
      pins: [],
    };
  }
}

function loadUserPins() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveUserPins(userPins) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userPins));
}

function mergePins(basePins, userPins) {
  const byId = new Map(basePins.map((pin) => [pin.id, pin]));
  for (const pin of userPins) {
    byId.set(pin.id, pin);
  }
  return [...byId.values()];
}

function waitForImage(image) {
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
  });
}

function bindUi() {
  document.getElementById("btn-zoom-in").addEventListener("click", () => mapViewer.zoomIn());
  document.getElementById("btn-zoom-out").addEventListener("click", () => mapViewer.zoomOut());
  document.getElementById("btn-reset-view").addEventListener("click", () => mapViewer.resetView());
  document.getElementById("btn-toggle-edit").addEventListener("click", toggleEditMode);
  document.getElementById("btn-cancel-pin").addEventListener("click", () => setEditMode(false));
  document.getElementById("btn-close-modal").addEventListener("click", closeModal);
  els.modal.addEventListener("close", clearModalPlayer);
  els.pinForm.addEventListener("submit", onSavePin);

  els.viewport.addEventListener("click", onViewportClick);
  els.viewport.addEventListener("mousemove", onCrosshairMove);
}

function renderPins() {
  els.pinsLayer.innerHTML = "";
  for (const pin of pins) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-pin";
    button.dataset.id = pin.id;
    button.title = pin.title;
    button.setAttribute("aria-label", pin.title);

    button.addEventListener("mouseenter", (event) => showPreview(pin, event));
    button.addEventListener("mousemove", (event) => movePreview(event));
    button.addEventListener("mouseleave", scheduleHidePreview);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openModal(pin);
    });

    els.pinsLayer.appendChild(button);
  }

  els.pinCount.textContent = `${pins.length} trick${pins.length === 1 ? "" : "s"} on ${mapName}`;
  positionPins();
}

function positionPins() {
  const buttons = els.pinsLayer.querySelectorAll(".map-pin");
  buttons.forEach((button) => {
    const pin = pins.find((item) => item.id === button.dataset.id);
    if (!pin) return;

    const left = `${pin.x}%`;
    const top = `${pin.y}%`;
    button.style.left = left;
    button.style.top = top;
    button.classList.toggle("is-highlighted", pin.id === highlightedPinId);
  });
}

function renderPinList() {
  els.pinList.innerHTML = "";
  for (const pin of pins) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "pin-list__item";
    item.dataset.id = pin.id;
    item.innerHTML = `
      <span class="pin-list__title">${escapeHtml(pin.title)}</span>
      <span class="pin-list__meta">${escapeHtml(pin.description || "No description")}</span>
    `;

    item.addEventListener("mouseenter", () => highlightPin(pin.id));
    item.addEventListener("mouseleave", () => highlightPin(null));
    item.addEventListener("click", () => {
      focusPin(pin);
      openModal(pin);
    });

    els.pinList.appendChild(item);
  }
}

function highlightPin(pinId) {
  highlightedPinId = pinId;
  positionPins();
  els.pinList.querySelectorAll(".pin-list__item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.id === pinId);
  });
}

function focusPin(pin) {
  const rect = els.viewport.getBoundingClientRect();
  const imgW = els.image.naturalWidth;
  const imgH = els.image.naturalHeight;

  mapViewer.scale = Math.min(2.2, mapViewer.clampScale(1.8));
  mapViewer.translateX = rect.width / 2 - (pin.x / 100) * imgW * mapViewer.scale;
  mapViewer.translateY = rect.height / 2 - (pin.y / 100) * imgH * mapViewer.scale;
  mapViewer.clampTranslation();
  mapViewer.applyTransform();
  highlightPin(pin.id);
}

function showPreview(pin, event) {
  clearTimeout(previewHideTimer);
  els.previewTitle.textContent = pin.title;
  els.previewDescription.textContent = pin.description || "";
  els.previewMedia.innerHTML = "";

  const thumbnail = pin.thumbnail || youtubeThumbnail(pin.videoUrl);
  if (thumbnail) {
    const img = document.createElement("img");
    img.src = thumbnail;
    img.alt = `${pin.title} preview`;
    els.previewMedia.appendChild(img);
  } else if (isDirectVideo(pin.videoUrl)) {
    const video = createVideoElement(pin.videoUrl, {
      autoplay: true,
      muted: true,
      controls: false,
    });
    video.loop = true;
    els.previewMedia.appendChild(video);
  } else {
    const iframe = createVideoElement(pin.videoUrl, { autoplay: true, muted: true });
    els.previewMedia.appendChild(iframe);
  }

  els.previewTooltip.classList.remove("hidden");
  movePreview(event);
}

function movePreview(event) {
  const offset = 16;
  const tooltip = els.previewTooltip;
  const width = tooltip.offsetWidth || 320;
  const height = tooltip.offsetHeight || 220;

  let x = event.clientX + offset;
  let y = event.clientY + offset;

  if (x + width > window.innerWidth - 12) {
    x = event.clientX - width - offset;
  }
  if (y + height > window.innerHeight - 12) {
    y = event.clientY - height - offset;
  }

  tooltip.style.left = `${Math.max(12, x)}px`;
  tooltip.style.top = `${Math.max(12, y)}px`;
}

function scheduleHidePreview() {
  clearTimeout(previewHideTimer);
  previewHideTimer = setTimeout(() => {
    els.previewTooltip.classList.add("hidden");
    els.previewMedia.innerHTML = "";
  }, 120);
}

function openModal(pin) {
  hidePreviewImmediately();
  els.modalTitle.textContent = pin.title;
  els.modalDescription.textContent = pin.description || "";
  els.modalPlayer.innerHTML = "";

  const player = createVideoElement(pin.videoUrl, { autoplay: true, muted: false, controls: true });
  els.modalPlayer.appendChild(player);
  els.modal.showModal();
}

function closeModal() {
  els.modal.close();
}

function clearModalPlayer() {
  els.modalPlayer.innerHTML = "";
}

function hidePreviewImmediately() {
  clearTimeout(previewHideTimer);
  els.previewTooltip.classList.add("hidden");
  els.previewMedia.innerHTML = "";
}

function updateZoomLabel() {
  els.zoomLabel.textContent = `${mapViewer.getZoomPercent()}%`;
}

function toggleEditMode() {
  setEditMode(!editMode);
}

function setEditMode(enabled) {
  editMode = enabled;
  pendingCoords = null;
  mapViewer.setEditMode(enabled);
  els.editPanel.classList.toggle("hidden", !enabled);
  els.crosshair.classList.add("hidden");
  els.pinForm.reset();
  els.pinCoords.textContent = "No position selected";
  els.btnSavePin.disabled = true;

  const button = document.getElementById("btn-toggle-edit");
  button.textContent = enabled ? "Done adding" : "Add pin";
  button.classList.toggle("btn--primary", !enabled);
  button.classList.toggle("btn--ghost", enabled);
}

function onViewportClick(event) {
  if (!editMode) return;
  if (event.target.closest(".map-pin")) return;

  const coords = mapViewer.screenToMapPercent(event.clientX, event.clientY);
  if (coords.x < 0 || coords.y < 0 || coords.x > 100 || coords.y > 100) return;

  pendingCoords = {
    x: roundCoord(coords.x),
    y: roundCoord(coords.y),
  };

  els.pinCoords.textContent = `Position: ${pendingCoords.x}%, ${pendingCoords.y}%`;
  els.btnSavePin.disabled = false;

  const rect = els.viewport.getBoundingClientRect();
  els.crosshair.classList.remove("hidden");
  els.crosshair.style.left = `${event.clientX - rect.left}px`;
  els.crosshair.style.top = `${event.clientY - rect.top}px`;
}

function onCrosshairMove(event) {
  if (!editMode || !pendingCoords) return;
  const rect = els.viewport.getBoundingClientRect();
  els.crosshair.style.left = `${event.clientX - rect.left}px`;
  els.crosshair.style.top = `${event.clientY - rect.top}px`;
}

function onSavePin(event) {
  event.preventDefault();
  if (!pendingCoords) return;

  const pin = {
    id: `user-${Date.now()}`,
    title: document.getElementById("pin-title").value.trim(),
    description: document.getElementById("pin-description").value.trim(),
    videoUrl: document.getElementById("pin-video").value.trim(),
    thumbnail: document.getElementById("pin-thumbnail").value.trim() || undefined,
    x: pendingCoords.x,
    y: pendingCoords.y,
    userAdded: true,
  };

  const userPins = loadUserPins();
  userPins.push(pin);
  saveUserPins(userPins);

  pins.push(pin);
  renderPins();
  renderPinList();
  setEditMode(false);
  focusPin(pin);
}

function roundCoord(value) {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

init();
