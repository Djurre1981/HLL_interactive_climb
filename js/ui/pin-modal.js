import { state } from "../state.js";
import { getPinPlayback } from "./pin-preview.js";
import { hidePreviewImmediately } from "./pin-preview.js";
import { escapeHtml } from "../helpers/sanitizer.js";
import { generatePositionCode } from "../helpers/position-code.js";
import { createVideoElement } from "../utils/video.js";

export const REQUIRES_ICON_CONFIG = {
  truck: { icon: "fa-solid fa-truck", label: "Transport Truck" },
  "repair-station": { icon: "fa-solid fa-screwdriver-wrench", label: "Repair Station" },
  barricade: { icon: "fa-solid fa-road-barrier", label: "Build Barricade" },
  "faction-specific": { icon: "fa-solid fa-triangle-exclamation", label: "Belgian Gate / Tank Hedgehog" },
};

function getModal() {
  return document.getElementById("video-modal");
}

function getModalTitle() {
  return document.getElementById("modal-title");
}

function getModalDescription() {
  return document.getElementById("modal-description");
}

function getModalUploader() {
  return document.getElementById("modal-uploader");
}

function getModalPlayer() {
  return document.getElementById("modal-player");
}

function getModalFactionIcon() {
  return document.getElementById("modal-faction-icon");
}

function getModalPositionCode() {
  return document.getElementById("modal-position-code");
}

function getModalRequires() {
  return document.getElementById("modal-requires");
}

function getPinUploaderLabel(pin) {
  if (!pin?.createdBy) {
    return null;
  }
  return pin.createdByName || `Steam user ${pin.createdBy}`;
}

export function openModal(pin) {
  hidePreviewImmediately();
  state.modalPin = pin;
  getModalTitle().textContent = pin.title;
  getModalDescription().textContent = pin.description || "";

  const faction = pin.faction || "neutral";
  const modalFactionIcon = getModalFactionIcon();
  if (modalFactionIcon) {
    const FACTION_CONFIG = {
      axis: { icon: "fa-solid fa-person-rifle", label: "Axis" },
      allies: { icon: "fa-solid fa-person-rifle", label: "Allies" },
      neutral: { icon: "fa-solid fa-skull-crossbones", label: "Neutral" },
    };
    const config = FACTION_CONFIG[faction] || FACTION_CONFIG.neutral;
    modalFactionIcon.className = `video-modal__faction-icon faction--${faction} ${config.icon}`;
    const textEl = document.getElementById("modal-faction-text");
    const sepEl = document.getElementById("modal-faction-sep");
    if (textEl) textEl.textContent = config.label;
    if (sepEl) sepEl.textContent = " - ";
    modalFactionIcon.classList.remove("hidden");
  }

  const tagEl = document.getElementById("modal-tag");
  const titleSepEl = document.getElementById("modal-title-sep");
  const tagLabel = pin.tag === "mg-spot" ? "MG SPOT" : "CLIMB";
  if (tagEl) {
    tagEl.textContent = tagLabel;
    tagEl.className = `video-modal__tag video-modal__tag--${pin.tag}`;
  }
  if (titleSepEl) {
    titleSepEl.textContent = " - ";
  }

  const modalPositionCode = getModalPositionCode();
  if (modalPositionCode) {
    const posX = pin.tag === "mg-spot" && pin.dirX != null ? pin.dirX : pin.x;
    const posY = pin.tag === "mg-spot" && pin.dirY != null ? pin.dirY : pin.y;
    modalPositionCode.textContent = generatePositionCode(posX, posY);
    modalPositionCode.classList.remove("hidden");
  }

  const uploader = getPinUploaderLabel(pin);
  const modalUploader = getModalUploader();
  if (uploader && modalUploader) {
    modalUploader.textContent = `Added by ${uploader}`;
    modalUploader.classList.remove("hidden");
  } else if (modalUploader) {
    modalUploader.textContent = "";
    modalUploader.classList.add("hidden");
  }

  renderModalRequires(pin);

  getModalPlayer().innerHTML = '<p class="preview-loading">Loading clip…</p>';
  getModal().showModal();
  loadModalPlayer(pin);
}

function renderModalRequires(pin) {
  const modalRequires = getModalRequires();
  if (!modalRequires) return;
  const requires = pin.requires;
  if (!requires || Object.keys(requires).length === 0) {
    modalRequires.classList.add("hidden");
    modalRequires.innerHTML = "";
    return;
  }

  modalRequires.innerHTML = "";
  modalRequires.classList.remove("hidden");

  for (const [key, value] of Object.entries(requires)) {
    if (!value) continue;
    const config = REQUIRES_ICON_CONFIG[key];
    if (!config) continue;
    const item = document.createElement("span");
    item.className = `video-modal__requires-item is-requires--${key}`;
    item.innerHTML = `<i class="${config.icon}" aria-hidden="true"></i> ${escapeHtml(config.label)}`;
    modalRequires.appendChild(item);
  }

  if (modalRequires.children.length === 0) {
    modalRequires.classList.add("hidden");
  }
}

export async function loadModalPlayer(pin) {
  try {
    const { playbackUrl } = await getPinPlayback(pin);
    if (state.modalPin?.id !== pin.id) return;

    const modalPlayer = getModalPlayer();
    modalPlayer.innerHTML = "";
    const player = createVideoElement(playbackUrl, {
      autoplay: true,
      muted: false,
      controls: true,
    });
    modalPlayer.appendChild(player);
  } catch (error) {
    console.warn(error);
    if (state.modalPin?.id !== pin.id) return;
    getModalPlayer().innerHTML = `
      <p class="preview-error">Could not load Medal.tv clip.</p>
      <p><a href="${escapeHtml(pin.videoUrl)}" target="_blank" rel="noopener noreferrer">Open on Medal.tv</a></p>
    `;
  }
}

export function closeModal() {
  getModal().close();
  if (document.activeElement?.classList?.contains("map-mg-spot")) {
    document.activeElement.blur();
  }
}

export function clearModalPlayer() {
  getModalPlayer().innerHTML = "";
  state.modalPin = null;
}
