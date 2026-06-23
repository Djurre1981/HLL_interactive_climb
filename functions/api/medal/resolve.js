import { isAllowedSteamId } from "../../lib/allowlist.js";
import { resolveMedalClip } from "../../lib/medal.js";
import { errorResponse, json } from "../../lib/response.js";
import { verifySession } from "../../lib/session.js";

export async function onRequestGet(context) {
  const session = await verifySession(context.request, context.env);
  if (!session) {
    return errorResponse("Sign in required", 401);
  }

  if (!isAllowedSteamId(session.steamId, context.env)) {
    return errorResponse("Not authorized for this circle", 403);
  }

  const url = new URL(context.request.url).searchParams.get("url");
  if (!url) {
    return errorResponse("Missing url parameter", 400);
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.replace(/^www\./, "") !== "medal.tv") {
      return errorResponse("Not a Medal.tv URL", 400);
    }
  } catch {
    return errorResponse("Invalid url parameter", 400);
  }

  try {
    const clip = await resolveMedalClip(url);
    if (!clip?.contentUrl) {
      return errorResponse("Could not resolve Medal.tv clip", 404);
    }

    return json(clip, {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Medal resolve failed:", error);
    return errorResponse("Failed to resolve Medal.tv clip", 502);
  }
}
