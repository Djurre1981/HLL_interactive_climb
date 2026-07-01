import { MapViewer } from "./ui/map-viewer.js";
import { MapOverlays } from "./ui/map-overlays.js";
import { initAdminPanel } from "./ui/admin-panel.js";
import { initAuth, loadProtectedPins } from "./ui/auth-gate.js";
import { fetchPinsCatalog } from "./api/pins.js";
import { loadSpawnData } from "./api/maps.js";
import { state, loadSelectedMapId, saveSelectedMapId } from "./state.js";
import {
  loadTagFilters,
  applyTagFiltersToUi,
  applyFactionFiltersToUi,
  loadCurrentFaction,
  normalizePin,
  getFilteredPins,
} from "./ui/filter-bar.js";
import { populateMapSelect } from "./ui/map-picker.js";
import { renderPins } from "./ui/pin-marker.js";
import { renderPinList } from "./ui/sidebar.js";
import { exitEditorMode, updateZoomLabel } from "./ui/pin-editor.js";
import { highlightPin } from "./helpers/proximity.js";
import { initUndoRedoKeyboard } from "./editor/undo-redo.js";
import { applyToggleStateToUi, applyToggleStateToOverlays } from "./ui/toggles.js";
import { bindUi } from "./bind-ui.js";

function waitForImage(image) {
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
  });
}

async function reloadPinsForMap(mapId = state.currentMapId) {
  const data = await fetchPinsCatalog();
  state.pinCatalog = data.pins || {};
  state.pins = (state.pinCatalog[mapId] || []).map(normalizePin);
  renderPins();
  renderPinList();
}

function onTagFiltersChanged() {
  if (state.highlightedPinId && !getFilteredPins().some((pin) => pin.id === state.highlightedPinId)) {
    highlightPin(null);
  }
  renderPins();
  renderPinList();
}

async function init() {
  state.tagFilters = loadTagFilters();
  state.currentFaction = loadCurrentFaction();

  const auth = await initAuth();
  if (!auth.ok) return;

  const [spawnData, pinData] = await Promise.all([loadSpawnData(), loadProtectedPins()]);
  state.mapCatalog = spawnData.maps || [];
  state.pinCatalog = pinData.pins || {};
  state.currentMapId = loadSelectedMapId(pinData.defaultMapId);

  populateMapSelect();
  applyTagFiltersToUi();
  applyFactionFiltersToUi();
  initUndoRedoKeyboard();
  bindUi({ reloadPinsForMap, switchMap });
  initAdminPanel();
  await switchMap(state.currentMapId, { fit: true });
}

async function switchMap(mapId, { fit = false } = {}) {
  const map = state.mapCatalog.find((item) => item.id === mapId);
  if (!map) return;

  exitEditorMode();

  state.searchQuery = "";
  const searchEl = document.getElementById("pin-search");
  if (searchEl) searchEl.value = "";

  state.currentMapId = mapId;
  state.currentMap = map;
  saveSelectedMapId(mapId);

  const mapSelect = document.getElementById("map-select");
  if (mapSelect) mapSelect.value = mapId;

  const image = document.getElementById("map-image");
  image.src = map.image;
  image.alt = `${map.name} tactical map`;
  document.title = `HLL Climb Guide — ${map.name}`;

  await waitForImage(image);

  if (!state.mapViewer) {
    const viewport = document.getElementById("map-viewport");
    const stage = document.getElementById("map-stage");
    state.mapViewer = new MapViewer(viewport, stage, image);
    state.mapViewer.onTransform = () => {
      updateZoomLabel();
    };
    state.mapOverlays = new MapOverlays(stage, image);
    applyToggleStateToUi();
    applyToggleStateToOverlays();
  } else {
    state.mapOverlays.syncGridSize();
  }

  state.mapOverlays.setMapData(map);
  state.pins = (state.pinCatalog[mapId] || []).map(normalizePin);
  renderPins();
  renderPinList();

  if (fit) {
    state.mapViewer.fitToView();
  } else {
    state.mapViewer.clampTranslation();
    state.mapViewer.applyTransform();
  }
}

init();
