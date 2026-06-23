import { isMedalUrl } from "./video-utils.js";

const cache = new Map();

export async function resolveMedalClip(url) {
  if (!isMedalUrl(url)) {
    return null;
  }

  if (cache.has(url)) {
    return cache.get(url);
  }

  const response = await fetch(`/api/medal/resolve?url=${encodeURIComponent(url)}`, {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Failed to resolve Medal.tv clip");
  }

  const data = await response.json();
  cache.set(url, data);
  return data;
}

export function clearMedalCache() {
  cache.clear();
}
