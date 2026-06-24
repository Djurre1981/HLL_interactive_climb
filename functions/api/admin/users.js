import { requireAdmin } from "../../lib/auth-request.js";
import { addManagedUser, listAllMembers } from "../../lib/roles.js";
import { fetchSteamProfile } from "../../lib/steam.js";
import { isValidSteamId64 } from "../../lib/users-store.js";
import { errorResponse, json } from "../../lib/response.js";

async function enrichMembers(members, env) {
  return Promise.all(
    members.map(async (member) => {
      const profile = await fetchSteamProfile(member.steamId, env);
      return {
        steamId: member.steamId,
        name: profile.name,
        role: member.role,
        removable: member.removable,
        roleEditable: member.roleEditable,
      };
    })
  );
}

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.error) {
    return auth.error;
  }

  const members = await listAllMembers(context.env, auth.role);
  const users = await enrichMembers(members, context.env);
  return json({ users });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context);
  if (auth.error) {
    return auth.error;
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const steamId = String(body.steamId || "").trim();
  if (!isValidSteamId64(steamId)) {
    return errorResponse("Enter a valid Steam ID64 (17 digits, starts with 7656119)", 400);
  }

  const result = await addManagedUser(context.env, steamId);
  if (result.error) {
    return errorResponse(result.error, 400);
  }

  const profile = await fetchSteamProfile(steamId, context.env);
  return json(
    {
      user: {
        steamId,
        name: profile.name,
        role: "user",
        removable: true,
      },
    },
    { status: 201 }
  );
}
