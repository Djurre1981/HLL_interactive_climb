import { state } from "../state.js";
import {
  createVideoElement,
  isMedalUrl,
  isPlayableDirectUrl,
  normalizeVideoUrl,
  youtubeThumbnail,
} from "../utils/video.js";
import { resolveMedalClip } from "../utils/medal.js";
import { REQUIRES_ICON_CONFIG } from "./pin-modal.js";
import { generatePositionCode } from "../helpers/position-code.js";

export async function getPinPlayback(pin) {
  let playbackUrl = normalizeVideoUrl(pin.videoUrl);
  let thumbnail = pin.thumbnail || youtubeThumbnail(playbackUrl);

  if (isMedalUrl(pin.videoUrl)) {
    const medal = await resolveMedalClip(pin.videoUrl);
    playbackUrl = medal.contentUrl;
    thumbnail = thumbnail || medal.thumbnailUrl;
  }

  return { playbackUrl, thumbnail };
}

function getPreviewTooltip() {
  return document.getElementById("preview-tooltip");
}

function getPreviewMedia() {
  return document.getElementById("preview-media");
}

function getPreviewTitle() {
  return document.getElementById("preview-title");
}

function getPreviewPositionCode() {
  return document.getElementById("preview-position-code");
}

function getPreviewFactionIcon() {
  return document.getElementById("preview-faction-icon");
}

function getPreviewFactionText() {
  return document.getElementById("preview-faction-text");
}

function getPreviewRequires() {
  return document.getElementById("preview-requires");
}

function renderPreviewRequires(pin) {
  const previewRequires = getPreviewRequires();
  if (!previewRequires) return;
  previewRequires.innerHTML = "";
  const requires = pin.requires;
  if (!requires || Object.keys(requires).length === 0) return;

  for (const [key, value] of Object.entries(requires)) {
    if (!value) continue;
    const config = REQUIRES_ICON_CONFIG[key];
    if (!config) continue;
    const item = document.createElement("span");
    item.className = `preview-tooltip__requires-item is-requires--${key}`;
    item.innerHTML = `<i class="${config.icon}" aria-hidden="true"></i>`;
    item.title = config.label;
    previewRequires.appendChild(item);
  }
}

export function showPreview(pin, event) {
  if (state.panelMode !== null) return;

  clearTimeout(state.previewHideTimer);

  const faction = pin.faction || "neutral";
  const FACTION_CONFIG = {
    axis: { icon: "fa-solid fa-person-rifle", label: "Axis" },
    allies: { icon: "fa-solid fa-person-rifle", label: "Allies" },
    neutral: { icon: "fa-solid fa-skull-crossbones", label: "Neutral" },
  };
  const config = FACTION_CONFIG[faction] || FACTION_CONFIG.neutral;

  const previewFactionIcon = getPreviewFactionIcon();
  if (previewFactionIcon) {
    previewFactionIcon.className = `preview-tooltip__faction-icon faction--${faction} ${config.icon}`;
    const previewFactionText = getPreviewFactionText();
    if (previewFactionText) previewFactionText.textContent = config.label;
    previewFactionIcon.classList.remove("hidden");
  }
  getPreviewTitle().textContent = pin.title;

  const previewPositionCode = getPreviewPositionCode();
  if (previewPositionCode) {
    const posX = pin.tag === "mg-spot" && pin.dirX != null ? pin.dirX : pin.x;
    const posY = pin.tag === "mg-spot" && pin.dirY != null ? pin.dirY : pin.y;
    previewPositionCode.textContent = generatePositionCode(posX, posY);
    previewPositionCode.classList.remove("hidden");
  }

  renderPreviewRequires(pin);

  getPreviewMedia().innerHTML = '<p class="preview-loading">Loading clip…</p>';
  getPreviewTooltip().classList.remove("hidden");
  movePreview(event);

  const previewPinId = pin.id;
  loadPreviewMedia(pin, previewPinId);
}

export async function loadPreviewMedia(pin, previewPinId) {
  try {
    const { playbackUrl, thumbnail } = await getPinPlayback(pin);
    if (state.highlightedPinId !== previewPinId) return;

    const previewMedia = getPreviewMedia();
    previewMedia.innerHTML = "";
    if (thumbnail) {
      const img = document.createElement("img");
      img.src = thumbnail;
      img.alt = `${pin.title} preview`;
      previewMedia.appendChild(img);
    } else if (isPlayableDirectUrl(playbackUrl)) {
      const video = createVideoElement(playbackUrl, {
        autoplay: true,
        muted: true,
        controls: false,
      });
      video.loop = true;
      previewMedia.appendChild(video);
    } else {
      const iframe = createVideoElement(playbackUrl, { autoplay: true, muted: true });
      previewMedia.appendChild(iframe);
    }
  } catch (error) {
    console.warn(error);
    if (state.highlightedPinId !== previewPinId) return;
    getPreviewMedia().innerHTML =
      '<p class="preview-error">Could not load Medal.tv clip. Open the link on medal.tv instead.</p>';
  }
}

export function movePreview(event) {
  const offset = 16;
  const tooltip = getPreviewTooltip();
  const width = tooltip.offsetWidth || 320;
  const height = tooltip.offsetHeight || 220;

  let x = event.clientX + offset;
  let y = event.clientY + offset;

  if (x + width > window.innerWidth - 12) {
    x = event.clientX - width - offset;
  }
  if (y + height > window.innerHeight - 12) {
    y = event.clientY - height - offset;
  }

  tooltip.style.left = `${Math.max(12, x)}px`;
  tooltip.style.top = `${Math.max(12, y)}px`;
}

export function scheduleHidePreview() {
  clearTimeout(state.previewHideTimer);
  state.previewHideTimer = setTimeout(() => {
    getPreviewTooltip().classList.add("hidden");
    getPreviewMedia().innerHTML = "";
  }, 120);
}

export function hidePreviewImmediately() {
  clearTimeout(state.previewHideTimer);
  getPreviewTooltip().classList.add("hidden");
  getPreviewMedia().innerHTML = "";
}
