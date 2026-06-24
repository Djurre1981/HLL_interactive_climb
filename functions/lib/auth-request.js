import { getUserRole, isStaffRole } from "./roles.js";
import { errorResponse } from "./response.js";
import { verifySession } from "./session.js";

export async function requireAuth(context) {
  const session = await verifySession(context.request, context.env);
  if (!session) {
    return { error: errorResponse("Sign in required", 401) };
  }

  const role = await getUserRole(session.steamId, context.env);
  if (!role) {
    return { error: errorResponse("Not authorized for this circle", 403) };
  }

  return { session, role };
}

export async function requireAdmin(context) {
  const auth = await requireAuth(context);
  if (auth.error) {
    return auth;
  }

  if (!isStaffRole(auth.role)) {
    return { error: errorResponse("Administrators only", 403) };
  }

  return auth;
}

export async function requireOwner(context) {
  const auth = await requireAuth(context);
  if (auth.error) {
    return auth;
  }

  if (auth.role !== "owner") {
    return { error: errorResponse("Owners only", 403) };
  }

  return auth;
}
