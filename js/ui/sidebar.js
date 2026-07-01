import { state } from "../state.js";
import { getFilteredPins } from "./filter-bar.js";
import { getPinTag } from "../pin-tags.js";
import { escapeHtml } from "../helpers/sanitizer.js";
import { getPinPositionCode } from "../helpers/position-code.js";
import { canModifyPin } from "../helpers/permissions.js";
import { highlightPin, focusPin } from "../helpers/proximity.js";
import { openModal, REQUIRES_ICON_CONFIG } from "./pin-modal.js";

function isEditorBrowseMode() {
  return state.panelMode === "browse";
}

export function renderPinList() {
  const pinList = document.getElementById("pin-list");
  pinList.innerHTML = "";
  for (const pin of getFilteredPins()) {
    const tag = getPinTag(pin.tag);
    const row = document.createElement("li");
    row.className = "pin-list__row";

    const item = document.createElement("button");
    item.type = "button";
    item.className = "pin-list__item";
    item.dataset.id = pin.id;

    const faction = pin.faction || "neutral";

    const posCode = getPinPositionCode(pin);

    let requiresHtml = "";
    if (pin.requires) {
      for (const [key, value] of Object.entries(pin.requires)) {
        if (!value) continue;
        const config = REQUIRES_ICON_CONFIG[key];
        if (!config) continue;
        requiresHtml += `<span class="pin-list__requires-item is-requires--${key}" title="${escapeHtml(config.label)}"><i class="${config.icon}" aria-hidden="true"></i></span>`;
      }
    }

    item.innerHTML = `
      <span class="pin-list__title-row">
        <span class="pin-list__title">
          <span class="pin-list__title-text">${escapeHtml(pin.title)}</span>
        </span>
        <span class="pin-list__tag pin-list__tag--${pin.tag}${pin.tag === "mg-spot" ? ` pin-list__tag--faction-${faction}` : ""}">${escapeHtml(tag?.label || pin.tag)}</span>
      </span>
      <span class="pin-list__sub-row">
        <span class="pin-list__position-code">${posCode}</span>
        ${requiresHtml ? `<span class="pin-list__requires">${requiresHtml}</span>` : ""}
      </span>
    `;

    item.addEventListener("click", () => {
      focusPin(pin);
    });

    row.addEventListener("mouseenter", () => {
      if (state.panelMode === "edit" && pin.id !== state.editingPinId) return;
      highlightPin(pin.id);
    });
    row.addEventListener("mouseleave", () => highlightPin(null));

    if (isEditorBrowseMode() && canModifyPin(pin)) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "pin-list__action pin-list__edit btn btn--ghost";
      editButton.title = "Edit trick";
      editButton.textContent = "Edit";
      editButton.dataset.pinId = pin.id;
      editButton.addEventListener("click", (event) => {
        event.stopPropagation();
        document.dispatchEvent(new CustomEvent("pin-list-edit", { detail: { pinId: pin.id } }));
      });
      row.appendChild(item);
      row.appendChild(editButton);
    } else if (!isEditorBrowseMode()) {
      const viewButton = document.createElement("button");
      viewButton.type = "button";
      viewButton.className = "pin-list__action pin-list__view btn btn--ghost";
      viewButton.title = "View trick";
      viewButton.textContent = "View";
      viewButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openModal(pin);
      });
      row.appendChild(item);
      row.appendChild(viewButton);
    } else {
      row.appendChild(item);
    }

    pinList.appendChild(row);
  }
}

export function updatePinCount() {
  const filtered = getFilteredPins();
  const mapName = state.currentMap?.name || "this map";
  const total = state.pins.length;
  let text;

  if (state.searchQuery.trim()) {
    text = filtered.length === 0
      ? `No spots match "${state.searchQuery.trim()}"`
      : `${filtered.length} spot${filtered.length === 1 ? "" : "s"} match your search`;
  } else if (total === 0) {
    text = `No tricks on ${mapName}`;
  } else if (filtered.length === 0) {
    text = `No tricks visible on ${mapName} — enable a tag`;
  } else if (filtered.length === total) {
    text = `${filtered.length} spot${filtered.length === 1 ? "" : "s"} on ${mapName}`;
  } else {
    text = `${filtered.length} of ${total} spots on ${mapName}`;
  }

  const pinCount = document.getElementById("pin-count");
  if (pinCount) pinCount.textContent = text;
}
