import { verifySession } from "../../lib/session.js";
import { json } from "../../lib/response.js";

export async function onRequestGet(context) {
  const session = await verifySession(context.request, context.env);
  if (!session) {
    return json({ authenticated: false }, { status: 401 });
  }

  return json({
    authenticated: true,
    steamId: session.steamId,
    name: session.name,
    avatar: session.avatar,
  });
}
