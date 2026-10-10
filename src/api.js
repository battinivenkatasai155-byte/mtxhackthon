const request = async (method, url, body) => {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("Cannot reach the server. Check your connection and try again."), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status, field: data.field });
  return data;
};

export const api = {
  me: () => request("GET", "/api/auth/me"),
  publicStats: () => request("GET", "/api/public-stats"),
  login: (portal, identifier, password) => request("POST", "/api/auth/login", { portal, identifier, password }),
  register: (data) => request("POST", "/api/auth/register", data),
  registerAdmin: (data) => request("POST", "/api/auth/admin-register", data),
  logout: () => request("POST", "/api/auth/logout"),
  bootstrap: () => request("GET", "/api/bootstrap"),
  updateProfile: (data) => request("PATCH", "/api/me", data),
  submitComplaint: (data) => request("POST", "/api/complaints", data),
  uploadAttachment: async (id, file) => {
    const res = await fetch(`/api/complaints/${encodeURIComponent(id)}/attachment?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "The attachment could not be uploaded.");
    return data;
  },
  updateComplaint: (id, data) => request("PATCH", `/api/complaints/${encodeURIComponent(id)}`, data),
  addDepartment: (data) => request("POST", "/api/departments", data),
  markRead: () => request("POST", "/api/notifications/read"),
};
