export const MG_SPOT_COLOR = "#e10600";

const BASE_WIDTH = 0.8;
const BASE_HEIGHT = 0.2;
const STEM_WIDTH = 0.20;
const HEAD_LENGTH = 0.60;
const HEAD_WIDTH = 0.25;

export function hasPinDirection(pin) {
  return (
    pin &&
    Number.isFinite(pin.dirX) &&
    Number.isFinite(pin.dirY) &&
    (pin.dirX !== pin.x || pin.dirY !== pin.y)
  );
}

// Shared geometry for the stem line + arrowhead triangle, reused by both
// initial SVG construction and refreshMgSpotGroup() (which redraws the same
// shapes in place while dragging, without recreating any DOM nodes).
function computeMgSpotGeometry(baseX, baseY, tipX, tipY) {
  const dx = tipX - baseX;
  const dy = tipY - baseY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return {
    angle,
    sharpX: tipX - ux * HEAD_LENGTH,
    sharpY: tipY - uy * HEAD_LENGTH,
    leftX: tipX + px * HEAD_WIDTH,
    leftY: tipY + py * HEAD_WIDTH,
    rightX: tipX - px * HEAD_WIDTH,
    rightY: tipY - py * HEAD_WIDTH,
  };
}

export function buildMgSpotSvgContent(baseX, baseY, tipX, tipY, { stem = true, headColor = "#ff0000" } = {}) {
  const fragment = document.createDocumentFragment();

  const barGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  barGroup.setAttribute("class", "mg-spot-base");
  const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bar.setAttribute("x", String(-BASE_WIDTH / 2));
  bar.setAttribute("y", String(-BASE_HEIGHT / 2));
  bar.setAttribute("width", String(BASE_WIDTH));
  bar.setAttribute("height", String(BASE_HEIGHT));
  bar.setAttribute("fill", "#000");
  barGroup.appendChild(bar);
  fragment.appendChild(barGroup);

  if (!stem || tipX == null || tipY == null) {
    return { fragment, stemWidth: STEM_WIDTH, base: barGroup };
  }

  const { angle, sharpX, sharpY, leftX, leftY, rightX, rightY } = computeMgSpotGeometry(baseX, baseY, tipX, tipY);
  barGroup.setAttribute("transform", `translate(${baseX},${baseY}) rotate(${angle + 90})`);

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("class", "mg-spot-stem");
  line.setAttribute("x1", String(baseX));
  line.setAttribute("y1", String(baseY));
  line.setAttribute("x2", String(sharpX));
  line.setAttribute("y2", String(sharpY));
  line.style.pointerEvents = "none";

  const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  head.setAttribute("class", "mg-spot-head");
  head.setAttribute(
    "points",
    `${sharpX},${sharpY} ${leftX},${leftY} ${rightX},${rightY}`
  );

  fragment.append(line, head);
  return { fragment, stem: line, base: barGroup, head, stemWidth: STEM_WIDTH };
}

// Redraws an existing MG spot group's bar/stem/head geometry in place (no DOM
// node creation/removal), so listeners attached to .mg-spot-head/.mg-spot-base
// survive redraws during drag. `pin` only needs x/y/dirX/dirY.
export function refreshMgSpotGroup(group, pin) {
  if (!group || !pin) return;

  const baseGroup = group.querySelector(".mg-spot-base");
  const stem = group.querySelector(".mg-spot-stem");
  const head = group.querySelector(".mg-spot-head");

  const { x: baseX, y: baseY, dirX: tipX, dirY: tipY } = pin;
  if (tipX == null || tipY == null) return;

  const { angle, sharpX, sharpY, leftX, leftY, rightX, rightY } = computeMgSpotGeometry(baseX, baseY, tipX, tipY);

  baseGroup?.setAttribute("transform", `translate(${baseX},${baseY}) rotate(${angle + 90})`);

  if (stem) {
    stem.setAttribute("x1", String(baseX));
    stem.setAttribute("y1", String(baseY));
    stem.setAttribute("x2", String(sharpX));
    stem.setAttribute("y2", String(sharpY));
  }

  head?.setAttribute("points", `${sharpX},${sharpY} ${leftX},${leftY} ${rightX},${rightY}`);
}

export function renderMgSpotGroup(pin, { draft = false, highlighted = false } = {}) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "map-mg-spot");
  if (draft) {
    group.classList.add("map-mg-spot--draft");
  }
  if (highlighted) {
    group.classList.add("is-highlighted");
  }
  if (pin.id) {
    group.dataset.id = pin.id;
  }

  const parts = buildMgSpotSvgContent(pin.x, pin.y, pin.dirX, pin.dirY);
  if (parts.stem) {
    parts.stem.setAttribute("stroke-width", String(parts.stemWidth));
  }
  group.appendChild(parts.fragment);
  return group;
}

export function clearSvgElement(svg) {
  if (!svg) return;
  svg.replaceChildren();
}

export function renderDraftMgSpot(svg, base, tip, { preview = false, headOnly = false, faction = "neutral" } = {}) {
  if (!svg) return;

  if (!base && !tip && !headOnly) {
    svg.classList.add("hidden");
    return;
  }

  let newContent;

  if (headOnly && tip) {
    const headGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    headGroup.setAttribute("class", `map-mg-spot map-mg-spot--draft mg-spot--${faction}`);

    const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    head.setAttribute("class", "mg-spot-head");
    head.setAttribute("cx", String(tip.x));
    head.setAttribute("cy", String(tip.y));
    head.setAttribute("r", String(HEAD_WIDTH * 0.7));
    headGroup.appendChild(head);
    newContent = headGroup;
  } else if (!base) {
    svg.classList.add("hidden");
    return;
  } else {
    const parts = buildMgSpotSvgContent(base.x, base.y, tip?.x ?? null, tip?.y ?? null, {
      stem: Boolean(tip),
    });
    if (parts.stem) {
      parts.stem.setAttribute("stroke-width", String(parts.stemWidth));
      if (preview) {
        parts.stem.classList.add("mg-spot-stem--preview");
        parts.head?.classList.add("mg-spot-head--preview");
      }
    }

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", `map-mg-spot map-mg-spot--draft mg-spot--${faction}`);
    group.appendChild(parts.fragment);
    newContent = group;
  }

  // Prevent repaint during DOM swap by hiding the SVG first
  svg.style.visibility = "hidden";
  // Atomically swap content
  svg.replaceChildren(newContent);
  svg.classList.remove("hidden");
  svg.style.visibility = "";
}
