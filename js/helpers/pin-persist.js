import { state } from "../state.js";
import { updatePin } from "../api/pins.js";
import { roundCoord } from "./position-code.js";
import { updatePinElementPosition } from "./proximity.js";
import { renderPinList } from "../ui/sidebar.js";

function buildPinPayload(pin) {
  const payload = {
    title: pin.title,
    description: pin.description || "",
    tag: pin.tag,
    x: pin.x,
    y: pin.y,
    videoUrl: pin.videoUrl || "",
    thumbnail: pin.thumbnail || "",
    faction: pin.faction || "neutral",
    requires: pin.requires || {},
  };
  if (pin.dirX != null && pin.dirY != null) {
    payload.dirX = pin.dirX;
    payload.dirY = pin.dirY;
  }
  return payload;
}

export function syncPinInCatalog(pin) {
  const list = state.pinCatalog[state.currentMapId];
  if (!list) return;
  const index = list.findIndex((item) => item.id === pin.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...pin };
  }
}

function normalizePinCoords(pin) {
  pin.x = roundCoord(pin.x);
  pin.y = roundCoord(pin.y);
  if (pin.dirX != null && pin.dirY != null) {
    pin.dirX = roundCoord(pin.dirX);
    pin.dirY = roundCoord(pin.dirY);
  }
}

export async function persistPinPosition(pin) {
  if (state.pinSaveInFlight) {
    throw new Error("Save already in progress");
  }

  state.pinSaveInFlight = true;
  try {
    normalizePinCoords(pin);
    const updated = await updatePin(state.currentMapId, pin.id, buildPinPayload(pin));
    Object.assign(pin, updated);
    syncPinInCatalog(pin);
    updatePinElementPosition(pin.id);
    renderPinList();
  } finally {
    state.pinSaveInFlight = false;
  }
}
