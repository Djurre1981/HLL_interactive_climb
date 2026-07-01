import { roundCoord } from "./position-code.js";

/** Minimum map-% separation between MG bar and arrowhead (server rejects collapse). */
export const MIN_MG_SEPARATION = 0.5;

export function mgHandlesCollapsed(barX, barY, headX, headY) {
  return roundCoord(barX) === roundCoord(headX) && roundCoord(barY) === roundCoord(headY);
}

/**
 * Nudge the moved handle away from the fixed anchor when head and bar would collapse.
 * @returns {{ x: number, y: number, wasCollapsed: boolean }}
 */
export function enforceMgHandleSeparation(fixedX, fixedY, movingX, movingY) {
  if (!mgHandlesCollapsed(fixedX, fixedY, movingX, movingY)) {
    return { x: movingX, y: movingY, wasCollapsed: false };
  }

  let x = movingX;
  let y = movingY;
  if (Math.abs(fixedX - movingX) >= Math.abs(fixedY - movingY)) {
    x = movingX + (movingX >= fixedX ? MIN_MG_SEPARATION : -MIN_MG_SEPARATION);
  } else {
    y = movingY + (movingY >= fixedY ? MIN_MG_SEPARATION : -MIN_MG_SEPARATION);
  }

  return {
    x: roundCoord(Math.min(100, Math.max(0, x))),
    y: roundCoord(Math.min(100, Math.max(0, y))),
    wasCollapsed: true,
  };
}

export const MG_COLLAPSE_HINT = "Arrowhead and bar are too close — drag them further apart.";
