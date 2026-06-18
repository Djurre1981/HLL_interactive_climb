# Hell Let Loose — Interactive Climb Guide

An interactive map guide for [Hell Let Loose](https://www.hellletloose.com/) trick spots — bush climbs, roof access, wall boosts, and more.

## Features

- **Pan & zoom** on a high-resolution tactical map
- **Pins** mark trick locations with title and description
- **Hover** a pin to preview the trick video
- **Click** a pin to play the full embedded video (YouTube, Vimeo, or local `.mp4`)
- **Add pins** directly on the map; custom pins are saved in your browser

## Quick start

Serve the folder over HTTP (required for loading map data):

```bash
python -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Adding tricks

Edit `data/pins.json` to add built-in pins, or use **Add pin** in the UI for personal pins (stored in `localStorage`).

Each pin uses percentage coordinates so it stays aligned when zooming:

```json
{
  "id": "unique-id",
  "title": "Bush climb — orchard edge",
  "description": "Short explanation of the trick",
  "x": 38.5,
  "y": 52.0,
  "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "thumbnail": "optional-preview-image-url"
}
```

## Maps

| Map | File |
|-----|------|
| Saint Marie du Mont | `maps/SMDM.webp` |

Drop new map images into `maps/` and update `mapImage` in `data/pins.json`.

## Controls

| Action | Input |
|--------|-------|
| Pan | Click + drag |
| Zoom | Scroll wheel or +/- buttons |
| Reset view | **Reset view** button |
| Add pin | **Add pin** → click map → fill form |
