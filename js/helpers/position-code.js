export function getPositionCodeCoords(pin) {
  const x = pin.tag === "mg-spot" && pin.dirX != null ? pin.dirX : pin.x;
  const y = pin.tag === "mg-spot" && pin.dirY != null ? pin.dirY : pin.y;
  return { x, y };
}

export function generatePositionCode(x, y) {
  const letterIndex = Math.min(Math.floor(x / 10), 25);
  const letter = String.fromCharCode(65 + letterIndex);
  const row = Math.min(Math.floor(y / 10), 9) + 1;
  const suffix = String(Math.min(99, Math.floor(x * 10 + y) % 100)).padStart(2, "0");
  return `#${letter}${row}-${suffix}`;
}

export function getPinPositionCode(pin) {
  const { x, y } = getPositionCodeCoords(pin);
  return generatePositionCode(x, y);
}

export function roundCoord(value) {
  return Math.round(value * 10) / 10;
}
