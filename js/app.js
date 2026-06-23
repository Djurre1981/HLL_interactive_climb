import { MapViewer } from "./map-viewer.js";
import { MapOverlays } from "./map-overlays.js";
import { initAuth, loadProtectedPins } from "./auth.js";
import {
  DEFAULT_PIN_TAG,
  getPinTag,
  normalizePinTag,
  PIN_TAGS,
} from "./pin-tags.js";
import {
  createVideoElement,
  isDirectVideo,
  toEmbedUrl,
  youtubeThumbnail,
} from "./video-utils.js";

const STORAGE_KEY_PREFIX = "hll-climb-pins";
const MAP_STORAGE_KEY = "hll-climb-selected-map";
const TOGGLE_STORAGE_KEY = "hll-climb-overlay-toggles";
const TAG_FILTER_STORAGE_KEY = "hll-climb-tag-filters";

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
  editPanelTitle: document.getElementById("edit-panel-title"),
  editPanelHint: document.getElementById("edit-panel-hint"),
  pinForm: document.getElementById("pin-form"),
  pinCoords: document.getElementById("pin-coords"),
  crosshair: document.getElementById("map-crosshair"),
  btnSavePin: document.getElementById("btn-save-pin"),
  btnToggleEdit: document.getElementById("btn-toggle-edit"),
  btnEditModal: document.getElementById("btn-edit-modal"),
  pinTitle: document.getElementById("pin-title"),
  pinDescription: document.getElementById("pin-description"),
  pinVideo: document.getElementById("pin-video"),
  pinThumbnail: document.getElementById("pin-thumbnail"),
  mapSelect: document.getElementById("map-select"),
};

let mapViewer;
let mapOverlays;
let pins = [];
let pinCatalog = {};
let mapCatalog = [];
let currentMapId = "SMDMV2";
let currentMap = null;
let editMode = false;
let panelMode = null;
let editingPinId = null;
let modalPin = null;
let pendingCoords = null;
let highlightedPinId = null;
let previewHideTimer = null;
let tagFilters = loadTagFilters();

const PIN_HOVER_RADIUS_PX = 140;

async function init() {
  const auth = await initAuth();
  if (!auth.ok) return;

  const [spawnData, pinData] = await Promise.all([loadSpawnData(), loadProtectedPins()]);
  mapCatalog = spawnData.maps || [];
  pinCatalog = pinData.pins || {};
  currentMapId = loadSelectedMapId(pinData.defaultMapId);

  populateMapSelect();
  applyTagFiltersToUi();
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

function loadTagFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(TAG_FILTER_STORAGE_KEY) || "{}");
    return Object.fromEntries(
      PIN_TAGS.map((tag) => [tag.id, saved[tag.id] ?? true])
    );
  } catch {
    return Object.fromEntries(PIN_TAGS.map((tag) => [tag.id, true]));
  }
}

function saveTagFilters() {
  localStorage.setItem(TAG_FILTER_STORAGE_KEY, JSON.stringify(tagFilters));
}

function applyTagFiltersToUi() {
  for (const tag of PIN_TAGS) {
    const button = document.querySelector(`#tag-filters [data-tag="${tag.id}"]`);
    if (!button) continue;
    const active = isPinTagVisible(tag.id);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function isPinTagVisible(tagId) {
  return tagFilters[tagId] !== false;
}

function getFilteredPins() {
  return pins.filter((pin) => isPinTagVisible(pin.tag));
}

function normalizePin(pin) {
  return { ...pin, tag: normalizePinTag(pin) };
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

  closeEditPanel();

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

function upsertUserPin(mapId, pin) {
  const userPins = loadUserPins(mapId);
  const index = userPins.findIndex((item) => item.id === pin.id);
  const nextPin = { ...pin, userAdded: true };

  if (index >= 0) {
    userPins[index] = nextPin;
  } else {
    userPins.push(nextPin);
  }

  saveUserPins(mapId, userPins);
  return nextPin;
}

function mergePins(basePins, userPins) {
  const byId = new Map(basePins.map((pin) => [pin.id, normalizePin(pin)]));
  for (const pin of userPins) {
    byId.set(pin.id, normalizePin(pin));
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
  document.getElementById("btn-cancel-pin").addEventListener("click", () => closeEditPanel());
  document.getElementById("btn-close-modal").addEventListener("click", closeModal);
  els.btnEditModal.addEventListener("click", () => {
    if (modalPin) startEditPin(modalPin);
  });
  els.modal.addEventListener("close", clearModalPlayer);
  els.pinForm.addEventListener("submit", onSavePin);

  els.viewport.addEventListener("click", onViewportClick);
  els.viewport.addEventListener("mousemove", onViewportMouseMove);
  els.viewport.addEventListener("mouseleave", onViewportMouseLeave);

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

  document.querySelectorAll("#tag-filters [data-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      const tagId = button.dataset.tag;
      tagFilters[tagId] = !isPinTagVisible(tagId);
      saveTagFilters();
      applyTagFiltersToUi();
      onTagFiltersChanged();
    });
  });

  document.querySelectorAll("#pin-tag-options [data-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      setPinFormTag(button.dataset.tag);
    });
  });
}

function applyToggleStateToUi() {
  const saved = loadToggleState();
  document.getElementById("toggle-grid").checked = saved.grid ?? false;
  document.getElementById("toggle-strongpoints").checked = saved.strongpoints ?? true;
}

function applyToggleStateToOverlays() {
  if (!mapOverlays) return;
  const saved = loadToggleState();
  mapOverlays.setToggle("grid", saved.grid ?? false);
  mapOverlays.setToggle("strongpoints", saved.strongpoints ?? true);
}

function persistToggles() {
  saveToggleState({
    grid: document.getElementById("toggle-grid").checked,
    strongpoints: document.getElementById("toggle-strongpoints").checked,
  });
}

function onTagFiltersChanged() {
  if (highlightedPinId && !getFilteredPins().some((pin) => pin.id === highlightedPinId)) {
    highlightPin(null);
  }
  renderPins();
  renderPinList();
}

function updatePinCount() {
  const filtered = getFilteredPins();
  const mapName = currentMap?.name || "this map";
  const total = pins.length;

  if (total === 0) {
    els.pinCount.textContent = `No tricks on ${mapName}`;
    return;
  }

  if (filtered.length === 0) {
    els.pinCount.textContent = `No tricks visible on ${mapName} — enable a tag`;
    return;
  }

  if (filtered.length === total) {
    els.pinCount.textContent = `${filtered.length} trick${filtered.length === 1 ? "" : "s"} on ${mapName}`;
    return;
  }

  els.pinCount.textContent = `${filtered.length} of ${total} tricks on ${mapName}`;
}

function setPinFormTag(tagId) {
  document.querySelectorAll("#pin-tag-options [data-tag]").forEach((button) => {
    const active = button.dataset.tag === tagId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function getPinFormTag() {
  const active = document.querySelector("#pin-tag-options [data-tag].is-active");
  return active?.dataset.tag || null;
}

function renderPins() {
  els.pinsLayer.innerHTML = "";
  for (const pin of getFilteredPins()) {
    const tag = getPinTag(pin.tag);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `map-pin ${tag?.className || ""}`;
    button.dataset.id = pin.id;
    button.title = pin.title;
    button.setAttribute("aria-label", pin.title);

    button.addEventListener("mouseenter", (event) => {
      highlightPin(pin.id);
      showPreview(pin, event);
    });
    button.addEventListener("mousemove", (event) => movePreview(event));
    button.addEventListener("mouseleave", (event) => {
      scheduleHidePreview();
      if (!editMode) {
        updateProximityHighlight(event.clientX, event.clientY);
      }
    });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openModal(pin);
    });

    els.pinsLayer.appendChild(button);
  }

  updatePinCount();
  positionPins();
}

function positionPins() {
  const buttons = els.pinsLayer.querySelectorAll(".map-pin");
  buttons.forEach((button) => {
    const pin = getFilteredPins().find((item) => item.id === button.dataset.id);
    if (!pin) return;

    button.style.left = `${pin.x}%`;
    button.style.top = `${pin.y}%`;
    button.classList.toggle("is-highlighted", pin.id === highlightedPinId);
  });
}

function renderPinList() {
  els.pinList.innerHTML = "";
  for (const pin of getFilteredPins()) {
    const tag = getPinTag(pin.tag);
    const row = document.createElement("li");
    row.className = "pin-list__row";

    const item = document.createElement("button");
    item.type = "button";
    item.className = "pin-list__item";
    item.dataset.id = pin.id;
    item.innerHTML = `
      <span class="pin-list__title-row">
        <span class="pin-list__title">${escapeHtml(pin.title)}</span>
        <span class="pin-list__tag pin-list__tag--${pin.tag}">${escapeHtml(tag?.label || pin.tag)}</span>
      </span>
      <span class="pin-list__meta">${escapeHtml(pin.description || "No description")}</span>
    `;

    item.addEventListener("click", () => {
      focusPin(pin);
      openModal(pin);
    });

    row.addEventListener("mouseenter", () => highlightPin(pin.id));
    row.addEventListener("mouseleave", () => highlightPin(null));

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "pin-list__edit btn btn--ghost";
    editButton.title = "Edit trick";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      startEditPin(pin);
    });

    row.appendChild(item);
    row.appendChild(editButton);
    els.pinList.appendChild(row);
  }
}

function highlightPin(pinId) {
  const changed = highlightedPinId !== pinId;
  highlightedPinId = pinId;
  positionPins();

  els.pinList.querySelectorAll(".pin-list__row").forEach((row) => {
    const id = row.querySelector(".pin-list__item")?.dataset.id;
    row.classList.toggle("is-active", id === pinId);
  });

  els.pinList.querySelectorAll(".pin-list__item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.id === pinId);
  });

  if (pinId && changed) {
    const item = els.pinList.querySelector(`.pin-list__item[data-id="${pinId}"]`);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function findClosestPin(clientX, clientY) {
  const visiblePins = getFilteredPins();
  if (!mapViewer || visiblePins.length === 0) return null;

  const rect = els.viewport.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  let closest = null;
  let minDist = Infinity;

  for (const pin of visiblePins) {
    const point = mapViewer.mapPercentToScreen(pin.x, pin.y);
    const dist = Math.hypot(point.x - mx, point.y - my);
    if (dist < minDist) {
      minDist = dist;
      closest = pin;
    }
  }

  return minDist <= PIN_HOVER_RADIUS_PX ? closest : null;
}

function updateProximityHighlight(clientX, clientY) {
  const pin = findClosestPin(clientX, clientY);
  highlightPin(pin?.id ?? null);
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
  modalPin = pin;
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
  modalPin = null;
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
  if (panelMode === "add") {
    closeEditPanel();
    return;
  }

  startAddPin();
}

function startAddPin() {
  panelMode = "add";
  editingPinId = null;
  pendingCoords = null;
  editMode = true;

  mapViewer?.setEditMode(true);
  els.editPanel.classList.remove("hidden");
  els.crosshair.classList.add("hidden");
  els.pinForm.reset();
  els.pinCoords.textContent = "No position selected";
  els.btnSavePin.disabled = true;
  els.btnSavePin.textContent = "Save pin";
  setPinFormTag(DEFAULT_PIN_TAG);
  els.editPanelTitle.textContent = "New pin";
  els.editPanelHint.textContent =
    "Click anywhere on the map to place a pin, then fill in the details.";
  updateEditToggleButton();
  highlightPin(null);
}

function startEditPin(pin) {
  if (!pin) return;

  closeModal();
  panelMode = "edit";
  editingPinId = pin.id;
  pendingCoords = { x: pin.x, y: pin.y };
  editMode = true;

  mapViewer?.setEditMode(true);
  els.editPanel.classList.remove("hidden");
  els.pinTitle.value = pin.title;
  els.pinDescription.value = pin.description || "";
  els.pinVideo.value = pin.videoUrl || "";
  els.pinThumbnail.value = pin.thumbnail || "";
  setPinFormTag(pin.tag);
  els.pinCoords.textContent = `Position: ${roundCoord(pin.x)}%, ${roundCoord(pin.y)}%`;
  els.btnSavePin.disabled = false;
  els.btnSavePin.textContent = "Save changes";
  els.editPanelTitle.textContent = "Edit pin";
  els.editPanelHint.textContent = "Update the details below. Click the map to move the pin.";
  updateEditToggleButton();
  highlightPin(pin.id);
  showCrosshairAtPercent(pin.x, pin.y);
  focusPin(pin);
}

function closeEditPanel() {
  panelMode = null;
  editingPinId = null;
  pendingCoords = null;
  editMode = false;

  mapViewer?.setEditMode(false);
  els.editPanel.classList.add("hidden");
  els.crosshair.classList.add("hidden");
  els.pinForm.reset();
  els.pinCoords.textContent = "No position selected";
  els.btnSavePin.disabled = true;
  els.btnSavePin.textContent = "Save pin";
  setPinFormTag(DEFAULT_PIN_TAG);
  updateEditToggleButton();
  highlightPin(null);
}

function updateEditToggleButton() {
  const isOpen = panelMode !== null;
  els.btnToggleEdit.textContent = isOpen ? "Cancel" : "Add pin";
  els.btnToggleEdit.classList.toggle("btn--primary", !isOpen);
  els.btnToggleEdit.classList.toggle("btn--ghost", isOpen);
}

function showCrosshairAtPercent(xPercent, yPercent) {
  const point = mapViewer.mapPercentToScreen(xPercent, yPercent);
  els.crosshair.classList.remove("hidden");
  els.crosshair.style.left = `${point.x}px`;
  els.crosshair.style.top = `${point.y}px`;
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

function onViewportMouseMove(event) {
  if (editMode && pendingCoords) {
    const rect = els.viewport.getBoundingClientRect();
    els.crosshair.style.left = `${event.clientX - rect.left}px`;
    els.crosshair.style.top = `${event.clientY - rect.top}px`;
    return;
  }

  if (editMode || mapViewer?.isDragging || event.target.closest(".map-pin")) {
    return;
  }

  updateProximityHighlight(event.clientX, event.clientY);
}

function onViewportMouseLeave() {
  if (!editMode) {
    highlightPin(null);
  }
}

function onSavePin(event) {
  event.preventDefault();
  if (!pendingCoords) return;

  const tag = getPinFormTag();
  if (!tag) return;

  const pinData = {
    title: els.pinTitle.value.trim(),
    description: els.pinDescription.value.trim(),
    videoUrl: els.pinVideo.value.trim(),
    thumbnail: els.pinThumbnail.value.trim() || undefined,
    tag,
    x: pendingCoords.x,
    y: pendingCoords.y,
  };

  if (panelMode === "edit" && editingPinId) {
    const existing = pins.find((item) => item.id === editingPinId);
    if (!existing) return;

    const updated = upsertUserPin(currentMapId, {
      ...existing,
      ...pinData,
      id: editingPinId,
      mapId: currentMapId,
    });

    pins = mergePins(pinCatalog[currentMapId] || [], loadUserPins(currentMapId));
    renderPins();
    renderPinList();
    closeEditPanel();
    focusPin(updated);
    return;
  }

  const pin = upsertUserPin(currentMapId, {
    id: `user-${Date.now()}`,
    mapId: currentMapId,
    ...pinData,
  });

  pins = mergePins(pinCatalog[currentMapId] || [], loadUserPins(currentMapId));
  renderPins();
  renderPinList();
  closeEditPanel();
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
