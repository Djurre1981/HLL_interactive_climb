"""Extract map spawn/strongpoint data from maps-let-loose data.js."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_maps_source" / "data.js"
OUT = ROOT / "data" / "map-spawns.json"
MAP_SIZE = 1920

MAP_META = [
    {"id": "Carentan", "name": "Carentan", "file": "Carentan_NoGrid.webp"},
    {"id": "Driel", "name": "Driel", "file": "Driel_NoGrid.webp"},
    {"id": "ElAlamein", "name": "El Alamein", "file": "ElAlamein_NoGrid.webp"},
    {"id": "Elsenborn", "name": "Elsenborn", "file": "Elsenborn_NoGrid.webp"},
    {"id": "Foy", "name": "Foy", "file": "Foy_NoGrid.webp"},
    {"id": "Hill400", "name": "Hill 400", "file": "Hill400_NoGrid.webp"},
    {"id": "HurtgenV2", "name": "Hurtgen", "file": "HurtgenV2_NoGrid.webp"},
    {"id": "Juno", "name": "Juno Beach", "file": "Juno_NoGrid.webp"},
    {"id": "Kharkov", "name": "Kharkov", "file": "Kharkov_NoGrid.webp"},
    {"id": "Kursk", "name": "Kursk", "file": "Kursk_NoGrid.webp"},
    {"id": "Mortain", "name": "Mortain", "file": "Mortain_NoGrid.webp"},
    {"id": "Omaha", "name": "Omaha Beach", "file": "Omaha_NoGrid.webp"},
    {"id": "PHL", "name": "Purple Heart Lane", "file": "PHL_NoGrid.webp"},
    {"id": "Remagen", "name": "Remagen", "file": "Remagen_NoGrid.webp"},
    {"id": "SMDMV2", "name": "Saint Marie du Mont", "file": "SMDMV2_NoGrid.webp"},
    {"id": "SME", "name": "Sainte-Mère-Église", "file": "SME_NoGrid.webp"},
    {"id": "Stalingrad", "name": "Stalingrad", "file": "Stalingrad_NoGrid.webp"},
    {"id": "Smolensk", "name": "Smolensk", "file": "Smolensk_NoGrid.webp"},
    {"id": "Tobruk", "name": "Tobruk", "file": "Tobruk_NoGrid.webp"},
    {"id": "Utah", "name": "Utah Beach", "file": "Utah_NoGrid.webp"},
]

RECT_RE = re.compile(r"\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]")
COORD_RE = re.compile(
    r'(?:left|"left")\s*:\s*([\d.]+)\s*,\s*(?:top|"top")\s*:\s*([\d.]+)'
)


def pct(value: float) -> float:
    return round(value / MAP_SIZE * 100, 2)


def extract_block(text: str, name: str) -> str:
    marker = f"const {name} ="
    start = text.index(marker) + len(marker)
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise ValueError(f"Could not parse block {name}")


def js_to_json(js: str) -> str:
    js = re.sub(r"//.*?$", "", js, flags=re.MULTILINE)
    js = re.sub(r",(\s*[\]}])", r"\1", js)
    js = re.sub(r'(?<=[{\s,])(\w+)\s*:', r'"\1":', js)
    return js


def parse_points(block: str) -> dict:
    raw = json.loads(js_to_json(block))
    result = {}
    for map_id, grid in raw.items():
        strongpoints = []
        for row_idx, row in enumerate(grid):
            if not row:
                continue
            for col_idx, cell in enumerate(row):
                if cell is None:
                    continue
                for rect in cell:
                    x, y, w, h = rect
                    strongpoints.append(
                        {
                            "row": row_idx,
                            "col": col_idx,
                            "x": pct(x + w / 2),
                            "y": pct(y + h / 2),
                            "w": pct(w),
                            "h": pct(h),
                        }
                    )
        result[map_id] = strongpoints
    return result


def extract_map_section(block: str, map_id: str) -> str:
    marker = f'"{map_id}":'
    alt = f"{map_id}:"
    idx = block.find(marker)
    if idx == -1:
        idx = block.find(alt)
        marker = alt
    if idx == -1:
        return ""

    start = idx + len(marker)
    depth = 0
    for i, ch in enumerate(block[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return block[start : i + 1]
    return ""


def parse_garrisons(defaults_block: str) -> dict:
    result = {}
    for meta in MAP_META:
        map_id = meta["id"]
        section = extract_map_section(defaults_block, map_id)
        entry = {"a": [], "b": []}
        if not section:
            result[map_id] = entry
            continue

        og_idx = section.find("offensive_garrisons:")
        if og_idx == -1:
            result[map_id] = entry
            continue

        og_start = og_idx + len("offensive_garrisons:")
        og_block = extract_braced(og_start, section)
        for side in ("b", "a"):
            side_idx = og_block.find(f"{side}:")
            if side_idx == -1:
                continue
            side_start = side_idx + len(f"{side}:")
            side_block = extract_bracketed(side_start, og_block)
            for left, top in COORD_RE.findall(side_block):
                entry[side].append({"x": pct(float(left)), "y": pct(float(top)), "side": side})

        result[map_id] = entry
    return result


def extract_braced(start: int, text: str) -> str:
    while start < len(text) and text[start] not in "{":
        start += 1
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return ""


def extract_bracketed(start: int, text: str) -> str:
    while start < len(text) and text[start] != "[":
        start += 1
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return ""


def main() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    points = parse_points(extract_block(text, "POINT_COORDS"))
    defaults_block = extract_block(text, "DEFAULT_ELEMENTS")
    garrisons = parse_garrisons(defaults_block)

    maps = []
    for meta in MAP_META:
        map_id = meta["id"]
        maps.append(
            {
                **meta,
                "image": f"maps/no-grid/{meta['file']}",
                "strongpoints": points.get(map_id, []),
                "offensiveGarrisons": garrisons.get(map_id, {"a": [], "b": []}),
            }
        )

    OUT.write_text(json.dumps({"mapSize": MAP_SIZE, "maps": maps}, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({len(maps)} maps)")


if __name__ == "__main__":
    main()
