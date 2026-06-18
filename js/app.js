import { MapViewer } from "./map-viewer.js";
import { MapOverlays } from "./map-overlays.js";
import {
  createVideoElement,
  isDirectVideo,
  toEmbedUrl,
  youtubeThumbnail,
} from "./video-utils.js";

const STORAGE_KEY_PREFIX = "hll-climb-pins";
const MAP_STORAGE_KEY = "hll-climb-selected-map";
const TOGGLE_STORAGE_KEY = "hll-climb-overlay-toggles";

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
  mapSelect: document.getElementById("map-select"),
  garrisonSide: document.getElementById("garrison-side"),
};

let mapViewer;
let mapOverlays;
let pins = [];
let pinCatalog = {};
let mapCatalog = [];
let currentMapId = "SMDMV2";
let currentMap = null;
let editMode = false;
let pendingCoords = null;
let highlightedPinId = null;
let previewHideTimer = null;

async function init() {
  const [spawnData, pinData] = await Promise.all([loadSpawnData(), loadPinData()]);
  mapCatalog = spawnData.maps || [];
  pinCatalog = pinData.pins || {};
  currentMapId = loadSelectedMapId(pinData.defaultMapId);

  populateMapSelect();
  bindUi();
  await switchMap(currentMapId, { fit: true });
}

async function loadSpawnData() {
  try {
    const response = await fetch("data/map-spawns.json");
    if (!response.ok) throw new Error("Failed to load map spawn data");
    return response.json();
  } catch (error) {
    console.warn(error);
    return { maps: [] };
  }
}

async function loadPinData() {
  try {
    const response = await fetch("data/pins.json");
    if (!response.ok) throw new Error("Failed to load pin data");
    return response.json();
  } catch (error) {
    console.warn(error);
    return { defaultMapId: "SMDMV2", pins: {} };
  }
}

function loadSelectedMapId(fallbackId) {
  const stored = localStorage.getItem(MAP_STORAGE_KEY);
  return stored || fallbackId || "SMDMV2";
}

function saveSelectedMapId(mapId) {
  localStorage.setItem(MAP_STORAGE_KEY, mapId);
}

function loadToggleState() {
  try {
    return JSON.parse(localStorage.getItem(TOGGLE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveToggleState(state) {
  localStorage.setItem(TOGGLE_STORAGE_KEY, JSON.stringify(state));
}

function populateMapSelect() {
  els.mapSelect.innerHTML = "";
  for (const map of mapCatalog) {
    const option = document.createElement("option");
    option.value = map.id;
    option.textContent = map.name;
    els.mapSelect.appendChild(option);
  }
  els.mapSelect.value = currentMapId;
}

async function switchMap(mapId, { fit = false } = {}) {
  const map = mapCatalog.find((item) => item.id === mapId);
  if (!map) return;

  currentMapId = mapId;
  currentMap = map;
  saveSelectedMapId(mapId);
  els.mapSelect.value = mapId;

  els.image.src = map.image;
  els.image.alt = `${map.name} tactical map`;
  document.title = `HLL Climb Guide — ${map.name}`;

  await waitForImage(els.image);

  if (!mapViewer) {
    mapViewer = new MapViewer(els.viewport, els.stage, els.image);
    mapViewer.onTransform = () => {
      updateZoomLabel();
      positionPins();
    };
    mapOverlays = new MapOverlays(els.stage, els.image);
    applyToggleStateToUi();
    applyToggleStateToOverlays();
  } else {
    mapOverlays.syncGridSize();
  }

  mapOverlays.setMapData(map);
  pins = mergePins(pinCatalog[mapId] || [], loadUserPins(mapId));
  renderPins();
  renderPinList();

  if (fit) {
    mapViewer.fitToView();
  } else {
    mapViewer.clampTranslation();
    mapViewer.applyTransform();
  }
}

function storageKeyForMap(mapId) {
  return `${STORAGE_KEY_PREFIX}-${mapId}`;
}

function loadUserPins(mapId) {
  try {
    return JSON.parse(localStorage.getItem(storageKeyForMap(mapId)) || "[]");
  } catch {
    return [];
  }
}

function saveUserPins(mapId, userPins) {
  localStorage.setItem(storageKeyForMap(mapId), JSON.stringify(userPins));
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

  els.mapSelect.addEventListener("change", (event) => {
    switchMap(event.target.value, { fit: true });
  });

  document.getElementById("toggle-grid").addEventListener("change", (event) => {
    mapOverlays?.setToggle("grid", event.target.checked);
    persistToggles();
  });
  document.getElementById("toggle-strongpoints").addEventListener("change", (event) => {
    mapOverlays?.setToggle("strongpoints", event.target.checked);
    persistToggles();
  });
  document.getElementById("toggle-garrisons").addEventListener("change", (event) => {
    mapOverlays?.setToggle("offensiveGarrisons", event.target.checked);
    persistToggles();
  });
  document.getElementById("toggle-garrison-radius").addEventListener("change", (event) => {
    mapOverlays?.setToggle("garrisonRadius", event.target.checked);
    persistToggles();
  });
  els.garrisonSide.addEventListener("change", (event) => {
    mapOverlays?.setGarrisonSide(event.target.value);
    persistToggles();
  });
}

function applyToggleStateToUi() {
  const saved = loadToggleState();
  document.getElementById("toggle-grid").checked = saved.grid ?? false;
  document.getElementById("toggle-strongpoints").checked = saved.strongpoints ?? true;
  document.getElementById("toggle-garrisons").checked = saved.offensiveGarrisons ?? true;
  document.getElementById("toggle-garrison-radius").checked = saved.garrisonRadius ?? true;
  els.garrisonSide.value = saved.garrisonSide ?? "both";
}

function applyToggleStateToOverlays() {
  if (!mapOverlays) return;
  const saved = loadToggleState();
  mapOverlays.setToggle("grid", saved.grid ?? false);
  mapOverlays.setToggle("strongpoints", saved.strongpoints ?? true);
  mapOverlays.setToggle("offensiveGarrisons", saved.offensiveGarrisons ?? true);
  mapOverlays.setToggle("garrisonRadius", saved.garrisonRadius ?? true);
  mapOverlays.setGarrisonSide(saved.garrisonSide ?? "both");
}

function persistToggles() {
  saveToggleState({
    grid: document.getElementById("toggle-grid").checked,
    strongpoints: document.getElementById("toggle-strongpoints").checked,
    offensiveGarrisons: document.getElementById("toggle-garrisons").checked,
    garrisonRadius: document.getElementById("toggle-garrison-radius").checked,
    garrisonSide: els.garrisonSide.value,
  });
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

  const mapName = currentMap?.name || "this map";
  els.pinCount.textContent = `${pins.length} trick${pins.length === 1 ? "" : "s"} on ${mapName}`;
  positionPins();
}

function positionPins() {
  const buttons = els.pinsLayer.querySelectorAll(".map-pin");
  buttons.forEach((button) => {
    const pin = pins.find((item) => item.id === button.dataset.id);
    if (!pin) return;

    button.style.left = `${pin.x}%`;
    button.style.top = `${pin.y}%`;
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
    mapId: currentMapId,
    title: document.getElementById("pin-title").value.trim(),
    description: document.getElementById("pin-description").value.trim(),
    videoUrl: document.getElementById("pin-video").value.trim(),
    thumbnail: document.getElementById("pin-thumbnail").value.trim() || undefined,
    x: pendingCoords.x,
    y: pendingCoords.y,
    userAdded: true,
  };

  const userPins = loadUserPins(currentMapId);
  userPins.push(pin);
  saveUserPins(currentMapId, userPins);

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
