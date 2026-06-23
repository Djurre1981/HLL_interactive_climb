import { buildSteamLoginUrl } from "../../lib/steam.js";
import { redirect } from "../../lib/response.js";

export async function onRequestGet(context) {
  return redirect(buildSteamLoginUrl(context.request));
}
