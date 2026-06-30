import { MapViewer } from "./map-viewer.js";
import { MapOverlays } from "./map-overlays.js";
import { initAdminPanel } from "./admin-panel.js";
import { initAuth, getCurrentUser, loadProtectedPins } from "./auth.js";
import { createPin, deletePin, fetchPinsCatalog, updatePin } from "./pin-api.js";
import { resolveMedalClip } from "./medal.js";
import {
  DEFAULT_PIN_TAG,
  getPinTag,
  isDirectionalPinTag,
  normalizePinTag,
  PIN_TAGS,
} from "./pin-tags.js";
import { hasPinDirection, renderDraftMgSpot, renderMgSpotGroup } from "./mg-spot.js";
import {
  createVideoElement,
  isMedalUrl,
  isPlayableDirectUrl,
  getUnsupportedVideoUrlMessage,
  isSupportedVideoUrl,
  normalizeVideoUrl,
  youtubeThumbnail,
} from "./video-utils.js";

const MAP_STORAGE_KEY = "hll-climb-selected-map";
const TOGGLE_STORAGE_KEY = "hll-climb-overlay-tchoggles";
const TAG_FILTER_STORAGE_KEY = "hll-climb-tag-filters";
const FACTION_FILTER_STORAGE_KEY = "hll-climb-faction-filters";

const els = {
  viewport: document.getElementById("map-viewport"),
  stage: document.getElementById("map-stage"),
  image: document.getElementById("map-image"),
  pinsLayer: document.getElementById("map-pins"),
  draftPin: document.getElementById("map-draft-pin"),
  draftArrow: document.getElementById("map-draft-arrow"),
  pinList: document.getElementById("pin-list"),
  pinSearch: document.getElementById("pin-search"),
  zoomLabel: document.getElementById("zoom-label"),
  previewTooltip: document.getElementById("preview-tooltip"),
  previewMedia: document.getElementById("preview-media"),
  previewTitle: document.getElementById("preview-title"),
  previewDescription: document.getElementById("preview-description"),
  modal: document.getElementById("video-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalDescription: document.getElementById("modal-description"),
  modalUploader: document.getElementById("modal-uploader"),
  modalPlayer: document.getElementById("modal-player"),
  editPanel: document.getElementById("edit-panel"),
  sidebarDefault: document.getElementById("sidebar-default"),
  editPanelTitle: document.getElementById("edit-panel-title"),
  editPanelHint: document.getElementById("edit-panel-hint"),
  pinForm: document.getElementById("pin-form"),
  pinCoords: document.getElementById("pin-coords"),
  crosshair: document.getElementById("map-crosshair"),
  btnSavePin: document.getElementById("btn-save-pin"),
  btnDeletePin: document.getElementById("btn-delete-pin"),
  btnToggleEdit: document.getElementById("btn-toggle-edit"),
  btnEditModal: document.getElementById("btn-edit-modal"),
  pinTitle: document.getElementById("pin-title"),
  pinDescription: document.getElementById("pin-description"),
  pinVideo: document.getElementById("pin-video"),
  pinThumbnail: document.getElementById("pin-thumbnail"),
  pinPositionCode: document.getElementById("pin-position-code"),
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
let pendingDirection = null;
let highlightedPinId = null;
let previewHideTimer = null;
let positionHistory = [];
let redoHistory = [];
const MAX_POSITION_HISTORY = 10;
let tagFilters = loadTagFilters();
let currentFaction = loadCurrentFaction();
let searchQuery = "";

const PIN_HOVER_RADIUS_PX = 42;
const MG_SPOT_HOVER_RADIUS_PX = 42;

async function init() {
  const auth = await initAuth();
  if (!auth.ok) return;

  const [spawnData, pinData] = await Promise.all([loadSpawnData(), loadProtectedPins()]);
  mapCatalog = spawnData.maps || [];
  pinCatalog = pinData.pins || {};
  currentMapId = loadSelectedMapId(pinData.defaultMapId);

  populateMapSelect();
  applyTagFiltersToUi();
  applyFactionFiltersToUi();
  bindUi();
  initAdminPanel();
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
  let visible = pins.filter((pin) => isPinTagVisible(pin.tag));
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    visible = visible.filter((pin) => pin.title.toLowerCase().includes(q));
  }
  return visible.sort((a, b) => {
    const sortY = (pin) => (pin.tag === "mg-spot" && hasPinDirection(pin) ? pin.dirY : pin.y);
    return sortY(a) - sortY(b);
  });
}

function getMapPins() {
  let visible = getFilteredPins();
  if (panelMode === "edit" && editingPinId) {
    visible = visible.filter((pin) => pin.id !== editingPinId);
  }
  return visible;
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

  searchQuery = "";
  els.pinSearch.value = "";

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
  pins = (pinCatalog[mapId] || []).map(normalizePin);
  renderPins();
  renderPinList();

  if (fit) {
    mapViewer.fitToView();
  } else {
    mapViewer.clampTranslation();
    mapViewer.applyTransform();
  }
}

function canModifyPin(pin) {
  const user = getCurrentUser();
  if (!user || !pin) return false;
  if (user.role === "admin" || user.role === "owner") return true;
  return pin.createdBy === user.steamId;
}

function getPinUploaderLabel(pin) {
  if (!pin?.createdBy) {
    return null;
  }
  return pin.createdByName || `Steam user ${pin.createdBy}`;
}

async function reloadPinsForMap(mapId = currentMapId) {
  const data = await fetchPinsCatalog();
  pinCatalog = data.pins || {};
  pins = (pinCatalog[mapId] || []).map(normalizePin);
  renderPins();
  renderPinList();
}

function waitForImage(image) {
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
  });
}

function onKeyDown(event) {
  // Ctrl+W or Ctrl+Z: undo position change during edit mode
  const isUndo = event.ctrlKey && (event.key === "w" || event.key === "W" || event.code === "KeyW" || event.key === "z" || event.key === "Z" || event.code === "KeyZ");
  if (isUndo) {
    event.preventDefault();
    event.stopPropagation();
    if (editMode && popPositionSnapshot()) {
      els.pinCoords.textContent = "Undo: reverted to previous position";
    }
    return;
  }
  // Ctrl+Y: redo position change during edit mode
  if (event.ctrlKey && (event.key === "y" || event.key === "Y" || event.code === "KeyY")) {
    event.preventDefault();
    event.stopPropagation();
    if (editMode && popRedoSnapshot()) {
      els.pinCoords.textContent = "Redo: reapplied position";
    }
  }
}

function bindUi() {
  // Use window capture so Ctrl+Z/Y works even when focused on input fields
  window.addEventListener("keydown", onKeyDown, { capture: true });

  document.getElementById("btn-zoom-in").addEventListener("click", () => mapViewer.zoomIn());
  document.getElementById("btn-zoom-out").addEventListener("click", () => mapViewer.zoomOut());
  document.getElementById("btn-reset-view").addEventListener("click", () => mapViewer.resetView());
  document.getElementById("btn-toggle-edit").addEventListener("click", toggleEditMode);
  document.getElementById("btn-cancel-pin").addEventListener("click", () => closeEditPanel());

  // User dropdown toggle
  const userTrigger = document.getElementById("header-user-trigger");
  const userMenu = document.getElementById("header-user-menu");
  if (userTrigger && userMenu) {
    userTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = !userMenu.classList.contains("hidden");
      userMenu.classList.toggle("hidden", isOpen);
      userTrigger.setAttribute("aria-expanded", String(!isOpen));
    });
    document.addEventListener("click", (event) => {
      if (!userTrigger.contains(event.target) && !userMenu.contains(event.target)) {
        userMenu.classList.add("hidden");
        userTrigger.setAttribute("aria-expanded", "false");
      }
    });
  }
  els.btnDeletePin?.addEventListener("click", onDeletePin);
  document.getElementById("btn-close-modal").addEventListener("click", closeModal);
  els.btnEditModal.addEventListener("click", () => {
    if (modalPin) startEditPin(modalPin);
  });
  els.modal.addEventListener("close", clearModalPlayer);
  els.pinForm.addEventListener("submit", onSavePin);

  els.viewport.addEventListener("click", onViewportClick);
  els.viewport.addEventListener("contextmenu", onViewportContextMenu);
  els.viewport.addEventListener("mousemove", onViewportMouseMove);
  els.viewport.addEventListener("mouseleave", onViewportMouseLeave);

  els.mapSelect.addEventListener("change", (event) => {
    switchMap(event.target.value, { fit: true });
  });

  els.pinSearch.addEventListener("input", (event) => {
    searchQuery = event.target.value;
    renderPins();
    renderPinList();
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

  document.querySelectorAll("#sidebar-faction-bar [data-faction], #edit-faction-bar [data-faction]").forEach((button) => {
    button.addEventListener("click", () => {
      const faction = button.dataset.faction;
      if (faction === currentFaction) return;
      currentFaction = faction;
      saveCurrentFaction();
      applyFactionFiltersToUi();
    });
  });

  document.querySelectorAll("#pin-tag-options [data-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTag = button.dataset.tag;
      if (!isDirectionalPinTag(nextTag)) {
        pendingDirection = null;
      }
      setPinFormTag(nextTag);
      if (panelMode !== null && els.editPanelHint) {
        els.editPanelHint.textContent = getPlacementHint();
      }
      updatePlacementUi();
      updateDraftMarker();
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

function loadCurrentFaction() {
  try {
    const saved = localStorage.getItem(FACTION_FILTER_STORAGE_KEY);
    if (saved && ["axis", "neutral", "allies"].includes(saved)) return saved;
  } catch {
    // fall through
  }
  return "neutral";
}

function saveCurrentFaction() {
  localStorage.setItem(FACTION_FILTER_STORAGE_KEY, currentFaction);
}

function applyFactionFiltersToUi() {
  document.querySelectorAll("#sidebar-faction-bar, #edit-faction-bar").forEach((bar) => {
    if (!bar) return;
    bar.dataset.currentFaction = currentFaction;
    bar.querySelectorAll("[data-faction]").forEach((button) => {
      const active = button.dataset.faction === currentFaction;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  });
}

function updatePinCount() {
  const filtered = getFilteredPins();
  const mapName = currentMap?.name || "this map";
  const total = pins.length;
  let text;

  if (total === 0) {
    text = `No tricks on ${mapName}`;
  } else if (filtered.length === 0) {
    text = `No tricks visible on ${mapName} — enable a tag`;
  } else if (filtered.length === total) {
    text = `${filtered.length} spot${filtered.length === 1 ? "" : "s"} on ${mapName}`;
  } else {
    text = `${filtered.length} of ${total} spots on ${mapName}`;
  }

  els.pinSearch.placeholder = text;
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

function isMgSpotPlacement() {
  return isDirectionalPinTag(getPinFormTag() || DEFAULT_PIN_TAG);
}

function isPlacementComplete() {
  if (isMgSpotPlacement()) return Boolean(pendingCoords) && Boolean(pendingDirection);
  return Boolean(pendingCoords);
}

function getPlacementHint() {
  if (isMgSpotPlacement()) {
    return "1st click: arrowhead. 2nd click: bar + line. 3rd click: reset. 4th click: restart.";
  }
  return "Move the crosshair over the map and click to place a pin, then fill in the details.";
}

function updatePlacementUi() {
  updatePositionCode();
  if (!pendingCoords) {
    els.pinCoords.textContent = "No position selected";
    els.btnSavePin.disabled = true;
    return;
  }

  if (isMgSpotPlacement()) {
    if (!pendingDirection) {
      els.btnSavePin.disabled = true;
      els.pinCoords.textContent = "No position selected";
      return;
    }
    if (!pendingCoords) {
      els.pinCoords.textContent = `Arrowhead: ${pendingDirection.x}%, ${pendingDirection.y}% — click again for the bar`;
      els.btnSavePin.disabled = true;
      return;
    }
    els.pinCoords.textContent = `Arrowhead: ${pendingDirection.x}%, ${pendingDirection.y}% · Bar: ${pendingCoords.x}%, ${pendingCoords.y}%`;
    els.btnSavePin.disabled = false;
    return;
  }

  els.pinCoords.textContent = `Position: ${pendingCoords.x}%, ${pendingCoords.y}%`;
  els.btnSavePin.disabled = false;
}

function ensureDraftPinIcon(tagId) {
  const existingIcon = els.draftPin.querySelector(".map-pin__icon");
  if (existingIcon) existingIcon.remove();
  const icon = document.createElement("i");
  icon.className = "fa-solid map-pin__icon";
  if (tagId === "mg-spot") {
    icon.classList.add("fa-play");
  } else {
    icon.classList.add("fa-map-pin");
  }
  els.draftPin.appendChild(icon);
}

function updateDraftMarker(previewTip = null) {
  if (panelMode === null) {
    els.draftPin?.classList.add("hidden");
    renderDraftMgSpot(els.draftArrow, null, null);
    return;
  }

  if (isMgSpotPlacement()) {
    els.draftPin?.classList.add("hidden");
    if (pendingCoords && pendingDirection) {
      renderDraftMgSpot(els.draftArrow, pendingCoords, pendingDirection);
    } else if (pendingDirection) {
      renderDraftMgSpot(els.draftArrow, previewTip || pendingCoords, pendingDirection, {
        preview: Boolean(previewTip && !pendingCoords),
      });
    } else {
      renderDraftMgSpot(els.draftArrow, null, null);
    }
    return;
  }

  if (!pendingCoords) {
    els.draftPin?.classList.add("hidden");
    renderDraftMgSpot(els.draftArrow, null, null);
    return;
  }

  renderDraftMgSpot(els.draftArrow, null, null);
  const tagId = getPinFormTag() || DEFAULT_PIN_TAG;
  const tag = getPinTag(tagId);
  els.draftPin.className = `map-pin map-pin--draft ${tag?.className || ""}`;
  els.draftPin.style.left = `${pendingCoords.x}%`;
  els.draftPin.style.top = `${pendingCoords.y}%`;
  ensureDraftPinIcon(tagId);
  els.draftPin.classList.remove("hidden");
}

function updateDraftPin() {
  updateDraftMarker();
}

function hidePlacementCrosshair() {
  els.crosshair.classList.add("hidden");
}

function showPlacementCrosshairAtScreen(x, y) {
  const rect = els.viewport.getBoundingClientRect();
  els.crosshair.classList.remove("hidden");
  els.crosshair.style.left = `${x - rect.left}px`;
  els.crosshair.style.top = `${y - rect.top}px`;
}

function attachPinInteractions(element, pin) {
  element.addEventListener("mouseenter", (event) => {
    // In edit mode, don't highlight other entries
    if (!editMode) {
      highlightPin(pin.id);
      showPreview(pin, event);
    }
  });
  element.addEventListener("mousemove", (event) => movePreview(event));
  element.addEventListener("mouseleave", (event) => {
    scheduleHidePreview();
    if (!editMode) {
      updateProximityHighlight(event.clientX, event.clientY);
    }
  });
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    if (editMode) {
      // Clicking on the map to edit — don't zoom in
      startEditPin(pin, { focus: false });
    } else {
      openModal(pin);
    }
  });
}

function renderPins() {
  els.pinsLayer.innerHTML = "";

  const mgPins = [];
  for (const pin of getMapPins()) {
    if (pin.tag === "mg-spot" && hasPinDirection(pin)) {
      mgPins.push(pin);
      continue;
    }

    const tag = getPinTag(pin.tag);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `map-pin ${tag?.className || ""}`;
    button.dataset.id = pin.id;
    button.title = pin.title;
    button.setAttribute("aria-label", pin.title);

    const icon = document.createElement("i");
    icon.className = "fa-solid map-pin__icon";
    if (pin.tag === "mg-spot") {
      icon.classList.add("fa-play");
    } else {
      icon.classList.add("fa-map-pin");
    }
    button.appendChild(icon);

    attachPinInteractions(button, pin);
    els.pinsLayer.appendChild(button);
  }

  if (mgPins.length > 0) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "map-mg-spots-layer");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");

    for (const pin of mgPins) {
      const group = renderMgSpotGroup(pin, {
        highlighted: pin.id === highlightedPinId,
      });
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", "0");
      group.setAttribute("aria-label", pin.title);
      attachPinInteractions(group, pin);
      svg.appendChild(group);
    }

    els.pinsLayer.appendChild(svg);
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

  els.pinsLayer.querySelectorAll(".map-mg-spot").forEach((group) => {
    group.classList.toggle("is-highlighted", group.dataset.id === highlightedPinId);
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
    const uploader = getPinUploaderLabel(pin);
    item.innerHTML = `
      <span class="pin-list__title-row">
        <span class="pin-list__title">${escapeHtml(pin.title)}</span>
        <span class="pin-list__tag pin-list__tag--${pin.tag}">${escapeHtml(tag?.label || pin.tag)}</span>
      </span>
      ${uploader ? `<span class="pin-list__uploader">Added by ${escapeHtml(uploader)}</span>` : ""}
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
    if (canModifyPin(pin)) {
      row.appendChild(editButton);
    }
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
    // For MG spots, check distance to the triangle head (dirX/dirY)
    // rather than the base (x/y), since the triangle is what users aim at.
    let checkX = pin.x;
    let checkY = pin.y;
    if (pin.tag === "mg-spot" && hasPinDirection(pin)) {
      checkX = pin.dirX;
      checkY = pin.dirY;
    }
    const point = mapViewer.mapPercentToScreen(checkX, checkY);
    const dist = Math.hypot(point.x - mx, point.y - my);
    if (dist < minDist) {
      minDist = dist;
      closest = pin;
    }
  }

  // Scale the hover radius by zoom so it feels consistent at all zoom levels.
  const baseRadius = closest?.tag === "mg-spot" ? MG_SPOT_HOVER_RADIUS_PX : PIN_HOVER_RADIUS_PX;
  const scaledRadius = baseRadius * mapViewer.scale;
  return minDist <= scaledRadius ? closest : null;
}

function updateProximityHighlight(clientX, clientY) {
  const pin = findClosestPin(clientX, clientY);
  highlightPin(pin?.id ?? null);
}

function focusPin(pin) {
  const rect = els.viewport.getBoundingClientRect();
  const imgW = els.image.naturalWidth;
  const imgH = els.image.naturalHeight;

  // For MG spots with direction, focus on the arrowhead (dirX/dirY) instead of the tail
  let focusX = pin.x;
  let focusY = pin.y;
  if (pin.tag === "mg-spot" && hasPinDirection(pin)) {
    focusX = pin.dirX;
    focusY = pin.dirY;
  }

  mapViewer.scale = Math.min(2.2, mapViewer.clampScale(1.0));
  mapViewer.translateX = rect.width / 2 - (focusX / 100) * imgW * mapViewer.scale;
  mapViewer.translateY = rect.height / 2 - (focusY / 100) * imgH * mapViewer.scale;
  mapViewer.clampTranslation();
  mapViewer.applyTransform();
  highlightPin(pin.id);
}

async function getPinPlayback(pin) {
  let playbackUrl = normalizeVideoUrl(pin.videoUrl);
  let thumbnail = pin.thumbnail || youtubeThumbnail(playbackUrl);

  if (isMedalUrl(pin.videoUrl)) {
    const medal = await resolveMedalClip(pin.videoUrl);
    playbackUrl = medal.contentUrl;
    thumbnail = thumbnail || medal.thumbnailUrl;
  }

  return { playbackUrl, thumbnail };
}

function showPreview(pin, event) {
  clearTimeout(previewHideTimer);
  els.previewTitle.textContent = pin.title;
  els.previewDescription.textContent = pin.description || "";
  els.previewMedia.innerHTML = '<p class="preview-loading">Loading clip…</p>';
  els.previewTooltip.classList.remove("hidden");
  movePreview(event);

  const previewPinId = pin.id;
  loadPreviewMedia(pin, previewPinId);
}

async function loadPreviewMedia(pin, previewPinId) {
  try {
    const { playbackUrl, thumbnail } = await getPinPlayback(pin);
    if (highlightedPinId !== previewPinId) return;

    els.previewMedia.innerHTML = "";
    if (thumbnail) {
      const img = document.createElement("img");
      img.src = thumbnail;
      img.alt = `${pin.title} preview`;
      els.previewMedia.appendChild(img);
    } else if (isPlayableDirectUrl(playbackUrl)) {
      const video = createVideoElement(playbackUrl, {
        autoplay: true,
        muted: true,
        controls: false,
      });
      video.loop = true;
      els.previewMedia.appendChild(video);
    } else {
      const iframe = createVideoElement(playbackUrl, { autoplay: true, muted: true });
      els.previewMedia.appendChild(iframe);
    }
  } catch (error) {
    console.warn(error);
    if (highlightedPinId !== previewPinId) return;
    els.previewMedia.innerHTML =
      '<p class="preview-error">Could not load Medal.tv clip. Open the link on medal.tv instead.</p>';
  }
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
  const uploader = getPinUploaderLabel(pin);
  if (uploader && els.modalUploader) {
    els.modalUploader.textContent = `Added by ${uploader}`;
    els.modalUploader.classList.remove("hidden");
  } else if (els.modalUploader) {
    els.modalUploader.textContent = "";
    els.modalUploader.classList.add("hidden");
  }
  els.btnEditModal.classList.toggle("hidden", !canModifyPin(pin));
  els.modalPlayer.innerHTML = '<p class="preview-loading">Loading clip…</p>';
  els.modal.showModal();
  loadModalPlayer(pin);
}

async function loadModalPlayer(pin) {
  try {
    const { playbackUrl } = await getPinPlayback(pin);
    if (modalPin?.id !== pin.id) return;

    els.modalPlayer.innerHTML = "";
    const player = createVideoElement(playbackUrl, {
      autoplay: true,
      muted: false,
      controls: true,
    });
    els.modalPlayer.appendChild(player);
  } catch (error) {
    console.warn(error);
    if (modalPin?.id !== pin.id) return;
    els.modalPlayer.innerHTML = `
      <p class="preview-error">Could not load Medal.tv clip.</p>
      <p><a href="${escapeHtml(pin.videoUrl)}" target="_blank" rel="noopener noreferrer">Open on Medal.tv</a></p>
    `;
  }
}

function closeModal() {
  els.modal.close();
  if (document.activeElement?.classList?.contains("map-mg-spot")) {
    document.activeElement.blur();
  }
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
  if (panelMode !== null) {
    closeEditPanel();
    return;
  }

  startAddPin();
}

function setSidebarDefaultVisible(visible) {
  els.sidebarDefault?.classList.toggle("hidden", !visible);
}

function startAddPin() {
  positionHistory = [];
  panelMode = "add";
  editingPinId = null;
  pendingCoords = null;
  pendingDirection = null;
  editMode = true;

  hidePreviewImmediately();
  setSidebarDefaultVisible(false);
  mapViewer?.setEditMode(true);
  els.editPanel.classList.remove("hidden");
  hidePlacementCrosshair();
  els.draftPin?.classList.add("hidden");
  renderDraftMgSpot(els.draftArrow, null, null);
  els.pinForm.reset();
  els.pinCoords.textContent = "No position selected";
  els.btnSavePin.disabled = true;
  els.btnSavePin.textContent = "Save pin";
  els.btnDeletePin?.classList.add("hidden");
  setPinFormTag(DEFAULT_PIN_TAG);
  els.editPanelTitle.textContent = "EDITOR MODE";
  if (els.editPanelHint) els.editPanelHint.textContent = "";
  updateEditToggleButton();
  highlightPin(null);
  updateDraftMarker();
  renderPins();
}

function startEditPin(pin, { focus = true } = {}) {
  if (!pin || !canModifyPin(pin)) return;

  positionHistory = [];
  hidePreviewImmediately();
  closeModal();
  panelMode = "edit";
  editingPinId = pin.id;
  pendingCoords = { x: pin.x, y: pin.y };
  pendingDirection =
    pin.tag === "mg-spot" && hasPinDirection(pin)
      ? { x: pin.dirX, y: pin.dirY }
      : null;
  editMode = true;

  setSidebarDefaultVisible(false);
  mapViewer?.setEditMode(true);
  els.editPanel.classList.remove("hidden");
  els.pinTitle.value = pin.title;
  els.pinDescription.value = pin.description || "";
  els.pinVideo.value = pin.videoUrl || "";
  els.pinThumbnail.value = pin.thumbnail || "";
  setPinFormTag(pin.tag);
  els.btnSavePin.disabled = !isPlacementComplete();
  els.btnSavePin.textContent = "Save changes";
  els.btnDeletePin?.classList.remove("hidden");
  els.editPanelTitle.textContent = "EDITOR MODE";
  if (els.editPanelHint) els.editPanelHint.textContent = "";
  updateEditToggleButton();
  highlightPin(pin.id);
  hidePlacementCrosshair();
  updatePlacementUi();
  updateDraftMarker();
  renderPins();
  if (focus) {
    focusPin(pin);
  }
}

function closeEditPanel() {
  panelMode = null;
  editingPinId = null;
  pendingCoords = null;
  pendingDirection = null;
  editMode = false;

  setSidebarDefaultVisible(true);
  mapViewer?.setEditMode(false);
  els.editPanel.classList.add("hidden");
  hidePlacementCrosshair();
  els.pinForm.reset();
  els.pinCoords.textContent = "No position selected";
  els.btnSavePin.disabled = true;
  els.btnSavePin.textContent = "Save pin";
  els.btnDeletePin?.classList.add("hidden");
  setPinFormTag(DEFAULT_PIN_TAG);
  updateEditToggleButton();
  highlightPin(null);
  updateDraftMarker();
  renderPins();
}

function updateEditToggleButton() {
  const isOpen = panelMode !== null;
  if (isOpen) {
    els.btnToggleEdit.textContent = "Cancel Edit";
    els.btnToggleEdit.style.background = "transparent";
    els.btnToggleEdit.style.borderColor = "var(--border)";
    els.btnToggleEdit.style.color = "#e8ebe6";
  } else {
    els.btnToggleEdit.textContent = "Editor Mode";
    els.btnToggleEdit.style.background = "";
    els.btnToggleEdit.style.borderColor = "";
    els.btnToggleEdit.style.color = "";
  }
  els.btnToggleEdit.classList.toggle("btn--primary", !isOpen);
  els.btnToggleEdit.classList.toggle("btn--ghost", isOpen);
}

function pushPositionSnapshot() {
  // Any new action clears the redo stack
  redoHistory = [];
  positionHistory.push({
    coords: pendingCoords ? { ...pendingCoords } : null,
    direction: pendingDirection ? { ...pendingDirection } : null,
  });
  if (positionHistory.length > MAX_POSITION_HISTORY) {
    positionHistory.shift();
  }
}

function popPositionSnapshot() {
  if (positionHistory.length === 0) return false;
  // Push current state onto redo stack before undoing
  redoHistory.push({
    coords: pendingCoords ? { ...pendingCoords } : null,
    direction: pendingDirection ? { ...pendingDirection } : null,
  });
  if (redoHistory.length > MAX_POSITION_HISTORY) {
    redoHistory.shift();
  }
  const snap = positionHistory.pop();
  pendingCoords = snap.coords;
  pendingDirection = snap.direction;
  updatePlacementUi();
  hidePlacementCrosshair();
  updateDraftMarker();
  return true;
}

function popRedoSnapshot() {
  if (redoHistory.length === 0) return false;
  // Push current state back onto undo stack
  positionHistory.push({
    coords: pendingCoords ? { ...pendingCoords } : null,
    direction: pendingDirection ? { ...pendingDirection } : null,
  });
  if (positionHistory.length > MAX_POSITION_HISTORY) {
    positionHistory.shift();
  }
  const snap = redoHistory.pop();
  pendingCoords = snap.coords;
  pendingDirection = snap.direction;
  updatePlacementUi();
  hidePlacementCrosshair();
  updateDraftMarker();
  return true;
}

function onViewportClick(event) {
  if (!editMode) return;
  if (event.target.closest(".map-pin:not(.map-pin--draft), .map-mg-spot:not(.map-mg-spot--draft)")) {
    return;
  }

  const coords = mapViewer.screenToMapPercent(event.clientX, event.clientY);
  if (coords.x < 0 || coords.y < 0 || coords.x > 100 || coords.y > 100) return;

  const point = {
    x: roundCoord(coords.x),
    y: roundCoord(coords.y),
  };

  if (isMgSpotPlacement()) {
    if (pendingDirection && pendingCoords) {
      // 3rd click: reset — do NOT push snapshot (would create an extra undo step)
      pendingDirection = null;
      pendingCoords = null;
    } else if (pendingDirection) {
      // 2nd click: set the bar — save snapshot then advance
      pushPositionSnapshot();
      pendingCoords = point;
    } else {
      // 1st click: set arrowhead — save snapshot then advance
      pushPositionSnapshot();
      pendingDirection = point;
    }
  } else {
    pushPositionSnapshot();
    pendingCoords = point;
    pendingDirection = null;
  }

  updatePlacementUi();
  hidePlacementCrosshair();
  updateDraftMarker();
}

function cancelMgSpotHeadPlacement() {
  pendingDirection = null;
  pendingCoords = null;
  updatePlacementUi();
  updateDraftMarker();
}

function onViewportContextMenu(event) {
  if (!editMode || !isMgSpotPlacement() || !pendingDirection || pendingCoords) {
    return;
  }

  event.preventDefault();
  cancelMgSpotHeadPlacement();
}

function shouldShowPlacementCrosshair() {
  if (!editMode) return false;
  if (isMgSpotPlacement()) return pendingDirection && !pendingCoords;
  return !pendingCoords;
}

function onViewportMouseMove(event) {
  if (shouldShowPlacementCrosshair()) {
    showPlacementCrosshairAtScreen(event.clientX, event.clientY);
    const coords = mapViewer.screenToMapPercent(event.clientX, event.clientY);
    if (coords.x >= 0 && coords.y >= 0 && coords.x <= 100 && coords.y <= 100) {
      if (isMgSpotPlacement() && pendingDirection && !pendingCoords) {
        updateDraftMarker({
          x: roundCoord(coords.x),
          y: roundCoord(coords.y),
        });
      }
    }
    return;
  }

  if (editMode || mapViewer?.isDragging || event.target.closest(".map-pin")) {
    return;
  }

  const prevHighlighted = highlightedPinId;
  updateProximityHighlight(event.clientX, event.clientY);

  // Proximity detected a new pin — show the preview tooltip too,
  // so both the stroke highlight and panel open at the same distance.
  if (highlightedPinId && highlightedPinId !== prevHighlighted) {
    const pin = getFilteredPins().find((p) => p.id === highlightedPinId);
    showPreview(pin, event);
  }

  // Proximity cleared — hide the preview
  if (!highlightedPinId && prevHighlighted) {
    scheduleHidePreview();
  }
}

function onViewportMouseLeave() {
  if (shouldShowPlacementCrosshair()) {
    hidePlacementCrosshair();
    if (isMgSpotPlacement() && pendingDirection && !pendingCoords) {
      updateDraftMarker();
    }
    return;
  }

  if (!editMode) {
    highlightPin(null);
  }
}

function onSavePin(event) {
  event.preventDefault();
  if (!isPlacementComplete()) return;

  const tag = getPinFormTag();
  if (!tag) return;

  const videoUrl = normalizeVideoUrl(els.pinVideo.value);
  if (videoUrl && !isSupportedVideoUrl(videoUrl)) {
    els.pinVideo.setCustomValidity(getUnsupportedVideoUrlMessage());
    els.pinVideo.reportValidity();
    return;
  }
  els.pinVideo.setCustomValidity("");

  const pinData = {
    title: els.pinTitle.value.trim(),
    description: els.pinDescription.value.trim(),
    videoUrl: videoUrl || undefined,
    thumbnail: els.pinThumbnail.value.trim() || undefined,
    tag,
    x: pendingCoords.x,
    y: pendingCoords.y,
  };

  if (isDirectionalPinTag(tag)) {
    pinData.dirX = pendingDirection.x;
    pinData.dirY = pendingDirection.y;
  }

  void savePin(pinData);
}

async function savePin(pinData) {
  els.btnSavePin.disabled = true;

  try {
    if (panelMode === "edit" && editingPinId) {
      const existing = pins.find((item) => item.id === editingPinId);
      if (!existing || !canModifyPin(existing)) return;

      await updatePin(currentMapId, editingPinId, pinData);
      await reloadPinsForMap(currentMapId);
      // Reset for a new pin entry instead of closing editor mode
      startAddPin();
      return;
    }

    await createPin(currentMapId, pinData);
    await reloadPinsForMap(currentMapId);
    // Reset for a new pin entry instead of closing editor mode
    startAddPin();
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not save trick");
    els.btnSavePin.disabled = false;
  }
}

async function onDeletePin() {
  if (panelMode !== "edit" || !editingPinId) return;

  const existing = pins.find((item) => item.id === editingPinId);
  if (!existing || !canModifyPin(existing)) return;

  if (!window.confirm(`Delete "${existing.title}"? This cannot be undone.`)) {
    return;
  }

  els.btnDeletePin && (els.btnDeletePin.disabled = true);

  try {
    await deletePin(currentMapId, editingPinId);
    await reloadPinsForMap(currentMapId);
    closeEditPanel();
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not delete trick");
  } finally {
    if (els.btnDeletePin) {
      els.btnDeletePin.disabled = false;
    }
  }
}

function generatePositionCode(x, y) {
  const letterIndex = Math.min(Math.floor(x / 10), 25);
  const letter = String.fromCharCode(65 + letterIndex);
  const row = Math.min(Math.floor(y / 10), 9) + 1;
  const random = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `#${letter}${row}-${random}`;
}

function updatePositionCode() {
  if (!pendingCoords && !pendingDirection) {
    els.pinPositionCode.value = "";
  } else if (isMgSpotPlacement() && pendingDirection) {
    if (!pendingCoords) {
      // First click (arrowhead) — generate new code
      els.pinPositionCode.value = generatePositionCode(pendingDirection.x, pendingDirection.y);
    }
    // Second click (tail) or edit mode — leave existing value unchanged
  } else if (pendingCoords) {
    els.pinPositionCode.value = generatePositionCode(pendingCoords.x, pendingCoords.y);
  }
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
