(() => {
    "use strict";

    const CONFIG = {
      dashboardEndpoint:
        "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-partner/dashboard",

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

      welcomeTitle: document.getElementById("sd-welcome-title"),
      welcomeText: document.getElementById("sd-welcome-text"),

      loading: document.getElementById("sd-dashboard-loading"),
      content: document.getElementById("sd-dashboard-content"),
      globalMessage: document.getElementById("sd-global-message"),

      bookingsKpi: document.getElementById("sd-kpi-bookings"),
      dealsKpi: document.getElementById("sd-kpi-deals"),
      vouchersKpi: document.getElementById("sd-kpi-vouchers"),
      revenueKpi: document.getElementById("sd-kpi-revenue"),

      bookingsList: document.getElementById("sd-bookings-list"),
      bookingsEmpty: document.getElementById("sd-bookings-empty"),

      alertsList: document.getElementById("sd-alerts-list"),
      alertsEmpty: document.getElementById("sd-alerts-empty"),

      notificationsList: document.getElementById("sd-notifications-list"),
      notificationsEmpty: document.getElementById("sd-notifications-empty"),
      notificationDot: document.getElementById("sd-notification-dot"),

      debugPanel: document.getElementById("sd-debug-panel"),
      debugToggle: document.getElementById("sd-debug-toggle"),
      debugOutput: document.getElementById("sd-debug-output")
    };

    let rawDashboardData = null;

    init();

    function init() {
      const token = sessionStorage.getItem(CONFIG.tokenKey);

      if (!token) {
        redirectToLogin();
        return;
      }

      const user = readStoredUser();

      renderUser(user);
      bindEvents();
      loadDashboard();
    }

    function bindEvents() {
      elements.menuToggle?.addEventListener("click", openSidebar);
      elements.sidebarClose?.addEventListener("click", closeSidebar);
      elements.overlay?.addEventListener("click", closeSidebar);

      elements.userMenuButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        elements.userDropdown?.classList.toggle("is-open");
      });

      document.addEventListener("click", () => {
        elements.userDropdown?.classList.remove("is-open");
      });

      elements.sidebarLogout?.addEventListener("click", logout);
      elements.dropdownLogout?.addEventListener("click", logout);

      elements.refreshButton?.addEventListener("click", () => {
        loadDashboard(true);
      });

      elements.debugToggle?.addEventListener("click", () => {
        const expanded = elements.debugPanel.classList.toggle("is-expanded");
        elements.debugToggle.textContent = expanded
          ? "Hide response"
          : "Show response";
      });
    }

    function readStoredUser() {
      try {
        const storedValue = sessionStorage.getItem(CONFIG.userKey);

        if (!storedValue) {
          return {};
        }

        return JSON.parse(storedValue);
      } catch (error) {
        console.warn("Could not read stored partner user:", error);
        return {};
      }
    }

    function renderUser(user) {
      const name = textOrFallback(
        user?.name || user?.full_name,
        "Partner"
      );

      const role = textOrFallback(user?.role, "hotel partner");
      const email = textOrFallback(user?.email, "");
      const hotelName = textOrFallback(
        user?.hotel_name ||
          user?.hotel?.name ||
          user?.hotel?.hotel_name,
        "SeasonDeals hotel partner"
      );

      const userInitial = getInitial(name);
      const hotelInitial = getInitial(hotelName);

      setText(elements.userName, name);
      setText(elements.userRole, formatLabel(role));
      setText(elements.dropdownName, name);
      setText(elements.dropdownEmail, email);

      setText(elements.userAvatar, userInitial);
      setText(elements.hotelAvatar, hotelInitial);

      setText(elements.sidebarHotel, hotelName);
      setText(elements.sidebarRole, formatLabel(role));
      setText(elements.topbarHotel, hotelName);

      setText(elements.welcomeTitle, `Welcome back, ${firstName(name)}`);
    }

    async function loadDashboard(isRefresh = false) {
      clearGlobalMessage();

      if (!isRefresh) {
        elements.loading.classList.remove("is-hidden");
        elements.content.classList.remove("is-visible");
      }

      if (isRefresh && elements.refreshButton) {
        elements.refreshButton.disabled = true;
      }

      try {
        const data = await apiRequest(CONFIG.dashboardEndpoint);

        rawDashboardData = data;

        updateUserFromDashboard(data);
        renderDashboard(data);

        elements.loading.classList.add("is-hidden");
        elements.content.classList.add("is-visible");
      } catch (error) {
        console.error("SeasonDeals dashboard failed:", error);

        elements.loading.classList.add("is-hidden");
        elements.content.classList.add("is-visible");

        showGlobalMessage(
          error?.message ||
            "The dashboard could not be loaded. Please try again.",
          "error"
        );
      } finally {
        if (elements.refreshButton) {
          elements.refreshButton.disabled = false;
        }
      }
    }

    async function apiRequest(url, options = {}) {
      const token = sessionStorage.getItem(CONFIG.tokenKey);

      if (!token) {
        redirectToLogin();
        throw new Error("Your session has ended.");
      }

      let response;

      try {
        response = await fetch(url, {
          method: options.method || "GET",
          mode: "cors",
          credentials: "omit",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.body
              ? { "Content-Type": "application/json" }
              : {}),
            ...(options.headers || {})
          },
          body: options.body
            ? JSON.stringify(options.body)
            : undefined
        });
      } catch (error) {
        throw new Error(
          "The dashboard service could not be reached. Check your connection and try again."
        );
      }

      const responseData = await readResponse(response);

      if (response.status === 401 || response.status === 403) {
        clearSession();

        window.setTimeout(() => {
          redirectToLogin();
        }, 600);

        throw new Error(
          "Your session has expired. You are being redirected to the login page."
        );
      }

      if (!response.ok) {
        const apiMessage =
          responseData?.message ||
          responseData?.error ||
          responseData?.detail;

        throw new Error(
          typeof apiMessage === "string"
            ? apiMessage
            : `Dashboard request failed with status ${response.status}.`
        );
      }

      return responseData;
    }

    async function readResponse(response) {
      const responseText = await response.text();

      if (!responseText) {
        return {};
      }

      try {
        return JSON.parse(responseText);
      } catch {
        return { message: responseText };
      }
    }

    function updateUserFromDashboard(data) {
      const dashboardUser =
        data?.user ||
        data?.partner ||
        data?.hotel_user ||
        data?.context?.user;

      const dashboardHotel =
        data?.hotel ||
        data?.context?.hotel ||
        dashboardUser?.hotel;

      if (!dashboardUser && !dashboardHotel) {
        return;
      }

      const storedUser = readStoredUser();

      const updatedUser = {
        ...storedUser,
        ...(dashboardUser || {})
      };

      if (dashboardHotel) {
        updatedUser.hotel = dashboardHotel;
        updatedUser.hotel_name =
          dashboardHotel.name ||
          dashboardHotel.hotel_name ||
          updatedUser.hotel_name;
      }

      delete updatedUser.password;

      sessionStorage.setItem(
        CONFIG.userKey,
        JSON.stringify(updatedUser)
      );

      renderUser(updatedUser);
    }

    function renderDashboard(data) {
      const stats = resolveStats(data);

      setText(elements.bookingsKpi, formatNumber(stats.bookings));
      setText(elements.dealsKpi, formatNumber(stats.deals));
      setText(elements.vouchersKpi, formatNumber(stats.vouchers));
      setText(elements.revenueKpi, formatCurrency(stats.revenue));

      const bookings = resolveArray(data, [
        "recent_bookings",
        "bookings",
        "latest_bookings",
        "dashboard.recent_bookings",
        "data.recent_bookings"
      ]);

      const alerts = resolveArray(data, [
        "inventory_alerts",
        "low_inventory",
        "low_stock",
        "alerts",
        "dashboard.inventory_alerts",
        "data.inventory_alerts"
      ]);

      const notifications = resolveArray(data, [
        "notifications",
        "recent_notifications",
        "hotel_notifications",
        "dashboard.notifications",
        "data.notifications"
      ]);

      renderBookings(bookings);
      renderAlerts(alerts);
      renderNotifications(notifications);

      const hasRecognizedData =
        stats.hasRecognizedStats ||
        bookings.length > 0 ||
        alerts.length > 0 ||
        notifications.length > 0;

      elements.debugOutput.textContent = JSON.stringify(data, null, 2);
      elements.debugPanel.classList.toggle(
        "is-visible",
        !hasRecognizedData
      );
    }

    function resolveStats(data) {
      const sources = [
        data,
        data?.stats,
        data?.kpis,
        data?.summary,
        data?.dashboard,
        data?.dashboard?.stats,
        data?.data,
        data?.data?.stats
      ].filter(Boolean);

      const bookings = findFirstNumeric(sources, [
        "total_bookings",
        "bookings_count",
        "bookings",
        "booking_count",
        "recent_bookings_count"
      ]);

      const deals = findFirstNumeric(sources, [
        "active_deals",
        "active_deals_count",
        "deals_count",
        "total_deals",
        "deals"
      ]);

      const vouchers = findFirstNumeric(sources, [
        "active_vouchers",
        "active_vouchers_count",
        "vouchers_count",
        "total_vouchers",
        "vouchers"
      ]);

      const revenue = findFirstNumeric(sources, [
        "revenue",
        "total_revenue",
        "confirmed_revenue",
        "revenue_total",
        "gross_revenue"
      ]);

      return {
        bookings: bookings.value,
        deals: deals.value,
        vouchers: vouchers.value,
        revenue: normalizeMoney(revenue.value),
        hasRecognizedStats:
          bookings.found ||
          deals.found ||
          vouchers.found ||
          revenue.found
      };
    }

    function findFirstNumeric(sources, keys) {
      for (const source of sources) {
        if (!source || typeof source !== "object") {
          continue;
        }

        for (const key of keys) {
          const value = source[key];

          if (Array.isArray(value)) {
            return {
              value: value.length,
              found: true
            };
          }

          const numericValue = toNumber(value);

          if (numericValue !== null) {
            return {
              value: numericValue,
              found: true
            };
          }
        }
      }

      return {
        value: 0,
        found: false
      };
    }

    function resolveArray(data, paths) {
      for (const path of paths) {
        const value = getNestedValue(data, path);

        if (Array.isArray(value)) {
          return value;
        }
      }

      return [];
    }

    function getNestedValue(object, path) {
      return path
        .split(".")
        .reduce((current, key) => current?.[key], object);
    }

    function renderBookings(bookings) {
      elements.bookingsList.innerHTML = "";

      if (!bookings.length) {
        elements.bookingsEmpty.classList.add("is-visible");
        return;
      }

      elements.bookingsEmpty.classList.remove("is-visible");

      bookings.slice(0, 7).forEach((booking) => {
        const guestName =
          booking.customer_name ||
          booking.guest_name ||
          booking.customer?.full_name ||
          booking.customer?.name ||
          booking.full_name ||
          booking.customer_email ||
          "SeasonDeals guest";

        const dealName =
          booking.deal_name ||
          booking.deal_title ||
          booking.deal?.title ||
          booking.deal?.name ||
          booking.title ||
          `Booking #${booking.id || ""}`;

        const bookingDate = booking.booking_date ||
          booking.created_at ||
          booking.paid_at ||
          booking.check_in_date;

        const amount =
          booking.amount_total ??
          booking.total_amount ??
          booking.total ??
          booking.price ??
          booking.order_total;

        const status =
          booking.payment_status ||
          booking.status ||
          booking.booking_status ||
          "confirmed";

        const item = document.createElement("div");
        item.className = "sd-booking-item";

        item.innerHTML = `
          <div class="sd-booking-main">
            <strong>${escapeHtml(dealName)}</strong>
            <span>${escapeHtml(guestName)}</span>
          </div>

          <div class="sd-booking-meta">
            <strong>${escapeHtml(formatCurrency(normalizeMoney(amount)))}</strong>
            <span>${escapeHtml(formatDate(bookingDate))}</span>
          </div>

          <span class="sd-status ${getStatusClass(status)}">
            ${escapeHtml(formatLabel(status))}
          </span>
        `;

        elements.bookingsList.appendChild(item);
      });
    }

    function renderAlerts(alerts) {
      elements.alertsList.innerHTML = "";

      if (!alerts.length) {
        elements.alertsEmpty.classList.add("is-visible");
        return;
      }

      elements.alertsEmpty.classList.remove("is-visible");

      alerts.slice(0, 5).forEach((alert) => {
        const title =
          alert.title ||
          alert.deal_name ||
          alert.deal_title ||
          alert.deal?.title ||
          "Low inventory";

        const remaining =
          alert.remaining_inventory ??
          alert.remaining ??
          alert.inventory ??
          alert.available_quantity;

        const message =
          alert.message ||
          alert.description ||
          (remaining !== undefined
            ? `${remaining} places remaining`
            : "Review the available inventory.");

        const item = document.createElement("div");
        item.className = "sd-alert-item";

        item.innerHTML = `
          <div class="sd-alert-marker">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m12 4 8 15H4L12 4ZM12 9v4M12 16h.01"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>

          <div class="sd-list-copy">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(String(message))}</span>
          </div>
        `;

        elements.alertsList.appendChild(item);
      });
    }

    function renderNotifications(notifications) {
      elements.notificationsList.innerHTML = "";

      if (!notifications.length) {
        elements.notificationsEmpty.classList.add("is-visible");
        elements.notificationDot.classList.remove("is-visible");
        return;
      }

      elements.notificationsEmpty.classList.remove("is-visible");

      const unreadNotifications = notifications.filter((notification) => {
        return (
          notification.is_read === false ||
          notification.read === false ||
          notification.status === "unread"
        );
      });

      elements.notificationDot.classList.toggle(
        "is-visible",
        unreadNotifications.length > 0
      );

      notifications.slice(0, 5).forEach((notification) => {
        const title =
          notification.title ||
          notification.subject ||
          notification.type ||
          "SeasonDeals update";

        const message =
          notification.message ||
          notification.body ||
          notification.description ||
          "A new account update is available.";

        const item = document.createElement("div");
        item.className = "sd-notification-item";

        item.innerHTML = `
          <div class="sd-notification-marker">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m7 12 3 3 7-7"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>

          <div class="sd-list-copy">
            <strong>${escapeHtml(formatLabel(title))}</strong>
            <span>${escapeHtml(String(message))}</span>
          </div>
        `;

        elements.notificationsList.appendChild(item);
      });
    }

    function openSidebar() {
      elements.sidebar?.classList.add("is-open");
      elements.overlay?.classList.add("is-visible");
      document.body.style.overflow = "hidden";
    }

    function closeSidebar() {
      elements.sidebar?.classList.remove("is-open");
      elements.overlay?.classList.remove("is-visible");
      document.body.style.overflow = "";
    }

    function logout() {
      clearSession();
      redirectToLogin();
    }

    function clearSession() {
      sessionStorage.removeItem(CONFIG.tokenKey);
      sessionStorage.removeItem(CONFIG.userKey);
    }

    function redirectToLogin() {
      window.location.replace(CONFIG.loginUrl);
    }

    function showGlobalMessage(message, type) {
      elements.globalMessage.textContent = message;
      elements.globalMessage.className =
        `sd-global-message is-${type}`;
    }

    function clearGlobalMessage() {
      elements.globalMessage.textContent = "";
      elements.globalMessage.className = "sd-global-message";
    }

    function normalizeMoney(value) {
      const number = toNumber(value);

      if (number === null) {
        return 0;
      }

      /*
       * Veel Stripe/Xano-bedragen worden in centen opgeslagen.
       * Waarden vanaf 10.000 worden voorlopig als centen behandeld.
       */
      return Math.abs(number) >= 10000 ? number / 100 : number;
    }

    function toNumber(value) {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === "string" && value.trim() !== "") {
        const normalized = value.replace(",", ".");
        const parsed = Number(normalized);

        return Number.isFinite(parsed) ? parsed : null;
      }

      return null;
    }

    function formatNumber(value) {
      return new Intl.NumberFormat(CONFIG.locale, {
        maximumFractionDigits: 0
      }).format(toNumber(value) || 0);
    }

    function formatCurrency(value) {
      return new Intl.NumberFormat(CONFIG.locale, {
        style: "currency",
        currency: CONFIG.currency,
        maximumFractionDigits: 2
      }).format(toNumber(value) || 0);
    }

    function formatDate(value) {
      if (!value) {
        return "Date unavailable";
      }

      let date;

      if (
        typeof value === "number" ||
        /^\d+$/.test(String(value))
      ) {
        const number = Number(value);
        date = new Date(number < 100000000000 ? number * 1000 : number);
      } else {
        date = new Date(value);
      }

      if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
      }

      return new Intl.DateTimeFormat(CONFIG.locale, {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(date);
    }

    function getStatusClass(status) {
      const normalized = String(status || "").toLowerCase();

      if (
        normalized.includes("paid") ||
        normalized.includes("active") ||
        normalized.includes("confirmed") ||
        normalized.includes("completed")
      ) {
        return "sd-status-success";
      }

      if (
        normalized.includes("pending") ||
        normalized.includes("waiting") ||
        normalized.includes("processing")
      ) {
        return "sd-status-warning";
      }

      return "sd-status-neutral";
    }

    function formatLabel(value) {
      return String(value || "")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
    }

    function firstName(name) {
      return String(name || "Partner").trim().split(/\s+/)[0];
    }

    function getInitial(value) {
      return String(value || "S")
        .trim()
        .charAt(0)
        .toUpperCase();
    }

    function textOrFallback(value, fallback) {
      return value === null ||
        value === undefined ||
        String(value).trim() === ""
        ? fallback
        : String(value);
    }

    function setText(element, value) {
      if (element) {
        element.textContent = value;
      }
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
  })();
      
