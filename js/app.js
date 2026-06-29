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
const TOGGLE_STORAGE_KEY = "hll-climb-overlay-toggles";
const TAG_FILTER_STORAGE_KEY = "hll-climb-tag-filters";

const els = {
  viewport: document.getElementById("map-viewport"),
  stage: document.getElementById("map-stage"),
  image: document.getElementById("map-image"),
  pinsLayer: document.getElementById("map-pins"),
  draftPin: document.getElementById("map-draft-pin"),
  draftArrow: document.getElementById("map-draft-arrow"),
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
  return pins.filter((pin) => isPinTagVisible(pin.tag));
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

function bindUi() {
  document.getElementById("btn-zoom-in").addEventListener("click", () => mapViewer.zoomIn());
  document.getElementById("btn-zoom-out").addEventListener("click", () => mapViewer.zoomOut());
  document.getElementById("btn-reset-view").addEventListener("click", () => mapViewer.resetView());
  document.getElementById("btn-toggle-edit").addEventListener("click", toggleEditMode);
  document.getElementById("btn-cancel-pin").addEventListener("click", () => closeEditPanel());
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
      const nextTag = button.dataset.tag;
      if (!isDirectionalPinTag(nextTag)) {
        pendingDirection = null;
      }
      setPinFormTag(nextTag);
      if (panelMode !== null) {
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
    highlightPin(pin.id);
    showPreview(pin, event);
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
    openModal(pin);
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
      <span class="pin-list__meta">${escapeHtml(pin.description || "No description")}</span>
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
  if (panelMode === "add") {
    closeEditPanel();
    return;
  }

  startAddPin();
}

function setSidebarDefaultVisible(visible) {
  els.sidebarDefault?.classList.toggle("hidden", !visible);
}

function startAddPin() {
  panelMode = "add";
  editingPinId = null;
  pendingCoords = null;
  pendingDirection = null;
  editMode = true;

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
  els.editPanelTitle.textContent = "New pin";
  els.editPanelHint.textContent = getPlacementHint();
  updateEditToggleButton();
  highlightPin(null);
  updateDraftMarker();
  renderPins();
}

function startEditPin(pin) {
  if (!pin || !canModifyPin(pin)) return;

  closeModal();
  panelMode = "edit";
  editingPinId = pin.id;
  pendingCoords = { x: pin.x, y: pin.y };
  pendingDirection =
    pin.tag === "mg-spot" && hasPinDirection(pin)
      ? { x: pin.dirX, y: pin.dirY }
      : null;
  editMode = true;

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
  els.editPanelTitle.textContent = "Edit pin";
  els.editPanelHint.textContent =
    pin.tag === "mg-spot"
      ? getPlacementHint()
      : "Update the details below. Click the map to move the pin.";
  updateEditToggleButton();
  highlightPin(pin.id);
  hidePlacementCrosshair();
  updatePlacementUi();
  updateDraftMarker();
  renderPins();
  focusPin(pin);
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
  els.btnToggleEdit.textContent = isOpen ? "Cancel" : "Add pin";
  els.btnToggleEdit.classList.toggle("btn--primary", !isOpen);
  els.btnToggleEdit.classList.toggle("btn--ghost", isOpen);
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
      pendingDirection = null;
      pendingCoords = null;
    } else if (pendingDirection) {
      pendingCoords = point;
    } else {
      pendingDirection = point;
    }
  } else {
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
    if (isMgSpotPlacement() && pendingDirection && !pendingCoords) {
      const coords = mapViewer.screenToMapPercent(event.clientX, event.clientY);
      if (coords.x >= 0 && coords.y >= 0 && coords.x <= 100 && coords.y <= 100) {
        updateDraftMarker({
          x: roundCoord(coords.x),
          y: roundCoord(coords.y),
        });
      }
    }
    return;
  }

  if (editMode || mapViewer?.isDragging || event.target.closest(".map-pin, .map-mg-spot")) {
    return;
  }

  updateProximityHighlight(event.clientX, event.clientY);
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
  if (!isSupportedVideoUrl(videoUrl)) {
    els.pinVideo.setCustomValidity(getUnsupportedVideoUrlMessage());
    els.pinVideo.reportValidity();
    return;
  }
  els.pinVideo.setCustomValidity("");

  const pinData = {
    title: els.pinTitle.value.trim(),
    description: els.pinDescription.value.trim(),
    videoUrl,
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
      const updated = pins.find((item) => item.id === editingPinId);
      closeEditPanel();
      if (updated) focusPin(updated);
      return;
    }

    const created = await createPin(currentMapId, pinData);
    await reloadPinsForMap(currentMapId);
    closeEditPanel();
    const pin = pins.find((item) => item.id === created.id);
    if (pin) focusPin(pin);
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
