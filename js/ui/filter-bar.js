import { state, TAG_FILTER_STORAGE_KEY, FACTION_FILTER_STORAGE_KEY } from "../state.js";
import { PIN_TAGS, normalizePinTag, getPinTag } from "../pin-tags.js";
import { hasPinDirection } from "./mg-spot-arrows.js";
import { getPinPositionCode } from "../helpers/position-code.js";

export function loadTagFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(TAG_FILTER_STORAGE_KEY) || "{}");
    return Object.fromEntries(
      PIN_TAGS.map((tag) => [tag.id, saved[tag.id] ?? true])
    );
  } catch {
    return Object.fromEntries(PIN_TAGS.map((tag) => [tag.id, true]));
  }
}

export function saveTagFilters() {
  localStorage.setItem(TAG_FILTER_STORAGE_KEY, JSON.stringify(state.tagFilters));
}

export function applyTagFiltersToUi() {
  for (const tag of PIN_TAGS) {
    const button = document.querySelector(`#tag-filters [data-tag="${tag.id}"]`);
    if (!button) continue;
    const active = isPinTagVisible(tag.id);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

export function isPinTagVisible(tagId) {
  return state.tagFilters[tagId] !== false;
}

export function loadCurrentFaction() {
  try {
    const saved = localStorage.getItem(FACTION_FILTER_STORAGE_KEY);
    if (saved && ["axis", "neutral", "allies"].includes(saved)) return saved;
  } catch {
    // fall through
  }
  return "neutral";
}

export function saveCurrentFaction() {
  localStorage.setItem(FACTION_FILTER_STORAGE_KEY, state.currentFaction);
}

export function applyFactionFiltersToUi() {
  const sidebarBar = document.querySelector("#sidebar-faction-bar");
  if (sidebarBar) {
    sidebarBar.dataset.currentFaction = state.currentFaction;
    sidebarBar.querySelectorAll("[data-faction]").forEach((button) => {
      const active = button.dataset.faction === state.currentFaction;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
}

export function applyEditorFactionToUi() {
  const editorBar = document.querySelector("#edit-faction-bar");
  if (!editorBar) return;
  editorBar.dataset.currentFaction = state.pendingFaction;
  editorBar.querySelectorAll("[data-faction]").forEach((button) => {
    const active = button.dataset.faction === state.pendingFaction;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function pinMatchesSearch(pin, query) {
  if (pin.title.toLowerCase().includes(query)) return true;

  const code = getPinPositionCode(pin).toLowerCase();
  if (code.includes(query)) return true;

  const tag = getPinTag(pin.tag);
  if (tag?.label?.toLowerCase().includes(query)) return true;
  if (tag?.id?.toLowerCase().includes(query)) return true;
  if (pin.tag?.toLowerCase().includes(query)) return true;

  if (pin.description?.toLowerCase().includes(query)) return true;

  return false;
}

export function getFilteredPins() {
  let visible = state.pins.filter((pin) => isPinTagVisible(pin.tag));
  if (state.currentFaction !== "neutral") {
    visible = visible.filter((pin) => {
      const pf = pin.faction || "neutral";
      return pf === "neutral" || pf === state.currentFaction;
    });
  }
  if (state.searchQuery) {
    const q = state.searchQuery.trim().toLowerCase();
    if (q) {
      visible = visible.filter((pin) => pinMatchesSearch(pin, q));
    }
  }
  return visible.sort((a, b) => {
    const sortY = (pin) => (pin.tag === "mg-spot" && hasPinDirection(pin) ? pin.dirY : pin.y);
    return sortY(a) - sortY(b);
  });
}

export function getMapPins() {
  let visible = getFilteredPins();
  if (state.panelMode === "edit" && state.editingPinId) {
    visible = visible.filter((pin) => pin.id !== state.editingPinId);
  }
  return visible;
}

export function normalizePin(pin) {
  return { ...pin, tag: normalizePinTag(pin) };
}
