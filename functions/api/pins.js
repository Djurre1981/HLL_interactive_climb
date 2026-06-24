import { requireAuth } from "../lib/auth-request.js";
import { enrichPinsData, resolveCreatorName } from "../lib/pin-creators.js";
import { loadPinsData, savePinsData } from "../lib/pins-store.js";
import { errorResponse, json } from "../lib/response.js";

function buildPinFromBody(pin, createdBy) {
  const next = {
    id: pin.id,
    title: String(pin.title || "").trim(),
    description: String(pin.description || "").trim(),
    tag: pin.tag || "climb",
    x: Number(pin.x),
    y: Number(pin.y),
    videoUrl: String(pin.videoUrl || "").trim(),
    createdBy,
  };

  if (!next.title) {
    return { error: "Title is required" };
  }
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) {
    return { error: "Valid pin coordinates are required" };
  }

  const thumbnail = String(pin.thumbnail || "").trim();
  if (thumbnail) {
    next.thumbnail = thumbnail;
  }

  return { pin: next };
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth.error) {
    return auth.error;
  }

  const data = await loadPinsData(context.env);
  const enriched = await enrichPinsData(data, context.env);
  return json(enriched);
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context);
  if (auth.error) {
    return auth.error;
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { mapId, pin } = body;
  if (!mapId || !pin) {
    return errorResponse("mapId and pin are required", 400);
  }

  const built = buildPinFromBody(pin, auth.session.steamId);
  if (built.error) {
    return errorResponse(built.error, 400);
  }

  const createdByName = await resolveCreatorName(
    auth.session.steamId,
    context.env,
    auth.session
  );

  const data = await loadPinsData(context.env);
  if (!data.pins[mapId]) {
    data.pins[mapId] = [];
  }

  const newPin = {
    ...built.pin,
    id: built.pin.id || `pin-${crypto.randomUUID()}`,
    createdBy: auth.session.steamId,
    createdByName,
  };

  data.pins[mapId].push(newPin);

  try {
    await savePinsData(context.env, data);
  } catch (error) {
    console.error(error);
    return errorResponse("Pin storage is not configured", 503);
  }

  return json({ pin: newPin, mapId }, { status: 201 });
}
