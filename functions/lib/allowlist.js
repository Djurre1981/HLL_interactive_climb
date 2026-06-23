export function getAllowedSteamIds(env) {
  const raw = env.ALLOWED_STEAM_IDS || "";
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAllowedSteamId(steamId, env) {
  const allowed = getAllowedSteamIds(env);
  if (allowed.length === 0) {
    return false;
  }
  return allowed.includes(String(steamId));
}
