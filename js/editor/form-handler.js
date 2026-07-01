import { state } from "../state.js";
import { createPin, deletePin, updatePin } from "../api/pins.js";
import { normalizeVideoUrl, isSupportedVideoUrl, getUnsupportedVideoUrlMessage } from "../utils/video.js";
import { isDirectionalPinTag } from "../pin-tags.js";
import { isPlacementComplete, canSavePlacement, getPinFormTag } from "./placement-mode.js";

const REQUIRES_FACTION_CONFIG = {
  axis: { label: "Belgian Gate", icon: "fa-archway" },
  allies: { label: "Tank Hedgehog", icon: "fa-maximize" },
};

function getRequiresOptions() {
  return document.getElementById("pin-requires-options");
}

function getPinTitle() {
  return document.getElementById("pin-title");
}

function getPinDescription() {
  return document.getElementById("pin-description");
}

function getPinVideo() {
  return document.getElementById("pin-video");
}

function getPinThumbnail() {
  return document.getElementById("pin-thumbnail");
}

function getBtnSavePin() {
  return document.getElementById("btn-save-pin");
}

function getBtnDeletePin() {
  return document.getElementById("btn-delete-pin");
}

export function initRequiresCheckboxes() {
  const requiresOptions = getRequiresOptions();
  if (!requiresOptions) return;
  requiresOptions.querySelectorAll(".requires-checkbox").forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    checkbox.addEventListener("change", () => {
      label.classList.toggle("is-checked", checkbox.checked);
    });
    label.addEventListener("click", (event) => {
      event.preventDefault();
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });
  });
}

export function updateFactionRequires(faction) {
  const requiresFactionCheckbox = document.querySelector(".requires-checkbox--faction");
  if (!requiresFactionCheckbox) return;
  if (faction === "neutral") {
    requiresFactionCheckbox.classList.add("hidden");
    return;
  }
  const config = REQUIRES_FACTION_CONFIG[faction];
  if (config) {
    const label = document.getElementById("requires-faction-label");
    const icon = document.getElementById("requires-faction-icon");
    if (label) label.textContent = config.label;
    if (icon) icon.className = `fa-solid ${config.icon}`;
    requiresFactionCheckbox.classList.remove("hidden");
  } else {
    requiresFactionCheckbox.classList.add("hidden");
  }
}

export function getRequiresData() {
  const requires = {};
  const requiresOptions = getRequiresOptions();
  if (!requiresOptions) return {};
  requiresOptions.querySelectorAll(".requires-checkbox").forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    const requiresKey = label.dataset.requires;
    if (checkbox && checkbox.checked) {
      if (requiresKey === "faction-specific") {
        requires["faction-specific"] = state.pendingFaction;
      } else {
        requires[requiresKey] = true;
      }
    }
  });
  return requires;
}

export function setRequiresData(requires) {
  const requiresOptions = getRequiresOptions();
  if (!requiresOptions) return;
  requiresOptions.querySelectorAll(".requires-checkbox").forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    const requiresKey = label.dataset.requires;
    if (!checkbox) return;
    let isChecked = false;
    if (requiresKey === "faction-specific") {
      isChecked = Boolean(requires && requires["faction-specific"]);
    } else {
      isChecked = Boolean(requires && requires[requiresKey]);
    }
    checkbox.checked = isChecked;
    label.classList.toggle("is-checked", isChecked);
  });
}

export function resetRequires() {
  const requiresOptions = getRequiresOptions();
  if (!requiresOptions) return;
  requiresOptions.querySelectorAll(".requires-checkbox").forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    checkbox.checked = false;
    label.classList.remove("is-checked");
  });
}

export function triggerFormSave({ reloadPinsForMap, backToEditorBrowse, canModifyFn }) {
  onSavePin({ preventDefault() {} }, { reloadPinsForMap, backToEditorBrowse, canModifyFn });
}

export function onSavePin(event, { reloadPinsForMap, backToEditorBrowse: backToEditorBrowseFn, canModifyFn }) {
  event.preventDefault();
  if (!canSavePlacement()) return;

  const tag = getPinFormTag();
  if (!tag) return;

  const pinVideo = getPinVideo();
  const videoUrl = normalizeVideoUrl(pinVideo.value);
  if (videoUrl && !isSupportedVideoUrl(videoUrl)) {
    pinVideo.setCustomValidity(getUnsupportedVideoUrlMessage());
    pinVideo.reportValidity();
    return;
  }
  pinVideo.setCustomValidity("");

  const pinData = {
    title: getPinTitle().value.trim(),
    description: getPinDescription().value.trim(),
    videoUrl: videoUrl || undefined,
    thumbnail: getPinThumbnail().value.trim() || undefined,
    tag,
    x: state.pendingCoords.x,
    y: state.pendingCoords.y,
  };

  if (isDirectionalPinTag(tag)) {
    pinData.dirX = state.pendingDirection.x;
    pinData.dirY = state.pendingDirection.y;
  }

  pinData.faction = state.pendingFaction;

  const requires = getRequiresData();
  if (Object.keys(requires).length > 0) {
    pinData.requires = requires;
  } else {
    pinData.requires = {};
  }

  void savePin(pinData, { reloadPinsForMap, backToEditorBrowse: backToEditorBrowseFn, canModifyFn });
}

export async function savePin(pinData, { reloadPinsForMap, backToEditorBrowse: backToEditorBrowseFn, canModifyFn }) {
  const btnSavePin = getBtnSavePin();
  btnSavePin.disabled = true;

  try {
    if (state.panelMode === "edit" && state.editingPinId) {
      const existing = state.pins.find((item) => item.id === state.editingPinId);
      if (!existing || !canModifyFn(existing)) return;

      await updatePin(state.currentMapId, state.editingPinId, pinData);
      await reloadPinsForMap(state.currentMapId);
      backToEditorBrowseFn();
      return;
    }

    await createPin(state.currentMapId, pinData);
    await reloadPinsForMap(state.currentMapId);
    backToEditorBrowseFn();
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not save trick");
    btnSavePin.disabled = false;
  }
}

export async function onDeletePin({ reloadPinsForMap, backToEditorBrowse: backToEditorBrowseFn, canModifyFn }) {
  if (state.panelMode !== "edit" || !state.editingPinId) return;

  const existing = state.pins.find((item) => item.id === state.editingPinId);
  if (!existing || !canModifyFn(existing)) return;

  if (!window.confirm(`Delete "${existing.title}"? This cannot be undone.`)) {
    return;
  }

  const btnDeletePin = getBtnDeletePin();
  btnDeletePin && (btnDeletePin.disabled = true);

  try {
    await deletePin(state.currentMapId, state.editingPinId);
    await reloadPinsForMap(state.currentMapId);
    backToEditorBrowseFn();
  } catch (error) {
    console.error(error);
    alert(error.message || "Could not delete trick");
  } finally {
    if (btnDeletePin) {
      btnDeletePin.disabled = false;
    }
  }
}
