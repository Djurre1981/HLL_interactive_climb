async function adminApiRequest(url, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export async function fetchManagedUsers() {
  const data = await adminApiRequest("/api/admin/users");
  return data.users || [];
}

export async function addManagedUser(steamId) {
  const data = await adminApiRequest("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({ steamId }),
  });
  return data.user;
}

export async function removeManagedUser(steamId) {
  await adminApiRequest(`/api/admin/users/${encodeURIComponent(steamId)}`, {
    method: "DELETE",
  });
}

export async function updateManagedUserRole(steamId, role) {
  const data = await adminApiRequest(`/api/admin/users/${encodeURIComponent(steamId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  return data.user;
}
