# Hell Let Loose — Interactive Climb Guide

An interactive map guide for [Hell Let Loose](https://www.hellletloose.com/) trick spots — bush climbs, roof access, wall boosts, and more.

Inspired by [Maps Let Loose](https://mattw.io/maps-let-loose/) for map selection, overlays, and default spawn data.
## ToDo / Planned / Ideas

- **Include MG spots** Title is self explainatory
- **Tags for types of pins** To tag types like climb, mg spot etc
- **Custom names for mini spots like 'Grandma's house'**
- ** **

## Features

- **All 20 HLL tacmaps** with a map selector in the sidebar
- **Pan & zoom** on high-resolution tactical maps (1920×1920)
- **Toggle overlays**: grid and strongpoints
- **Pins** mark trick locations with title and description
- **Hover** a pin to preview the trick video
- **Click** a pin to play the full embedded video (YouTube, Vimeo, or local `.mp4`)
- **Add pins** directly on the map; custom pins are saved per map in your browser

## Quick start

Serve the folder over HTTP (required for loading map data):

```bash
python -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Adding tricks

Edit `data/pins.json` to add built-in pins per map, or use **Add pin** in the UI for personal pins (stored in `localStorage`).

```json
{
  "defaultMapId": "SMDMV2",
  "pins": {
    "SMDMV2": [
      {
        "id": "unique-id",
        "title": "Bush climb — orchard edge",
        "description": "Short explanation of the trick",
        "x": 38.5,
        "y": 52.0,
        "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
        "thumbnail": "optional-preview-image-url"
      }
    ]
  }
}
```

Coordinates are percentages (0–100) so pins stay aligned when zooming.

## Maps & attribution

Tactical map images and spawn/strongpoint data are sourced from the community project [maps-let-loose](https://github.com/mattwright324/maps-let-loose) by mattwright324. Map assets are derived from Hell Let Loose (Team17).

| Map | ID |
|-----|-----|
| Carentan | `Carentan` |
| Driel | `Driel` |
| El Alamein | `ElAlamein` |
| Elsenborn | `Elsenborn` |
| Foy | `Foy` |
| Hill 400 | `Hill400` |
| Hurtgen | `HurtgenV2` |
| Juno Beach | `Juno` |
| Kharkov | `Kharkov` |
| Kursk | `Kursk` |
| Mortain | `Mortain` |
| Omaha Beach | `Omaha` |
| Purple Heart Lane | `PHL` |
| Remagen | `Remagen` |
| Saint Marie du Mont | `SMDMV2` |
| Sainte-Mère-Église | `SME` |
| Stalingrad | `Stalingrad` |
| Smolensk | `Smolensk` |
| Tobruk | `Tobruk` |
| Utah Beach | `Utah` |

Map images live in `maps/no-grid/`. Spawn data is in `data/map-spawns.json` (generated from maps-let-loose `data.js` via `scripts/extract-map-data.py`).

## Controls

| Action | Input |
|--------|-------|
| Pan | Click + drag |
| Zoom | Scroll wheel or +/- buttons |
| Reset view | **Reset view** button |
| Switch map | Sidebar map dropdown |
| Toggle overlays | Sidebar checkboxes |
| Add pin | **Add pin** → click map → fill form |
