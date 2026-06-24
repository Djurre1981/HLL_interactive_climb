function parseSteamIds(raw) {
  return (raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

const KV_KEY = "users";

let memoryStore = null;

function seedFromEnv(env) {
  return {
    users: parseSteamIds(env.USER_STEAM_IDS).map((steamId) => ({
      steamId,
      role: "user",
    })),
    revoked: [],
  };
}

export async function loadUsersData(env) {
  if (env.PINS_KV) {
    const stored = await env.PINS_KV.get(KV_KEY, "json");
    if (stored?.users) {
      return migrateEnvUsers(env, stored);
    }

    const initial = seedFromEnv(env);
    await env.PINS_KV.put(KV_KEY, JSON.stringify(initial));
    return initial;
  }

  if (!memoryStore) {
    memoryStore = seedFromEnv(env);
  }
  return migrateEnvUsers(env, memoryStore);
}

async function migrateEnvUsers(env, data) {
  const envOwners = new Set(parseSteamIds(env.OWNER_STEAM_IDS));
  const envAdmins = new Set(parseSteamIds(env.ADMIN_STEAM_IDS));
  const envUsers = parseSteamIds(env.USER_STEAM_IDS);
  let changed = false;

  if (!Array.isArray(data.revoked)) {
    data.revoked = [];
    changed = true;
  }

  for (const steamId of envOwners) {
    const existing = data.users.find((user) => user.steamId === steamId);
    if (existing) {
      if (existing.role !== "owner") {
        existing.role = "owner";
        changed = true;
      }
    } else {
      data.users.push({ steamId, role: "owner" });
      changed = true;
    }
  }

  for (const steamId of envAdmins) {
    if (envOwners.has(steamId)) {
      continue;
    }
    const existing = data.users.find((user) => user.steamId === steamId);
    if (existing) {
      if (existing.role !== "admin") {
        existing.role = "admin";
        changed = true;
      }
    } else {
      data.users.push({ steamId, role: "admin" });
      changed = true;
    }
  }

  for (const steamId of envUsers) {
    if (envAdmins.has(steamId)) {
      continue;
    }
    if (!data.users.some((user) => user.steamId === steamId)) {
      data.users.push({ steamId, role: "user" });
      changed = true;
    }
  }

  if (changed) {
    await saveUsersData(env, data);
  }

  return data;
}

export async function saveUsersData(env, data) {
  if (env.PINS_KV) {
    await env.PINS_KV.put(KV_KEY, JSON.stringify(data));
    return;
  }

  memoryStore = data;
}

export function isValidSteamId64(steamId) {
  return /^7656119\d{10}$/.test(String(steamId).trim());
}
