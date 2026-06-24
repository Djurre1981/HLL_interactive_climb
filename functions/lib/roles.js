import { loadUsersData, saveUsersData } from "./users-store.js";

function parseSteamIds(raw) {
  return (raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function getEnvAdminSteamIds(env) {
  const admins = parseSteamIds(env.ADMIN_STEAM_IDS);
  if (admins.length > 0) {
    return admins;
  }
  return parseSteamIds(env.ALLOWED_STEAM_IDS);
}

/** @deprecated Use getEnvAdminSteamIds */
export const getAdminSteamIds = getEnvAdminSteamIds;

export function getEnvUserSteamIds(env) {
  return parseSteamIds(env.USER_STEAM_IDS);
}

/** @deprecated Use getEnvUserSteamIds */
export const getUserSteamIds = getEnvUserSteamIds;

export async function getUserRole(steamId, env) {
  const id = String(steamId);
  if (getEnvAdminSteamIds(env).includes(id)) {
    return "admin";
  }

  const data = await loadUsersData(env);
  const member = data.users.find((user) => user.steamId === id);
  if (member?.role === "admin") {
    return "admin";
  }
  if (member) {
    return "user";
  }

  return null;
}

export async function isAllowedSteamId(steamId, env) {
  return (await getUserRole(steamId, env)) !== null;
}

export async function isAdmin(steamId, env) {
  return (await getUserRole(steamId, env)) === "admin";
}

export async function listAllMembers(env) {
  const data = await loadUsersData(env);
  const members = [];

  for (const steamId of getEnvAdminSteamIds(env)) {
    members.push({ steamId, role: "admin", removable: false });
  }

  const seen = new Set(members.map((member) => member.steamId));

  for (const user of data.users) {
    if (seen.has(user.steamId)) {
      continue;
    }
    const isAdmin = user.role === "admin";
    members.push({
      steamId: user.steamId,
      role: isAdmin ? "admin" : "user",
      removable: !isAdmin,
    });
    seen.add(user.steamId);
  }

  return members;
}

export async function addManagedUser(env, steamId) {
  const id = String(steamId).trim();

  if (getEnvAdminSteamIds(env).includes(id)) {
    return { error: "This Steam ID is already an administrator" };
  }

  const data = await loadUsersData(env);
  if (data.users.some((user) => user.steamId === id)) {
    return { error: "User already has access" };
  }

  data.users.push({ steamId: id, role: "user" });
  await saveUsersData(env, data);
  return { member: { steamId: id, role: "user", removable: true } };
}

export async function removeManagedUser(env, steamId) {
  const id = String(steamId).trim();

  if (getEnvAdminSteamIds(env).includes(id)) {
    return { error: "Cannot remove an administrator" };
  }

  const data = await loadUsersData(env);
  const member = data.users.find((user) => user.steamId === id);
  if (member?.role === "admin") {
    return { error: "Cannot remove an administrator" };
  }
  const index = data.users.findIndex((user) => user.steamId === id);
  if (index < 0) {
    return { error: "User not found" };
  }

  data.users.splice(index, 1);
  await saveUsersData(env, data);
  return { ok: true };
}
