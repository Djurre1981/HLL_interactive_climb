import { clearSessionCookie } from "../../lib/session.js";
import { json } from "../../lib/response.js";

export async function onRequestPost(context) {
  return json({ ok: true }, {
    headers: { "Set-Cookie": clearSessionCookie(context.request) },
  });
}
