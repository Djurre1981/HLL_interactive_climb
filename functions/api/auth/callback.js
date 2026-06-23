import { isAllowedSteamId } from "../../lib/allowlist.js";
import { redirect } from "../../lib/response.js";
import { createSessionCookie, getSessionSecret } from "../../lib/session.js";
import { fetchSteamProfile, getOrigin, verifySteamCallback } from "../../lib/steam.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const steamId = await verifySteamCallback(request);
    const profile = await fetchSteamProfile(steamId, env);

    if (!isAllowedSteamId(steamId, env)) {
      const origin = getOrigin(request);
      return redirect(`${origin}/?auth=forbidden&steamId=${steamId}`);
    }

    const cookie = await createSessionCookie(profile, getSessionSecret(env), request);
    return redirect(getOrigin(request), {
      headers: { "Set-Cookie": cookie },
    });
  } catch (error) {
    console.error("Steam callback failed:", error);
    const origin = getOrigin(request);
    return redirect(`${origin}/?auth=error`);
  }
}
