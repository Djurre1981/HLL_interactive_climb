import { state } from "../state.js";
import { canModifyPin } from "../helpers/permissions.js";
import { DEFAULT_PIN_TAG } from "../pin-tags.js";
import { hasPinDirection, renderDraftMgSpot } from "./mg-spot-arrows.js";
import { hidePreviewImmediately } from "./pin-preview.js";
import { closeModal } from "./pin-modal.js";
import { applyEditorFactionToUi } from "./filter-bar.js";
import { highlightPin, focusPin } from "../helpers/proximity.js";
import { setPinFormTag, isPlacementComplete, updatePlacementUi, syncViewportFormClasses } from "../editor/placement-mode.js";
import { hidePlacementCrosshair, updateDraftMarker } from "../editor/draft-renderer.js";
import { updateFactionRequires, setRequiresData, resetRequires } from "../editor/form-handler.js";
import { renderPins } from "./pin-marker.js";
import { renderPinList } from "./sidebar.js";
import { hideFormContextMenu } from "./form-context-menu.js";

function getEditPanel() {
  return document.getElementById("edit-panel");
}

function getSidebarDefault() {
  return document.getElementById("sidebar-default");
}

function updateSidebarSectionsVisibility() {
  const inEditor = isInEditorMode();
  document.getElementById("sidebar-map-section")?.classList.toggle("hidden", inEditor);
  document.getElementById("sidebar-faction-section")?.classList.toggle("hidden", inEditor);
  getSidebarDefault()?.classList.toggle("is-editor-mode", inEditor);
}

function getEditPanelTitle() {
  return document.getElementById("edit-panel-title");
}

function getEditPanelHint() {
  return document.getElementById("edit-panel-hint");
}

function getPinForm() {
  return document.getElementById("pin-form");
}

function getPinCoords() {
  return document.getElementById("pin-coords");
}

function getBtnSavePin() {
  return document.getElementById("btn-save-pin");
}

function getBtnToggleEdit() {
  return document.getElementById("btn-toggle-edit");
}

function getBtnAddPin() {
  return document.getElementById("btn-add-pin");
}

function getBtnCancelEdit() {
  return document.getElementById("btn-cancel-edit");
}

function getHeaderEditorGroup() {
  return document.getElementById("header-editor-group");
}

function getPinTitle() {
  return document.getElementById("pin-title");
}

function getPinDescription() {
  return document.getElementById("pin-description");
}

function getPinVideo() {
  return document.getElementById("pin-video");
}

function getPinThumbnail() {
  return document.getElementById("pin-thumbnail");
}

function getDraftPin() {
  return document.getElementById("map-draft-pin");
}

function getDraftArrow() {
  return document.getElementById("map-draft-arrow");
}

function getZoomLabel() {
  return document.getElementById("zoom-label");
}

function isInEditorMode() {
  return state.panelMode !== null;
}

function isFormOpen() {
  return state.panelMode === "add" || state.panelMode === "edit";
}

export function updateZoomLabel() {
  const zoomLabel = getZoomLabel();
  zoomLabel.textContent = `${state.mapViewer.getZoomPercent()}%`;
}

export function toggleEditMode() {
  if (isInEditorMode()) {
    exitEditorMode();
    return;
  }

  enterEditorMode();
}

function syncViewportModeClasses() {
  state.mapViewer?.setEditorMode(isInEditorMode());
}

export function enterEditorMode() {
  state.panelMode = "browse";
  state.editingPinId = null;
  state.pendingCoords = null;
  state.pendingDirection = null;
  state.mgCollapseHint = false;
  state.editMode = false;
  state.positionHistory = [];
  state.pinDragSession = null;

  hidePreviewImmediately();
  setSidebarDefaultVisible(true);
  getEditPanel().classList.add("hidden");
  hidePlacementCrosshair();
  highlightPin(null);
  updateDraftMarker();
  renderPins();
  renderPinList();
  updateSidebarSectionsVisibility();
  updateEditorHeaderButtons({ animate: true });
  syncViewportModeClasses();
  syncViewportFormClasses();
  hideFormContextMenu();
}

export function backToEditorBrowse() {
  if (!isInEditorMode()) return;

  state.panelMode = "browse";
  state.editingPinId = null;
  state.pendingCoords = null;
  state.pendingDirection = null;
  state.mgCollapseHint = false;
  state.editMode = false;
  state.positionHistory = [];
  state.pinDragSession = null;

  hidePreviewImmediately();
  setSidebarDefaultVisible(true);
  state.mapViewer?.setEditMode(false);
  getEditPanel().classList.add("hidden");
  hidePlacementCrosshair();
  getPinForm().reset();
  getPinCoords().textContent = "No position selected";
  getBtnSavePin().disabled = true;
  getBtnSavePin().textContent = "Save pin";
  setPinFormTag(DEFAULT_PIN_TAG);
  highlightPin(null);
  updateDraftMarker();
  renderPins();
  renderPinList();
  updateSidebarSectionsVisibility();
  updateEditorHeaderButtons();
  syncViewportModeClasses();
  syncViewportFormClasses();
  hideFormContextMenu();
}

export function exitEditorMode() {
  state.panelMode = null;
  state.editingPinId = null;
  state.pendingCoords = null;
  state.pendingDirection = null;
  state.mgCollapseHint = false;
  state.editMode = false;
  state.pinDragSession = null;

  setSidebarDefaultVisible(true);
  state.mapViewer?.setEditMode(false);
  getEditPanel().classList.add("hidden");
  hidePlacementCrosshair();
  getPinForm().reset();
  getPinCoords().textContent = "No position selected";
  getBtnSavePin().disabled = true;
  getBtnSavePin().textContent = "Save pin";
  setPinFormTag(DEFAULT_PIN_TAG);
  updateEditorHeaderButtons();
  highlightPin(null);
  updateDraftMarker();
  renderPins();
  renderPinList();
  updateSidebarSectionsVisibility();
  syncViewportModeClasses();
  syncViewportFormClasses();
  hideFormContextMenu();
}

/** @deprecated Use exitEditorMode — kept for map-switch and legacy callers */
export function closeEditPanel() {
  exitEditorMode();
}

export function setSidebarDefaultVisible(visible) {
  const sidebarDefault = getSidebarDefault();
  sidebarDefault?.classList.toggle("hidden", !visible);
}

function resetAddForm() {
  state.positionHistory = [];
  state.editingPinId = null;
  state.pendingCoords = null;
  state.pendingDirection = null;
  state.mgCollapseHint = false;

  hidePlacementCrosshair();
  const draftPin = getDraftPin();
  draftPin?.classList.add("hidden");
  renderDraftMgSpot(getDraftArrow(), null, null);
  getPinForm().reset();
  getPinCoords().textContent = "No position selected";
  getBtnSavePin().disabled = true;
  getBtnSavePin().textContent = "Save pin";
  state.pendingFaction = state.currentFaction;
  setPinFormTag(DEFAULT_PIN_TAG);
  applyEditorFactionToUi();
  updateFactionRequires(state.pendingFaction);
  resetRequires();
  const editPanelHint = getEditPanelHint();
  if (editPanelHint) editPanelHint.textContent = "";
}

export function openAddPinForm() {
  if (!isInEditorMode()) {
    enterEditorMode();
  }

  state.panelMode = "add";
  state.editMode = true;

  hidePreviewImmediately();
  setSidebarDefaultVisible(false);
  state.mapViewer?.setEditMode(true);
  getEditPanel().classList.remove("hidden");
  resetAddForm();
  getEditPanelTitle().textContent = "EDIT POSITION";
  updateEditorHeaderButtons();
  highlightPin(null);
  updateDraftMarker();
  renderPins();
  syncViewportModeClasses();
  syncViewportFormClasses();
  hideFormContextMenu();
}

/** @deprecated Use openAddPinForm */
export function startAddPin() {
  openAddPinForm();
}

export function startEditPin(pin, { focus = false } = {}) {
  if (!pin || !canModifyPin(pin)) return;

  if (!isInEditorMode()) {
    enterEditorMode();
  }

  state.positionHistory = [];
  hidePreviewImmediately();
  closeModal();
  state.panelMode = "edit";
  state.editingPinId = pin.id;
  state.pendingCoords = { x: pin.x, y: pin.y };
  state.pendingDirection =
    pin.tag === "mg-spot" && hasPinDirection(pin)
      ? { x: pin.dirX, y: pin.dirY }
      : null;
  state.editMode = true;

  setSidebarDefaultVisible(false);
  state.mapViewer?.setEditMode(true);
  getEditPanel().classList.remove("hidden");
  getPinTitle().value = pin.title;
  getPinDescription().value = pin.description || "";
  getPinVideo().value = pin.videoUrl || "";
  getPinThumbnail().value = pin.thumbnail || "";
  state.pendingFaction = pin.faction || "neutral";
  setPinFormTag(pin.tag);
  applyEditorFactionToUi();
  updateFactionRequires(state.pendingFaction);
  setRequiresData(pin.requires);
  getBtnSavePin().disabled = !isPlacementComplete();
  getBtnSavePin().textContent = "Save changes";
  getEditPanelTitle().textContent = "EDIT POSITION";
  const editPanelHint = getEditPanelHint();
  if (editPanelHint) editPanelHint.textContent = "";
  updateEditorHeaderButtons();
  highlightPin(pin.id);
  hidePlacementCrosshair();
  updatePlacementUi();
  updateDraftMarker();
  renderPins();
  if (focus) {
    focusPin(pin, { zoomPercent: 100 });
  }
  syncViewportModeClasses();
  syncViewportFormClasses();
  hideFormContextMenu();
}

export function updateEditorHeaderButtons({ animate = false } = {}) {
  const inEditor = isInEditorMode();
  const formOpen = isFormOpen();
  const group = getHeaderEditorGroup();
  const btnToggleEdit = getBtnToggleEdit();
  const btnAddPin = getBtnAddPin();
  const btnCancelEdit = getBtnCancelEdit();

  btnToggleEdit?.classList.toggle("hidden", inEditor);
  btnAddPin?.classList.toggle("hidden", !inEditor || formOpen);
  btnCancelEdit?.classList.toggle("hidden", !inEditor);
  group?.classList.toggle("is-active", inEditor);

  if (inEditor && animate && btnAddPin) {
    btnAddPin.classList.remove("is-animating");
    void btnAddPin.offsetWidth;
    btnAddPin.classList.add("is-animating");
    btnAddPin.addEventListener(
      "animationend",
      () => btnAddPin.classList.remove("is-animating"),
      { once: true }
    );
  }
}
