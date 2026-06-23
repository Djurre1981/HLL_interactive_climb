const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

export function getOrigin(request) {
  return new URL(request.url).origin;
}

export function buildSteamLoginUrl(request) {
  const origin = getOrigin(request);
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${origin}/api/auth/callback`,
    "openid.realm": origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export async function verifySteamCallback(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("openid.mode");
  if (mode !== "id_res") {
    throw new Error("Invalid OpenID response");
  }

  const body = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith("openid.")) {
      body.set(key, value);
    }
  }
  body.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await response.text();
  if (!/is_valid\s*:\s*true/i.test(text)) {
    throw new Error("Steam OpenID verification failed");
  }

  const claimedId = url.searchParams.get("openid.claimed_id") || "";
  const match = claimedId.match(/\/openid\/id\/(\d+)$/);
  if (!match) {
    throw new Error("Could not parse Steam ID");
  }

  return match[1];
}

export async function fetchSteamProfile(steamId, env) {
  const apiKey = env.STEAM_API_KEY;
  if (!apiKey) {
    return { steamId, name: null, avatar: null };
  }

  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamids", steamId);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      return { steamId, name: null, avatar: null };
    }
    const data = await response.json();
    const player = data?.response?.players?.[0];
    return {
      steamId,
      name: player?.personaname || null,
      avatar: player?.avatarfull || null,
    };
  } catch {
    return { steamId, name: null, avatar: null };
  }
}
