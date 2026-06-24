import { fetchSteamProfile } from "./steam.js";

export async function resolveCreatorName(steamId, env, session = null) {
  if (!steamId) {
    return null;
  }

  if (session?.steamId === steamId && session.name) {
    return session.name;
  }

  const profile = await fetchSteamProfile(steamId, env);
  return profile.name || null;
}

export async function enrichPinsData(data, env) {
  const steamIds = new Set();

  for (const mapPins of Object.values(data.pins || {})) {
    for (const pin of mapPins) {
      if (pin.createdBy && !pin.createdByName) {
        steamIds.add(pin.createdBy);
      }
    }
  }

  const nameById = new Map();
  await Promise.all(
    [...steamIds].map(async (steamId) => {
      const name = await resolveCreatorName(steamId, env);
      if (name) {
        nameById.set(steamId, name);
      }
    })
  );

  const enriched = structuredClone(data);
  for (const mapPins of Object.values(enriched.pins || {})) {
    for (const pin of mapPins) {
      if (!pin.createdBy) {
        continue;
      }
      pin.createdByName = pin.createdByName || nameById.get(pin.createdBy) || null;
    }
  }

  return enriched;
}
