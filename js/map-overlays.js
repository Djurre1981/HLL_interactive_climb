const MAP_SIZE = 1920;

export class MapOverlays {
  constructor(stage, image) {
    this.stage = stage;
    this.image = image;
    this.mapData = null;
    this.strongpointNames = null;

    this.toggles = {
      grid: false,
      strongpoints: true,
    };

    this.gridLayer = this.createLayer("map-overlays map-overlays--grid");
    this.strongpointsLayer = this.createLayer("map-overlays map-overlays--strongpoints");

    this.spImage = null;
    this.spImageMapId = null;
    this.strongpointCutouts = new Map();

    this.gridImage = document.createElement("img");
    this.gridImage.className = "map-grid-image";
    this.gridImage.src = "maps/plain-grid.png";
    this.gridImage.alt = "";
    this.gridImage.draggable = false;
    this.gridLayer.appendChild(this.gridImage);

    this.syncGridSize();
    image.addEventListener("load", () => this.syncGridSize());
    this.loadStrongpointNames();
  }

  async loadStrongpointNames() {
    try {
      const response = await fetch("data/strongpoint-names.json");
      if (response.ok) {
        this.strongpointNames = await response.json();
        this.renderStrongpoints();
      }
    } catch (error) {
      console.warn("Failed to load strongpoint names", error);
    }
  }

  createLayer(className) {
    const layer = document.createElement("div");
    layer.className = className;
    this.stage.insertBefore(layer, this.stage.querySelector(".map-pins"));
    return layer;
  }

  syncGridSize() {
    const w = this.image.naturalWidth || MAP_SIZE;
    const h = this.image.naturalHeight || MAP_SIZE;
    this.gridImage.style.width = `${w}px`;
    this.gridImage.style.height = `${h}px`;
  }

  setMapData(mapData) {
    this.mapData = mapData;
    this.loadStrongpointImage(mapData?.id);
    this.render();
  }

  setToggle(key, enabled) {
    this.toggles[key] = enabled;
    this.render();
  }

  loadStrongpointImage(mapId) {
    if (!mapId || this.spImageMapId === mapId) return;

    this.spImageMapId = mapId;
    this.spImage = null;

    const img = new Image();
    img.decoding = "async";
    img.src = `maps/points/${mapId}_SP_NoMap2.png`;
    img.onload = () => {
      if (this.spImageMapId !== mapId) return;
      this.spImage = img;
      this.buildStrongpointCutouts(mapId);
      this.renderStrongpoints();
    };
    img.onerror = () => {
      if (this.spImageMapId !== mapId) return;
      this.spImage = null;
      this.renderStrongpoints();
    };
  }

  buildStrongpointCutouts(mapId) {
    if (!this.spImage || !this.mapData?.strongpointGrid) return;

    const cutouts = {};
    const grid = this.mapData.strongpointGrid;

    for (let row = 0; row < grid.length; row++) {
      const rowData = grid[row];
      if (!rowData) continue;

      for (let col = 0; col < rowData.length; col++) {
        const rects = rowData[col];
        if (!rects) continue;

        const cutout = this.compositeCutout(rects);
        if (cutout) {
          cutouts[`${row}${col}`] = cutout;
        }
      }
    }

    this.strongpointCutouts.set(mapId, cutouts);
  }

  compositeCutout(rects) {
    let top = MAP_SIZE;
    let left = MAP_SIZE;
    let right = 0;
    let bottom = 0;

    for (const rect of rects) {
      const [x, y, w, h] = rect;
      top = Math.min(top, y);
      left = Math.min(left, x);
      right = Math.max(right, x + w);
      bottom = Math.max(bottom, y + h);
    }

    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    for (const rect of rects) {
      const [x, y, w, h] = rect;
      ctx.drawImage(this.spImage, x, y, w, h, x - left, y - top, w, h);
    }

    return {
      dataUrl: canvas.toDataURL(),
      left,
      top,
      width,
      height,
    };
  }

  render() {
    this.gridLayer.classList.toggle("hidden", !this.toggles.grid);
    this.strongpointsLayer.classList.toggle("hidden", !this.toggles.strongpoints);

    if (!this.mapData) return;

    this.renderStrongpoints();
  }

  renderStrongpoints() {
    this.strongpointsLayer.innerHTML = "";
    if (!this.toggles.strongpoints || !this.mapData) return;

    const cutouts = this.strongpointCutouts.get(this.mapData.id);
    if (cutouts) {
      for (const cutout of Object.values(cutouts)) {
        const marker = document.createElement("img");
        marker.className = "overlay-strongpoint";
        marker.src = cutout.dataUrl;
        marker.alt = "";
        marker.draggable = false;
        marker.style.left = `${(cutout.left / MAP_SIZE) * 100}%`;
        marker.style.top = `${(cutout.top / MAP_SIZE) * 100}%`;
        marker.style.width = `${(cutout.width / MAP_SIZE) * 100}%`;
        marker.style.height = `${(cutout.height / MAP_SIZE) * 100}%`;
        this.strongpointsLayer.appendChild(marker);
      }
    }

    const labels = this.strongpointNames?.[this.mapData.id];
    if (!labels) return;

    for (const label of Object.values(labels)) {
      const marker = document.createElement("img");
      marker.className = "overlay-strongpoint-label";
      marker.src = label.image;
      marker.alt = "";
      marker.draggable = false;
      marker.style.left = `${label.left}%`;
      marker.style.top = `${label.top}%`;
      marker.style.width = `${label.width}%`;
      marker.style.height = `${label.height}%`;
      this.strongpointsLayer.appendChild(marker);
    }
  }
}
