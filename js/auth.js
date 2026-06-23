let currentUser = null;

function getAuthEls() {
  return {
    gate: document.getElementById("auth-gate"),
    gateTitle: document.getElementById("auth-gate-title"),
    gateMessage: document.getElementById("auth-gate-message"),
    btnSteamLogin: document.getElementById("btn-steam-login"),
    headerUser: document.getElementById("header-user"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    btnLogout: document.getElementById("btn-logout"),
    appRoot: document.getElementById("app-root"),
  };
}

function getAuthErrorFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const auth = params.get("auth");
  const steamId = params.get("steamId");
  if (!auth) return null;

  if (auth === "forbidden") {
    const idHint = steamId
      ? ` Your Steam ID64 is ${steamId} — send this to an admin to be added.`
      : "";
    return `Your Steam account is not on the circle allowlist yet.${idHint}`;
  }
  if (auth === "error") {
    return "Steam sign-in failed. Please try again.";
  }
  return null;
}

function clearAuthQuery() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("auth")) return;
  url.searchParams.delete("auth");
  url.searchParams.delete("steamId");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

function showGate({ title, message, showLogin = true }) {
  const els = getAuthEls();
  els.gateTitle.textContent = title;
  els.gateMessage.textContent = message;
  els.btnSteamLogin.classList.toggle("hidden", !showLogin);
  els.gate.classList.remove("hidden");
  els.appRoot.classList.add("hidden");
  els.headerUser.classList.add("hidden");
}

function showApp(user) {
  const els = getAuthEls();
  currentUser = user;
  els.gate.classList.add("hidden");
  els.appRoot.classList.remove("hidden");
  els.headerUser.classList.remove("hidden");

  const label = user.name || `Steam user ${user.steamId}`;
  els.userName.textContent = label;
  if (user.avatar) {
    els.userAvatar.src = user.avatar;
    els.userAvatar.alt = label;
    els.userAvatar.classList.remove("hidden");
  } else {
    els.userAvatar.classList.add("hidden");
  }
}

export function getCurrentUser() {
  return currentUser;
}

export async function initAuth() {
  const els = getAuthEls();
  const authError = getAuthErrorFromUrl();
  clearAuthQuery();

  els.btnLogout?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    window.location.reload();
  });

  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!response.ok) {
      showGate({
        title: "Circle members only",
        message:
          authError ||
          "Sign in with Steam to access trick locations and videos. Only approved circle members can view the guide.",
        showLogin: true,
      });
      return { ok: false, reason: "unauthenticated" };
    }

    const user = await response.json();
    if (!user.authenticated) {
      showGate({
        title: "Circle members only",
        message: authError || "Sign in with Steam to continue.",
        showLogin: true,
      });
      return { ok: false, reason: "unauthenticated" };
    }

    showApp(user);
    return { ok: true, user };
  } catch (error) {
    console.error(error);
    showGate({
      title: "Authentication unavailable",
      message:
        "Could not reach the auth API. Run the site with Cloudflare Pages (`npm run dev`) instead of a plain static server.",
      showLogin: false,
    });
    return { ok: false, reason: "offline" };
  }
}

export async function loadProtectedPins() {
  const response = await fetch("/api/pins", { credentials: "same-origin" });
  if (response.status === 401) {
    showGate({
      title: "Circle members only",
      message: "Sign in with Steam to access trick locations and videos.",
      showLogin: true,
    });
    throw new Error("unauthenticated");
  }
  if (response.status === 403) {
    showGate({
      title: "Access not granted",
      message:
        "You signed in with Steam, but your account is not on the circle allowlist yet. Ask an admin to add your Steam ID.",
      showLogin: false,
    });
    throw new Error("forbidden");
  }
  if (!response.ok) {
    throw new Error("Failed to load protected pin data");
  }
  return response.json();
}
