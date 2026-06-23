import pinData from "../../data/pins.json";
import { isAllowedSteamId } from "../lib/allowlist.js";
import { errorResponse, json } from "../lib/response.js";
import { verifySession } from "../lib/session.js";

export async function onRequestGet(context) {
  const session = await verifySession(context.request, context.env);
  if (!session) {
    return errorResponse("Sign in required", 401);
  }

  if (!isAllowedSteamId(session.steamId, context.env)) {
    return errorResponse("Not authorized for this circle", 403);
  }

  return json(pinData);
}
