const MEDAL_API = "https://medal.tv/api/content";

export function extractMedalClipCandidates(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.replace(/^www\./, "") !== "medal.tv") {
      return [];
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const candidates = new Set();

    const clipsIdx = parts.indexOf("clips");
    if (clipsIdx >= 0 && parts[clipsIdx + 1]) {
      candidates.add(parts[clipsIdx + 1]);
    }

    const clipIdx = parts.indexOf("clip");
    if (clipIdx >= 0 && parts[clipIdx + 1]) {
      candidates.add(parts[clipIdx + 1]);
      if (parts[clipIdx + 2]) {
        candidates.add(parts[clipIdx + 2]);
      }
    }

    return [...candidates];
  } catch {
    return [];
  }
}

async function fetchMedalContent(contentId) {
  const response = await fetch(`${MEDAL_API}/${encodeURIComponent(contentId)}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (!data?.contentUrl) {
    return null;
  }

  return {
    contentId: data.contentId || contentId,
    title: data.contentTitle || null,
    contentUrl:
      data.contentUrl720p ||
      data.contentUrl1080p ||
      data.contentUrl480p ||
      data.contentUrl ||
      null,
    thumbnailUrl: data.thumbnailUrl || data.thumbnail720p || null,
    shareUrl: data.contentShareUrl || null,
  };
}

async function scrapeMedalClipFromPage(pageUrl) {
  const response = await fetch(pageUrl, {
    headers: { Accept: "text/html" },
  });
  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const contentUrlMatch = html.match(/"contentUrl":"(https:\\\/\\\/cdn\.medal\.tv[^"]+)"/);
  if (contentUrlMatch) {
    const contentUrl = contentUrlMatch[1].replace(/\\\//g, "/");
    const contentIdMatch = html.match(/"contentId":"([^"]+)"/);
    const titleMatch = html.match(/"contentTitle":"([^"]*)"/);
    const thumbnailMatch = html.match(/"thumbnailUrl":"(https:\\\/\\\/cdn\.medal\.tv[^"]+)"/);
    return {
      contentId: contentIdMatch?.[1] || null,
      title: titleMatch?.[1] || null,
      contentUrl,
      thumbnailUrl: thumbnailMatch?.[1]?.replace(/\\\//g, "/") || null,
      shareUrl: pageUrl,
    };
  }

  return null;
}

export async function resolveMedalClip(url) {
  const candidates = extractMedalClipCandidates(url);
  for (const candidate of candidates) {
    const resolved = await fetchMedalContent(candidate);
    if (resolved?.contentUrl) {
      return resolved;
    }
  }

  return scrapeMedalClipFromPage(url);
}
