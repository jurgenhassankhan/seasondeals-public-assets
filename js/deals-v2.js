(() => {
  "use strict";

  const CONFIG = {
    dealsEndpoint: "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-partner/deals",
    loginUrl: "/seasondeals-public-assets/login.html",
    tokenKey: "sd_partner_token",
    userKey: "sd_partner_user",
    locale: "nl-NL",
    currency: "EUR"
  };

  const elements = {
    sidebar: document.getElementById("sd-sidebar"),
    overlay: document.getElementById("sd-mobile-overlay"),
    menuToggle: document.getElementById("sd-menu-toggle"),
    sidebarClose: document.getElementById("sd-sidebar-close"),
    userMenuButton: document.getElementById("sd-user-menu-button"),
    userDropdown: document.getElementById("sd-user-dropdown"),
    sidebarLogout: document.getElementById("sd-sidebar-logout"),
    dropdownLogout: document.getElementById("sd-dropdown-logout"),
    refreshButton: document.getElementById("sd-refresh-button"),
    sidebarHotel: document.getElementById("sd-sidebar-hotel"),
    sidebarRole: document.getElementById("sd-sidebar-role"),
    hotelAvatar: document.getElementById("sd-hotel-avatar"),
    topbarHotel: document.getElementById("sd-topbar-hotel"),
    userName: document.getElementById("sd-user-name"),
    userRole: document.getElementById("sd-user-role"),
    userAvatar: document.getElementById("sd-user-avatar"),
    dropdownName: document.getElementById("sd-dropdown-name"),
    dropdownEmail: document.getElementById("sd-dropdown-email"),
    globalMessage: document.getElementById("sd-global-message"),
    loading: document.getElementById("sd-deals-loading"),
    content: document.getElementById("sd-deals-content"),
    list: document.getElementById("sd-deals-list"),
    empty: document.getElementById("sd-deals-empty"),
    summary: document.getElementById("sd-deals-summary"),
    search: document.getElementById("sd-deals-search"),
    filters: Array.from(document.querySelectorAll(".sd-filter-button"))
  };

  let deals = [];
  let activeFilter = "all";

  init();

  function init() {
    const token = sessionStorage.getItem(CONFIG.tokenKey);

    if (!token) {
      redirectToLogin();
      return;
    }

    renderUser(readStoredUser());
    bindEvents();
    loadDeals();
  }

  function showStoredFlashMessage() {
    const message = sessionStorage.getItem("sd_deal_flash");
    if (!message) return;
    sessionStorage.removeItem("sd_deal_flash");
    showGlobalMessage(message, "info");
  }

  function bindEvents() {
    elements.menuToggle?.addEventListener("click", openSidebar);
    elements.sidebarClose?.addEventListener("click", closeSidebar);
    elements.overlay?.addEventListener("click", closeSidebar);
    elements.userMenuButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      elements.userDropdown?.classList.toggle("is-open");
    });
    document.addEventListener("click", () => elements.userDropdown?.classList.remove("is-open"));
    elements.sidebarLogout?.addEventListener("click", logout);
    elements.dropdownLogout?.addEventListener("click", logout);
    elements.refreshButton?.addEventListener("click", () => loadDeals(true));
    elements.search?.addEventListener("input", renderDeals);
    elements.filters.forEach((button) => {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter || "all";
        elements.filters.forEach((item) => item.classList.toggle("is-active", item === button));
        renderDeals();
      });
    });
  }

  async function loadDeals(isRefresh = false) {
    clearGlobalMessage();

    if (!isRefresh) {
      elements.loading?.classList.remove("is-hidden");
      elements.content?.classList.remove("is-visible");
    }

    if (elements.refreshButton) elements.refreshButton.disabled = true;

    try {
      const data = await apiRequest(CONFIG.dealsEndpoint);
      updateUserFromResponse(data);
      deals = resolveDeals(data);
      renderDeals();
      showStoredFlashMessage();
      if (!deals.length) {
        showGlobalMessage("De API is bereikbaar, maar heeft voor dit hotel 0 deals teruggegeven.", "info");
      }
      elements.loading?.classList.add("is-hidden");
      elements.content?.classList.add("is-visible");
    } catch (error) {
      console.error("SeasonDeals deals failed:", error);
      elements.loading?.classList.add("is-hidden");
      elements.content?.classList.add("is-visible");
      elements.list.innerHTML = "";
      elements.empty?.classList.add("is-visible");
      setText(elements.summary, "Deals niet beschikbaar");
      showGlobalMessage(error?.message || "De deals konden niet worden geladen. Probeer het opnieuw.", "error");
    } finally {
      if (elements.refreshButton) elements.refreshButton.disabled = false;
    }
  }

  async function apiRequest(url) {
    const token = sessionStorage.getItem(CONFIG.tokenKey);

    if (!token) {
      redirectToLogin();
      throw new Error("Je sessie is verlopen.");
    }

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
      });
    } catch {
      throw new Error("De dealservice is niet bereikbaar. Controleer je verbinding en probeer opnieuw.");
    }

    const responseData = await readResponse(response);

    if (response.status === 401 || response.status === 403) {
      clearSession();
      window.setTimeout(redirectToLogin, 600);
      throw new Error("Je sessie is verlopen. Je wordt doorgestuurd naar de loginpagina.");
    }

    if (!response.ok) {
      const apiMessage = responseData?.message || responseData?.error || responseData?.detail;
      throw new Error(typeof apiMessage === "string" ? apiMessage : `Deals-aanroep mislukt met status ${response.status}.`);
    }

    return responseData;
  }

  async function readResponse(response) {
    const responseText = await response.text();
    if (!responseText) return {};
    try { return JSON.parse(responseText); } catch { return { message: responseText }; }
  }

  function resolveDeals(data) {
    const direct = [
      data,
      data?.items,
      data?.deals,
      data?.records,
      data?.result,
      data?.result?.items,
      data?.result?.deals,
      data?.data,
      data?.data?.items,
      data?.data?.deals,
      data?.data?.records,
      data?.response,
      data?.response?.items
    ];
    for (const value of direct) {
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  function renderDeals() {
    const query = (elements.search?.value || "").trim().toLowerCase();
    const filteredDeals = deals.filter((deal) => {
      const title = getDealTitle(deal).toLowerCase();
      return (!query || title.includes(query)) && matchesStatusFilter(deal, activeFilter);
    });

    elements.list.innerHTML = "";
    setText(elements.summary, `${formatNumber(filteredDeals.length)} van ${formatNumber(deals.length)} deals getoond`);
    elements.empty?.classList.toggle("is-visible", filteredDeals.length === 0);

    filteredDeals.forEach((deal) => elements.list.appendChild(createDealCard(deal)));
  }

  function createDealCard(deal) {
    const status = getDealStatus(deal);
    const stock = getNumber(deal.stock ?? deal.inventory ?? deal.available_quantity ?? deal.quantity_available ?? deal.remaining_inventory);
    const sold = getNumber(deal.sold ?? deal.sold_count ?? deal.sold_quantity ?? deal.sales_count ?? deal.bookings_count);
    const card = document.createElement("article");
    card.className = "sd-deal-card";
    card.innerHTML = `
      <div class="sd-deal-image-wrap">
        <img class="sd-deal-image" src="${escapeAttribute(getDealImage(deal))}" alt="${escapeAttribute(getDealTitle(deal))}" loading="lazy">
      </div>
      <div class="sd-deal-body">
        <div class="sd-deal-heading">
          <h2>${escapeHtml(getDealTitle(deal))}</h2>
          <span class="sd-status ${getStatusClass(status)}">${escapeHtml(status.label)}</span>
        </div>
        <strong class="sd-deal-price">${escapeHtml(formatCurrency(getDealPrice(deal)))}</strong>
        <dl class="sd-deal-stats">
          <div><dt>Voorraad</dt><dd>${escapeHtml(stock === null ? "Onbekend" : formatNumber(stock))}</dd></div>
          <div><dt>Verkocht</dt><dd>${escapeHtml(sold === null ? "0" : formatNumber(sold))}</dd></div>
        </dl>
      </div>`;
    const environment = String(deal.integration_environment || "").toLowerCase();
    const environmentLabel = environment === "production" ? "PRODUCTIE" : environment === "test" ? "TEST" : "HANDMATIG";
    const environmentBadge = document.createElement("span");
    environmentBadge.className = `sd-environment-badge sd-environment-${environment || "manual"}`;
    environmentBadge.textContent = environmentLabel;
    card.querySelector(".sd-deal-heading")?.append(environmentBadge);
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", `Bekijk ${getDealTitle(deal)}`);
    const openDeal = () => {
      if (deal?.id != null) window.location.href = `deal-detail.html?id=${encodeURIComponent(deal.id)}`;
    };
    card.addEventListener("click", openDeal);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDeal();
      }
    });
    return card;
  }

  function matchesStatusFilter(deal, filter) {
    if (filter === "all") return true;
    return getDealStatus(deal).key === filter;
  }

  function getDealStatus(deal) {
    const raw = String(deal.status ?? deal.state ?? deal.visibility ?? "").toLowerCase();
    const stock = getNumber(deal.stock ?? deal.inventory ?? deal.available_quantity ?? deal.quantity_available ?? deal.remaining_inventory);
    const isActive = deal.is_active ?? deal.active ?? deal.published;
    if (stock === 0 || raw.includes("sold")) return { key: "sold_out", label: "Uitverkocht" };
    if (raw.includes("pending")) return { key: "pending_approval", label: "In beoordeling" };
    if (raw.includes("draft")) return { key: "draft", label: "Concept" };
    if (isActive === false || raw.includes("inactive") || raw.includes("paused") || raw.includes("offline")) return { key: "inactive", label: "Inactief" };
    return { key: "active", label: "Actief" };
  }

  function getDealTitle(deal) { return textOrFallback(deal.title || deal.name || deal.deal_name || deal.deal_title, "SeasonDeals deal"); }
  function getDealImage(deal) {
    const firstImage = deal.images?.[0];
    return deal.image_url ||
      deal.image ||
      deal.photo_url ||
      deal.cover_image ||
      (typeof firstImage === "string" ? firstImage : firstImage?.url || firstImage?.path) ||
      deal.media?.[0]?.url ||
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80";
  }
  function getDealPrice(deal) { return normalizeMoney(deal.price ?? deal.amount ?? deal.from_price ?? deal.sale_price ?? deal.total_price); }

  function updateUserFromResponse(data) {
    const responseUser = data?.user || data?.partner || data?.hotel_user || data?.context?.user;
    const responseHotel = data?.hotel || data?.context?.hotel || responseUser?.hotel;
    if (!responseUser && !responseHotel) return;
    const updatedUser = { ...readStoredUser(), ...(responseUser || {}) };
    if (responseHotel) {
      updatedUser.hotel = responseHotel;
      updatedUser.hotel_name = responseHotel.name || responseHotel.hotel_name || updatedUser.hotel_name;
    }
    delete updatedUser.password;
    sessionStorage.setItem(CONFIG.userKey, JSON.stringify(updatedUser));
    renderUser(updatedUser);
  }

  function renderUser(user) {
    const name = textOrFallback(user?.name || user?.full_name, "Partner");
    const role = textOrFallback(user?.role, "hotel partner");
    const email = textOrFallback(user?.email, "");
    const hotelName = textOrFallback(user?.hotel_name || user?.hotel?.name || user?.hotel?.hotel_name, "SeasonDeals hotel partner");
    setText(elements.userName, name); setText(elements.userRole, formatLabel(role));
    setText(elements.dropdownName, name); setText(elements.dropdownEmail, email);
    setText(elements.userAvatar, getInitial(name)); setText(elements.hotelAvatar, getInitial(hotelName));
    setText(elements.sidebarHotel, hotelName); setText(elements.sidebarRole, formatLabel(role)); setText(elements.topbarHotel, hotelName);
  }

  function openSidebar() { elements.sidebar?.classList.add("is-open"); elements.overlay?.classList.add("is-visible"); document.body.style.overflow = "hidden"; }
  function closeSidebar() { elements.sidebar?.classList.remove("is-open"); elements.overlay?.classList.remove("is-visible"); document.body.style.overflow = ""; }
  function logout() { clearSession(); redirectToLogin(); }
  function clearSession() { sessionStorage.removeItem(CONFIG.tokenKey); sessionStorage.removeItem(CONFIG.userKey); }
  function redirectToLogin() { window.location.replace(CONFIG.loginUrl); }
  function readStoredUser() { try { return JSON.parse(sessionStorage.getItem(CONFIG.userKey) || "{}"); } catch { return {}; } }
  function showGlobalMessage(message, type) { elements.globalMessage.textContent = message; elements.globalMessage.className = `sd-global-message is-${type}`; }
  function clearGlobalMessage() { elements.globalMessage.textContent = ""; elements.globalMessage.className = "sd-global-message"; }
  function normalizeMoney(value) { const number = getNumber(value); return number === null ? 0 : Math.abs(number) >= 10000 ? number / 100 : number; }
  function getNumber(value) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim()) { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? parsed : null; } return null; }
  function formatNumber(value) { return new Intl.NumberFormat(CONFIG.locale, { maximumFractionDigits: 0 }).format(getNumber(value) || 0); }
  function formatCurrency(value) { return new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 2 }).format(getNumber(value) || 0); }
  function getStatusClass(status) { return status.key === "active" ? "sd-status-success" : status.key === "sold_out" ? "sd-status-warning" : status.key === "draft" ? "sd-status-warning" : "sd-status-neutral"; }
  function formatLabel(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
  function getInitial(value) { return String(value || "S").trim().charAt(0).toUpperCase(); }
  function textOrFallback(value, fallback) { return value === null || value === undefined || String(value).trim() === "" ? fallback : String(value); }
  function setText(element, value) { if (element) element.textContent = value; }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
