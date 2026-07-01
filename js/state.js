export const state = {
  pins: [],
  pinCatalog: {},
  mapCatalog: [],
  currentMapId: "SMDMV2",
  currentMap: null,
  editMode: false,
  panelMode: null,
  editingPinId: null,
  modalPin: null,
  pendingCoords: null,
  pendingDirection: null,
  highlightedPinId: null,
  contextMenuPin: null,
  currentFaction: "neutral",
  pendingFaction: "neutral",
  searchQuery: "",
  previewHideTimer: null,
  positionHistory: [],
  redoHistory: [],
  pinDragSession: null,
  pinSaveInFlight: false,
  mgCollapseHint: false,
  mapViewer: null,
  mapOverlays: null,
};

export const MAP_STORAGE_KEY = "hll-climb-selected-map";
export const TOGGLE_STORAGE_KEY = "hll-climb-overlay-tchoggles";
export const TAG_FILTER_STORAGE_KEY = "hll-climb-tag-filters";
export const FACTION_FILTER_STORAGE_KEY = "hll-climb-faction-filters";

export function loadSelectedMapId(fallbackId) {
  const stored = localStorage.getItem(MAP_STORAGE_KEY);
  return stored || fallbackId || "SMDMV2";
}

export function saveSelectedMapId(mapId) {
  localStorage.setItem(MAP_STORAGE_KEY, mapId);
}

export function loadToggleState() {
  try {
    return JSON.parse(localStorage.getItem(TOGGLE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveToggleState(toggleState) {
  localStorage.setItem(TOGGLE_STORAGE_KEY, JSON.stringify(toggleState));
}
