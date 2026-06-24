import { loadUsersData, saveUsersData } from "./users-store.js";

function parseSteamIds(raw) {
  return (raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function getEnvOwnerSteamIds(env) {
  return parseSteamIds(env.OWNER_STEAM_IDS);
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

function isEnvOwner(steamId, env) {
  return getEnvOwnerSteamIds(env).includes(String(steamId));
}

function isEnvAdmin(steamId, env) {
  return getEnvAdminSteamIds(env).includes(String(steamId));
}

async function isRevoked(steamId, env) {
  const data = await loadUsersData(env);
  return (data.revoked || []).includes(String(steamId));
}

export async function getUserRole(steamId, env) {
  const id = String(steamId);

  if (isEnvOwner(id, env)) {
    return "owner";
  }

  if (await isRevoked(id, env)) {
    return null;
  }

  if (isEnvAdmin(id, env)) {
    return "admin";
  }

  const data = await loadUsersData(env);
  const member = data.users.find((user) => user.steamId === id);
  if (member?.role === "owner") {
    return "owner";
  }
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
  const role = await getUserRole(steamId, env);
  return role === "admin" || role === "owner";
}

export async function isOwner(steamId, env) {
  return (await getUserRole(steamId, env)) === "owner";
}

export function isStaffRole(role) {
  return role === "admin" || role === "owner";
}

export async function listAllMembers(env, actorRole) {
  const data = await loadUsersData(env);
  const revoked = new Set(data.revoked || []);
  const members = [];
  const seen = new Set();
  const actorIsOwner = actorRole === "owner";

  for (const steamId of getEnvOwnerSteamIds(env)) {
    members.push({ steamId, role: "owner", removable: false, roleEditable: false });
    seen.add(steamId);
  }

  for (const steamId of getEnvAdminSteamIds(env)) {
    if (seen.has(steamId) || revoked.has(steamId)) {
      continue;
    }
    members.push({
      steamId,
      role: "admin",
      removable: actorIsOwner,
      roleEditable: actorIsOwner,
    });
    seen.add(steamId);
  }

  for (const user of data.users) {
    if (seen.has(user.steamId) || revoked.has(user.steamId)) {
      continue;
    }

    const role =
      user.role === "owner" ? "owner" : user.role === "admin" ? "admin" : "user";

    if (role === "owner") {
      members.push({
        steamId: user.steamId,
        role: "owner",
        removable: false,
        roleEditable: false,
      });
    } else {
      members.push({
        steamId: user.steamId,
        role,
        removable: role === "admin" ? actorIsOwner : true,
        roleEditable: actorIsOwner,
      });
    }
    seen.add(user.steamId);
  }

  return members;
}

export async function addManagedUser(env, steamId) {
  const id = String(steamId).trim();

  if (isEnvOwner(id, env)) {
    return { error: "This Steam ID is already an owner" };
  }

  if (isEnvAdmin(id, env)) {
    const data = await loadUsersData(env);
    if ((data.revoked || []).includes(id)) {
      data.revoked = data.revoked.filter((entry) => entry !== id);
      await saveUsersData(env, data);
      return {
        member: { steamId: id, role: "admin", removable: true, roleEditable: true },
      };
    }
    return { error: "This Steam ID is already an administrator" };
  }

  const data = await loadUsersData(env);
  if ((data.revoked || []).includes(id)) {
    data.revoked = data.revoked.filter((entry) => entry !== id);
    await saveUsersData(env, data);
  }

  if (data.users.some((user) => user.steamId === id)) {
    return { error: "User already has access" };
  }

  data.users.push({ steamId: id, role: "user" });
  await saveUsersData(env, data);
  return { member: { steamId: id, role: "user", removable: true, roleEditable: false } };
}

export async function removeManagedUser(env, steamId, actorSteamId, actorRole) {
  const id = String(steamId).trim();
  const actorId = String(actorSteamId).trim();

  if (id === actorId) {
    return { error: "Cannot remove yourself" };
  }

  if (isEnvOwner(id, env)) {
    return { error: "Cannot remove an owner" };
  }

  const data = await loadUsersData(env);
  const kvMember = data.users.find((user) => user.steamId === id);
  if (kvMember?.role === "owner") {
    return { error: "Cannot remove an owner" };
  }

  if (actorRole !== "owner") {
    if (isEnvAdmin(id, env)) {
      return { error: "Cannot remove an administrator" };
    }
    if (kvMember?.role === "admin") {
      return { error: "Cannot remove an administrator" };
    }
  }

  let changed = false;

  if (isEnvAdmin(id, env)) {
    if (!data.revoked) {
      data.revoked = [];
    }
    if (!data.revoked.includes(id)) {
      data.revoked.push(id);
      changed = true;
    }
  }

  const index = data.users.findIndex((user) => user.steamId === id);
  if (index >= 0) {
    data.users.splice(index, 1);
    changed = true;
  }

  if (!changed) {
    return { error: "User not found" };
  }

  await saveUsersData(env, data);
  return { ok: true };
}

export async function updateManagedUserRole(env, actorSteamId, targetSteamId, newRole) {
  const targetId = String(targetSteamId).trim();
  const actorId = String(actorSteamId).trim();

  if (newRole !== "user" && newRole !== "admin") {
    return { error: "Role must be user or administrator" };
  }

  if (targetId === actorId) {
    return { error: "Cannot change your own role" };
  }

  if (isEnvOwner(targetId, env)) {
    return { error: "Cannot change an owner's role" };
  }

  const data = await loadUsersData(env);
  const kvMember = data.users.find((user) => user.steamId === targetId);
  if (kvMember?.role === "owner") {
    return { error: "Cannot change an owner's role" };
  }

  const envAdmin = isEnvAdmin(targetId, env);
  const inKv = Boolean(kvMember);
  const activeEnvAdmin = envAdmin && !(data.revoked || []).includes(targetId);

  if (!inKv && !activeEnvAdmin) {
    return { error: "User not found" };
  }

  if (!data.revoked) {
    data.revoked = [];
  }

  if (newRole === "admin") {
    data.revoked = data.revoked.filter((entry) => entry !== targetId);
    if (inKv) {
      kvMember.role = "admin";
    } else {
      data.users.push({ steamId: targetId, role: "admin" });
    }
  } else if (envAdmin) {
    if (!data.revoked.includes(targetId)) {
      data.revoked.push(targetId);
    }
    if (inKv) {
      kvMember.role = "user";
    }
  } else if (inKv) {
    kvMember.role = "user";
  }

  await saveUsersData(env, data);
  return {
    member: {
      steamId: targetId,
      role: newRole,
      removable: true,
      roleEditable: true,
    },
  };
}
