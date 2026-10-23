(() => {
  "use strict";

  const config = window.SeasonDealsAdminConfig;

  async function request(path, options = {}) {
    const token = sessionStorage.getItem(config.tokenKey);
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await fetch(`${config.apiBase}${path}`, {
        ...options,
        mode: "cors",
        credentials: "omit",
        headers
      });
    } catch {
      throw createError("De adminservice is niet bereikbaar.", 0);
    }

    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }

    if (!response.ok) {
      const message = data?.message || data?.error || data?.detail || `Aanroep mislukt (${response.status}).`;
      if (response.status === 401) clearSession();
      throw createError(typeof message === "string" ? message : "De aanvraag is mislukt.", response.status, data);
    }
    return data;
  }

  function createError(message, status, data) {
    const error = new Error(message);
    error.status = status;
    error.data = data;
    return error;
  }

  async function requireAuth() {
    if (!sessionStorage.getItem(config.tokenKey)) return redirectToLogin();
    try {
      const response = await request("/auth/me");
      const admin = response?.admin || response?.data || response;
      sessionStorage.setItem(config.userKey, JSON.stringify(admin));
      return admin;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        clearSession();
        redirectToLogin();
      }
      throw error;
    }
  }

  function mountShell({ active, title, subtitle }, admin) {
    const page = document.getElementById("admin-page");
    const name = admin?.name || "Beheerder";
    const role = label(admin?.role || "admin");
    const nav = [
      ["dashboard", "index.html", "Dashboard", dashboardIcon()],
      ["hotels", "hotels.html", "Partners", hotelsIcon()],
      ["suppliers", "suppliers.html", "Leveranciers", integrationsIcon()],
      ["orders", "orders.html", "Omzet & orders", ordersIcon()],
      ["deals", "deals.html", "Deals", dealsIcon()],
      ["integrations", "integrations.html", "Integratiebeheer", integrationsIcon()]
    ];
    const shell = document.createElement("div");
    shell.className = "admin-shell";
    shell.innerHTML = `
      <div id="admin-overlay" class="admin-overlay"></div>
      <aside id="admin-sidebar" class="admin-sidebar">
        <div class="admin-brand"><span class="admin-brand-mark">S</span><div><strong>SeasonDeals</strong><span>Admin Portal</span></div></div>
        <nav class="admin-nav"><span class="admin-nav-label">Beheer</span>${nav.map(([key, href, text, icon]) => `<a class="admin-nav-link${active === key ? " is-active" : ""}" href="${href}">${icon}<span>${text}</span></a>`).join("")}</nav>
        <div class="admin-sidebar-bottom"><div class="admin-security"><span class="admin-security-dot"></span><div><strong>Beveiligde omgeving</strong><span>SeasonDeals operations</span></div></div><button id="admin-logout-side" class="admin-logout" type="button">${logoutIcon()}<span>Uitloggen</span></button></div>
      </aside>
      <div class="admin-main">
        <header class="admin-topbar">
          <button id="admin-menu" class="icon-button mobile-only" type="button" aria-label="Menu openen">${menuIcon()}</button>
          <div class="admin-topbar-copy"><span>SeasonDeals beheer</span><strong>${escapeHtml(title)}</strong></div>
          <div class="admin-account-wrap">
            <button id="admin-account" class="admin-account" type="button"><span class="admin-avatar">${escapeHtml(initial(name))}</span><span class="admin-account-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(role)}</small></span><span class="chevron">⌄</span></button>
            <div id="admin-account-menu" class="admin-account-menu"><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(admin?.email || "")}</span></div><button id="admin-logout-menu" type="button">Uitloggen</button></div>
          </div>
        </header>
        <div class="admin-page-heading"><div><span class="eyebrow">Admin Portal</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle || "")}</p></div></div>
      </div>`;
    document.body.prepend(shell);
    shell.querySelector(".admin-main").append(page);
    bindShell();
  }

  function bindShell() {
    const sidebar = document.getElementById("admin-sidebar");
    const overlay = document.getElementById("admin-overlay");
    const close = () => { sidebar?.classList.remove("is-open"); overlay?.classList.remove("is-visible"); };
    document.getElementById("admin-menu")?.addEventListener("click", () => { sidebar?.classList.add("is-open"); overlay?.classList.add("is-visible"); });
    overlay?.addEventListener("click", close);
    const menu = document.getElementById("admin-account-menu");
    document.getElementById("admin-account")?.addEventListener("click", (event) => { event.stopPropagation(); menu?.classList.toggle("is-open"); });
    document.addEventListener("click", () => menu?.classList.remove("is-open"));
    ["admin-logout-side", "admin-logout-menu"].forEach((id) => document.getElementById(id)?.addEventListener("click", () => { clearSession(); redirectToLogin(); }));
  }

  function clearSession() {
    sessionStorage.removeItem(config.tokenKey);
    sessionStorage.removeItem(config.userKey);
  }

  function redirectToLogin() { location.replace(config.loginUrl); }
  function redirectToDashboard() { location.replace(config.dashboardUrl); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
  function label(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
  function initial(value) { return String(value || "S").trim().charAt(0).toUpperCase(); }
  function money(value) { return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value) || 0); }
  function date(value, includeTime = false) {
    if (!value) return "—";
    const number = Number(value);
    const parsed = Number.isFinite(number) ? new Date(number) : new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";
    return new Intl.DateTimeFormat("nl-NL", includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(parsed);
  }
  function statusLabel(status) { return ({ draft: "Concept", pending_approval: "Te beoordelen", active: "Actief", rejected: "Afgewezen", paused: "Gepauzeerd", sold_out: "Uitverkocht", expired: "Verlopen", archived: "Gearchiveerd" })[status] || label(status); }
  function statusBadge(status) { return `<span class="status-badge status-${escapeHtml(status || "unknown")}"><span></span>${escapeHtml(statusLabel(status))}</span>`; }
  function imageUrl(images) {
    const image = Array.isArray(images) ? images[0] : null;
    const path = typeof image === "string" ? image : image?.url || image?.path;
    if (!path) return "";
    return path.startsWith("http") ? path : config.xanoOrigin + path;
  }
  function toast(message, type = "success") {
    let container = document.querySelector(".toast-container");
    if (!container) { container = document.createElement("div"); container.className = "toast-container"; document.body.append(container); }
    const item = document.createElement("div"); item.className = `toast toast-${type}`; item.textContent = message; container.append(item);
    setTimeout(() => item.classList.add("is-visible"), 10);
    setTimeout(() => { item.classList.remove("is-visible"); setTimeout(() => item.remove(), 250); }, 4200);
  }
  function pick(object, paths, fallback = 0) {
    for (const path of paths) {
      const value = path.split(".").reduce((current, key) => current?.[key], object);
      if (value !== undefined && value !== null) return value;
    }
    return fallback;
  }
  function canReview(admin) { return ["superadmin", "platform_admin"].includes(admin?.role); }

  function dashboardIcon() { return '<svg viewBox="0 0 24 24"><path d="M4 4h6v7H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 15h6v5H4z"/></svg>'; }
  function dealsIcon() { return '<svg viewBox="0 0 24 24"><path d="M4 7h16v13H4zM8 7V4h8v3M8 12h8"/></svg>'; }
  function hotelsIcon() { return '<svg viewBox="0 0 24 24"><path d="M4 20V6h10v14M14 10h6v10M7 9h4M7 13h4M7 17h4M17 13h1M17 16h1"/></svg>'; }
  function ordersIcon() { return '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>'; }
  function integrationsIcon() { return '<svg viewBox="0 0 24 24"><path d="M8 7h8M7 4v6M17 4v6M6 14h12v6H6zM9 14v-4M15 14v-4"/></svg>'; }
  function logoutIcon() { return '<svg viewBox="0 0 24 24"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/></svg>'; }
  function menuIcon() { return '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'; }

  window.AdminCore = { config, request, requireAuth, mountShell, clearSession, redirectToLogin, redirectToDashboard, escapeHtml, label, money, date, statusLabel, statusBadge, imageUrl, toast, pick, canReview };
})();
