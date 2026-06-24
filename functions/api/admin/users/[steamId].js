import { requireAdmin, requireOwner } from "../../../lib/auth-request.js";
import { removeManagedUser, updateManagedUserRole } from "../../../lib/roles.js";
import { fetchSteamProfile } from "../../../lib/steam.js";
import { isValidSteamId64 } from "../../../lib/users-store.js";
import { errorResponse, json } from "../../../lib/response.js";

export async function onRequestDelete(context) {
  const auth = await requireAdmin(context);
  if (auth.error) {
    return auth.error;
  }

  const steamId = String(context.params.steamId || "").trim();
  if (!isValidSteamId64(steamId)) {
    return errorResponse("Invalid Steam ID64", 400);
  }

  const result = await removeManagedUser(
    context.env,
    steamId,
    auth.session.steamId,
    auth.role
  );
  if (result.error) {
    const status = result.error === "User not found" ? 404 : 403;
    return errorResponse(result.error, status);
  }

  return json({ ok: true, steamId });
}

export async function onRequestPatch(context) {
  const auth = await requireOwner(context);
  if (auth.error) {
    return auth.error;
  }

  const steamId = String(context.params.steamId || "").trim();
  if (!isValidSteamId64(steamId)) {
    return errorResponse("Invalid Steam ID64", 400);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const role = String(body.role || "").trim();
  if (role !== "user" && role !== "admin") {
    return errorResponse("Role must be user or admin", 400);
  }

  const result = await updateManagedUserRole(
    context.env,
    auth.session.steamId,
    steamId,
    role
  );
  if (result.error) {
    const status = result.error === "User not found" ? 404 : 403;
    return errorResponse(result.error, status);
  }

  const profile = await fetchSteamProfile(steamId, context.env);
  return json({
    user: {
      steamId,
      name: profile.name,
      role: result.member.role,
      removable: result.member.removable,
      roleEditable: result.member.roleEditable,
    },
  });
}
