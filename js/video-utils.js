export function isDirectVideo(url) {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}

export function toEmbedUrl(url, { autoplay = false, mute = false } = {}) {
  if (!url) return url;

  if (isDirectVideo(url)) return url;

  try {
    const parsed = new URL(url, window.location.href);

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
  } catch {
    return url;
  }

  return url;
}

export function createVideoElement(url, { autoplay = false, muted = false, controls = true } = {}) {
  if (isDirectVideo(url)) {
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
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullscreen = true;
  iframe.title = "Trick video";
  return iframe;
}

export function youtubeThumbnail(url) {
  try {
    const parsed = new URL(url, window.location.href);
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
