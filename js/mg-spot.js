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

export function buildMgSpotSvgContent(baseX, baseY, tipX, tipY, { stem = true } = {}) {
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

  const dx = tipX - baseX;
  const dy = tipY - baseY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;

  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  barGroup.setAttribute("transform", `translate(${baseX},${baseY}) rotate(${angle + 90})`);

  const sharpX = tipX - ux * HEAD_LENGTH;
  const sharpY = tipY - uy * HEAD_LENGTH;
  const leftX = tipX + px * HEAD_WIDTH;
  const leftY = tipY + py * HEAD_WIDTH;
  const rightX = tipX - px * HEAD_WIDTH;
  const rightY = tipY - py * HEAD_WIDTH;

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
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}

export function renderDraftMgSpot(svg, base, tip, { preview = false, headOnly = false } = {}) {
  clearSvgElement(svg);
  if (!base && !tip && !headOnly) {
    svg.classList.add("hidden");
    return;
  }

  if (headOnly && tip) {
    const headGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    headGroup.setAttribute("class", "map-mg-spot map-mg-spot--draft");

    const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    head.setAttribute("class", "mg-spot-head");
    head.setAttribute("cx", String(tip.x));
    head.setAttribute("cy", String(tip.y));
    head.setAttribute("r", String(HEAD_WIDTH * 0.7));
    headGroup.appendChild(head);

    svg.appendChild(headGroup);
    svg.classList.remove("hidden");
    return;
  }

  if (!base) {
    svg.classList.add("hidden");
    return;
  }

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
  group.setAttribute("class", "map-mg-spot map-mg-spot--draft");
  group.appendChild(parts.fragment);
  svg.appendChild(group);
  svg.classList.remove("hidden");
}
