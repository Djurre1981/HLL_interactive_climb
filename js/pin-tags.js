export const PIN_TAGS = [
  { id: "mg-spot", label: "mg spot", className: "map-pin--mg-spot" },
  { id: "climb", label: "climb", className: "map-pin--climb" },
  { id: "location", label: "location", className: "map-pin--location" },
];

export const DEFAULT_PIN_TAG = "climb";

export function isValidPinTag(tagId) {
  return PIN_TAGS.some((tag) => tag.id === tagId);
}

export function getPinTag(tagId) {
  return PIN_TAGS.find((tag) => tag.id === tagId);
}

export function normalizePinTag(pin) {
  if (isValidPinTag(pin.tag)) return pin.tag;
  return DEFAULT_PIN_TAG;
}
