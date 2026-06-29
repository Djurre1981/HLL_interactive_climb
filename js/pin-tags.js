export const PIN_TAGS = [
  { id: "mg-spot", label: "mg spot", className: "map-pin--mg-spot" },
  { id: "climb", label: "climb", className: "map-pin--climb" },
];

export const DEFAULT_PIN_TAG = "mg-spot";

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

export function isDirectionalPinTag(tagId) {
  return tagId === "mg-spot";
}
