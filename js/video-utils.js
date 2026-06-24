export function isDirectVideo(url) {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

export function isDiscordMediaUrl(url) {
  const hostname = getHostname(url);
  if (hostname !== "cdn.discordapp.com" && hostname !== "media.discordapp.net") {
    return false;
  }

  const parsed = parseMediaUrl(url);
  return parsed?.pathname.includes("/attachments/") ?? false;
}

export function isPlayableDirectUrl(url) {
  return isDirectVideo(url) || isDiscordMediaUrl(url);
}

export function normalizeVideoUrl(url) {
  return String(url || "").trim();
}

function parseMediaUrl(url) {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    try {
      const base = typeof window !== "undefined" ? window.location.href : "https://localhost/";
      return new URL(url, base);
    } catch {
      return null;
    }
  }
}

function getHostname(url) {
  const parsed = parseMediaUrl(url);
  return parsed?.hostname.replace(/^www\./, "") || "";
}

export function isMedalUrl(url) {
  return getHostname(url) === "medal.tv";
}

export function isYoutubeUrl(url) {
  const hostname = getHostname(url);
  return hostname.includes("youtube.com") || hostname === "youtu.be";
}

export function isVimeoUrl(url) {
  return getHostname(url).includes("vimeo.com");
}

export function isSupportedVideoUrl(url) {
  const normalized = normalizeVideoUrl(url);
  if (!normalized) {
    return false;
  }

  return (
    isYoutubeUrl(normalized) ||
    isMedalUrl(normalized) ||
    isDiscordMediaUrl(normalized) ||
    isPlayableDirectUrl(normalized) ||
    isVimeoUrl(normalized)
  );
}

export function getUnsupportedVideoUrlMessage() {
  return "Use a YouTube, Medal.tv, Discord attachment, Vimeo, or direct .mp4 link.";
}

export function toEmbedUrl(url, { autoplay = false, mute = false } = {}) {
  if (!url) return url;

  if (isPlayableDirectUrl(url)) return url;

  try {
    const parsed = parseMediaUrl(url);
    if (!parsed) return url;

    if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
      let videoId = parsed.searchParams.get("v");
      if (!videoId && parsed.hostname.includes("youtu.be")) {
        videoId = parsed.pathname.replace("/", "");
      }
      if (!videoId && parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/embed/")[1]?.split("/")[0];
      }
      if (videoId) {
        const params = new URLSearchParams({
          rel: "0",
          modestbranding: "1",
        });
        if (autoplay) params.set("autoplay", "1");
        if (mute || autoplay) params.set("mute", "1");
        return `https://www.youtube.com/embed/${videoId}?${params}`;
      }
    }

    if (parsed.hostname.includes("vimeo.com")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const id = parts[parts.length - 1];
      if (id) {
        const params = new URLSearchParams();
        if (autoplay) params.set("autoplay", "1");
        if (mute || autoplay) params.set("muted", "1");
        const query = params.toString();
        return `https://player.vimeo.com/video/${id}${query ? `?${query}` : ""}`;
      }
    }

    // Medal.tv blocks external iframes; callers must resolve to MP4 first.
  } catch {
    return url;
  }

  return url;
}

export function createVideoElement(url, { autoplay = false, muted = false, controls = true } = {}) {
  if (isPlayableDirectUrl(url)) {
    const video = document.createElement("video");
    video.src = url;
    video.controls = controls;
    video.playsInline = true;
    if (autoplay) video.autoplay = true;
    if (muted) video.muted = true;
    if (autoplay) video.play().catch(() => {});
    return video;
  }

  const iframe = document.createElement("iframe");
  iframe.src = toEmbedUrl(url, { autoplay, mute: muted });
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
  iframe.allowFullscreen = true;
  iframe.title = "Trick video";
  return iframe;
}

export function youtubeThumbnail(url) {
  try {
    const parsed = parseMediaUrl(url);
    if (!parsed) return null;
    let videoId = parsed.searchParams.get("v");
    if (!videoId && parsed.hostname.includes("youtu.be")) {
      videoId = parsed.pathname.replace("/", "");
    }
    if (!videoId && parsed.pathname.startsWith("/embed/")) {
      videoId = parsed.pathname.split("/embed/")[1]?.split("/")[0];
    }
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
  } catch {
    return null;
  }
  return null;
}
