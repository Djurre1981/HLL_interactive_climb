const MAP_SIZE = 1920;
const GARRISON_RADIUS_PCT = (190 / MAP_SIZE) * 100;

export class MapOverlays {
  constructor(stage, image) {
    this.stage = stage;
    this.image = image;
    this.mapData = null;

    this.toggles = {
      grid: false,
      strongpoints: true,
      offensiveGarrisons: true,
      garrisonRadius: true,
    };
    this.garrisonSide = "both";

    this.gridLayer = this.createLayer("map-overlays map-overlays--grid");
    this.strongpointsLayer = this.createLayer("map-overlays map-overlays--strongpoints");
    this.garrisonsLayer = this.createLayer("map-overlays map-overlays--garrisons");

    this.gridImage = document.createElement("img");
    this.gridImage.className = "map-grid-image";
    this.gridImage.src = "maps/plain-grid.png";
    this.gridImage.alt = "";
    this.gridImage.draggable = false;
    this.gridLayer.appendChild(this.gridImage);

    this.syncGridSize();
    image.addEventListener("load", () => this.syncGridSize());
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
    this.render();
  }

  setToggle(key, enabled) {
    this.toggles[key] = enabled;
    this.render();
  }

  setGarrisonSide(side) {
    this.garrisonSide = side;
    this.render();
  }

  render() {
    this.gridLayer.classList.toggle("hidden", !this.toggles.grid);
    this.strongpointsLayer.classList.toggle("hidden", !this.toggles.strongpoints);
    this.garrisonsLayer.classList.toggle("hidden", !this.toggles.offensiveGarrisons);

    if (!this.mapData) return;

    this.renderStrongpoints();
    this.renderGarrisons();
  }

  renderStrongpoints() {
    this.strongpointsLayer.innerHTML = "";
    if (!this.toggles.strongpoints) return;

    for (const point of this.mapData.strongpoints || []) {
      const marker = document.createElement("div");
      marker.className = "overlay-strongpoint";
      marker.style.left = `${point.x}%`;
      marker.style.top = `${point.y}%`;
      marker.style.width = `${point.w}%`;
      marker.style.height = `${point.h}%`;
      marker.style.transform = "translate(-50%, -50%)";
      marker.title = "Strongpoint";
      this.strongpointsLayer.appendChild(marker);
    }
  }

  renderGarrisons() {
    this.garrisonsLayer.innerHTML = "";
    if (!this.toggles.offensiveGarrisons) return;

    const garrisons = this.mapData.offensiveGarrisons || { a: [], b: [] };
    const sides =
      this.garrisonSide === "both" ? ["a", "b"] : [this.garrisonSide];

    for (const side of sides) {
      for (const spawn of garrisons[side] || []) {
        const wrap = document.createElement("div");
        wrap.className = `overlay-garrison overlay-garrison--${side}`;
        wrap.style.left = `${spawn.x}%`;
        wrap.style.top = `${spawn.y}%`;
        wrap.title = `Offensive garrison (side ${side.toUpperCase()})`;

        const icon = document.createElement("span");
        icon.className = "overlay-garrison__icon";
        wrap.appendChild(icon);
        this.garrisonsLayer.appendChild(wrap);

        if (this.toggles.garrisonRadius) {
          const radius = document.createElement("div");
          radius.className = `overlay-garrison-radius overlay-garrison-radius--${side}`;
          radius.style.left = `${spawn.x}%`;
          radius.style.top = `${spawn.y}%`;
          radius.style.width = `${GARRISON_RADIUS_PCT}%`;
          radius.style.height = `${GARRISON_RADIUS_PCT}%`;
          this.garrisonsLayer.appendChild(radius);
        }
      }
    }
  }
}
