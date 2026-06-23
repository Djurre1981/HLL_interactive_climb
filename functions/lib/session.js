const COOKIE_NAME = "hll_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function base64urlEncode(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payloadB64, secret) {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return base64urlEncode(sig);
}

async function verifySignature(payloadB64, signature, secret) {
  const key = await importHmacKey(secret);
  const sigBytes = base64urlDecode(signature);
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payloadB64));
}

export function getSessionSecret(env) {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return secret;
}

function cookieFlags(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `; Path=/; HttpOnly${secure}; SameSite=Lax`;
}

export async function createSessionCookie(user, secret, request) {
  const payload = {
    steamId: user.steamId,
    name: user.name || null,
    avatar: user.avatar || null,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(payloadB64, secret);
  const value = `${payloadB64}.${signature}`;
  return `${COOKIE_NAME}=${value}${cookieFlags(request)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function clearSessionCookie(request) {
  return `${COOKIE_NAME}=;${cookieFlags(request).slice(1)}; Max-Age=0`;
}

export function readSessionCookie(request) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) {
      return rest.join("=");
    }
  }
  return null;
}

export async function verifySession(request, env) {
  const secret = getSessionSecret(env);
  const raw = readSessionCookie(request);
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const valid = await verifySignature(payloadB64, signature, secret);
  if (!valid) return null;

  try {
    const json = new TextDecoder().decode(base64urlDecode(payloadB64));
    const payload = JSON.parse(json);
    if (!payload.steamId || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
