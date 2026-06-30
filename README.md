# Hell Let Loose — Interactive Climb Guide

An interactive map guide for [Hell Let Loose](https://www.hellletloose.com/) trick spots — bush climbs, roof access, wall boosts, and more.

Inspired by [Maps Let Loose](https://mattw.io/maps-let-loose/) for map selection, overlays, and default spawn data.

## Cloudflare media hosting

Trick **videos** and **preview images** can be uploaded when adding a pin. Files are stored in **Cloudflare R2** and served only to signed-in circle members:

- `POST /api/uploads/video` → `GET /api/videos/{id}`
- `POST /api/uploads/image` → `GET /api/images/{id}`

Supported uploads: **MP4, WebM, MOV, OGG** (video) and **JPEG, PNG, WebP, GIF** (preview). If no preview is provided, the first frame of the video is captured automatically.

External links (YouTube, Medal.tv, Vimeo, etc.) still work. A one-time **Discord → R2 migration** for legacy `#climbing-guide` clips is documented in [`scripts/video-migration/README.md`](scripts/video-migration/README.md) (requires Discord bot access on the Circle server).

## ToDo / Planned / Ideas

V **Include MG spots** Title is self explainatory
V **Tags for types of pins** To tag types like climb, mg spot etc
V **Custom names for mini spots like 'Grandma's house'**
- **Limit upload size and/length of video/images**

## Features

- **Steam sign-in** for circle members (administrator and user Steam ID lists)
- **Role-based permissions**: users manage their own tricks; administrators manage all tricks
- **Protected trick data** served only to authenticated, approved users
- **All 20 HLL tacmaps** with a map selector in the sidebar
- **Pan & zoom** on high-resolution tactical maps (1920×1920)
- **Toggle overlays**: grid and strongpoints
- **Pins** mark trick locations with title and description
- **Hover** a pin to preview the trick video
- **Click** a pin to play the full embedded video (YouTube, Vimeo, Medal.tv, or Cloudflare-hosted uploads)
- **Upload videos and preview images** to Cloudflare R2 when adding a pin (or paste external links)
- **Add pins** directly on the map; tricks are saved on the server (Cloudflare KV in production, in-memory during local dev without KV)

## Quick start

### Production (Cloudflare Pages)

Auth and protected pins require **Cloudflare Pages** with Functions (GitHub Pages alone cannot run the auth API).

1. Install dependencies: `npm install`
2. Copy `.dev.vars.example` → `.dev.vars` and set:
   - `SESSION_SECRET` — long random string
   - `ADMIN_STEAM_IDS` — comma-separated Steam ID64 values for administrators
   - `USER_STEAM_IDS` — comma-separated Steam ID64 values for regular users
   - `STEAM_API_KEY` (optional) — [Steam Web API key](https://steamcommunity.com/dev/apikey) for display names/avatars
3. Local dev: `npm run dev` → [http://localhost:8788](http://localhost:8788)
4. Deploy: `npm run deploy` (or connect the GitHub repo in Cloudflare Pages dashboard)

Set the same secrets in Cloudflare: **Pages → your project → Settings → Environment variables**.

### Finding a Steam ID64

After a member signs in once (even if not yet allowlisted), check server logs, or use a site like [steamid.io](https://steamid.io/). Profile URL `https://steamcommunity.com/profiles/76561198…` contains the ID64.

### Legacy static server (no auth)

`python -m http.server 8080` still serves maps/overlays but **will not load tricks** without the auth API.

Open [http://localhost:8080](http://localhost:8080) only for map asset testing.

## Adding tricks

Edit `data/pins.json` to add built-in pins per map. Pins are **not** served publicly; they are returned from `/api/pins` after Steam auth.

Use **Add pin** in the UI to create tricks. Seed pins in `data/pins.json` (with `createdBy: null`) are editable only by administrators.

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
