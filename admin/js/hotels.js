(() => {
  "use strict";
  const core = window.AdminCore;
  let page = 1;
  init();

  async function init() {
    try {
      const admin = await core.requireAuth();
      if (!admin) return;
      core.mountShell({ active: "hotels", title: "Partners", subtitle: "Eigen hotelpartneraccounts en hun status. Leveranciersaanbod beheer je onder Leveranciers." }, admin);
      document.getElementById("hotels-refresh")?.addEventListener("click", load);
      bindCreateHotel();
      load();
      if (new URLSearchParams(location.search).get("action") === "new") openCreateHotel();
    } catch (error) { showError(error.message); }
  }

  async function load() {
    const target = document.getElementById("hotels-content");
    target.className = "loading-state";
    target.innerHTML = '<div class="spinner"></div>Hotels ophalen…';
    try {
      const data = await core.request(`/hotels?page=${page}&per_page=20`);
      render(items(data));
      pagination(data);
    } catch (error) { showError(error.message); }
  }

  function render(hotels) {
    const target = document.getElementById("hotels-content");
    if (!hotels.length) { target.className = "empty-state"; target.innerHTML = "<strong>Geen hotels gevonden</strong><span>Er zijn nog geen hotelpartners aangesloten.</span>"; return; }
    target.className = "table-wrap";
    target.innerHTML = `<table class="data-table"><thead><tr><th>Hotel</th><th>Contact</th><th>Adres</th><th>Commissie</th><th>Status</th><th>Actie</th></tr></thead><tbody>${hotels.map(row).join("")}</tbody></table>`;
    target.querySelectorAll("[data-hotel-status]").forEach((select) => select.addEventListener("change", () => updateStatus(select)));
  }

  function row(hotel) {
    const logo = fileUrl(hotel.logo);
    return `<tr><td><div class="deal-cell">${logo ? `<img class="deal-thumb" src="${core.escapeHtml(logo)}" alt="">` : '<span class="deal-thumb deal-thumb-placeholder">H</span>'}<div><strong>${core.escapeHtml(hotel.name || "Naamloos hotel")}</strong><span>Hotel #${core.escapeHtml(hotel.id)} · sinds ${core.date(hotel.created_at)}</span></div></div></td><td><strong>${core.escapeHtml(hotel.email || "—")}</strong><br><span>${core.escapeHtml(hotel.phone || "—")}</span></td><td>${core.escapeHtml(hotel.address || "—")}</td><td>${core.escapeHtml(hotel.commission_percentage ?? 15)}%</td><td><span class="status-badge status-${core.escapeHtml(hotel.legal_status || "pending")}"><span></span>${core.escapeHtml(core.label(hotel.legal_status || "pending"))}</span></td><td><select data-hotel-status="${core.escapeHtml(hotel.id)}" data-current="${core.escapeHtml(hotel.legal_status || "pending")}"><option value="active"${hotel.legal_status === "active" ? " selected" : ""}>Actief</option><option value="pending"${hotel.legal_status === "pending" ? " selected" : ""}>In afwachting</option><option value="suspended"${hotel.legal_status === "suspended" ? " selected" : ""}>Geschorst</option></select></td></tr>`;
  }

  async function updateStatus(select) {
    const status = select.value;
    if (!confirm(`Hotelstatus wijzigen naar ${core.label(status)}?`)) { select.value = select.dataset.current; return; }
    select.disabled = true;
    try { await core.request(`/hotels/${select.dataset.hotelStatus}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); core.toast("Hotelstatus is bijgewerkt."); await load(); }
    catch (error) { select.value = select.dataset.current; core.toast(error.message, "error"); }
    finally { select.disabled = false; }
  }

  function bindCreateHotel() {
    document.getElementById("hotel-create")?.addEventListener("click", openCreateHotel);
    document.getElementById("hotel-create-close")?.addEventListener("click", closeCreateHotel);
    document.getElementById("hotel-create-cancel")?.addEventListener("click", closeCreateHotel);
    document.getElementById("hotel-create-modal")?.addEventListener("click", (event) => { if (event.target.id === "hotel-create-modal") closeCreateHotel(); });
    document.getElementById("hotel-create-form")?.addEventListener("submit", submitCreateHotel);
    document.getElementById("hotel-password-generate")?.addEventListener("click", generatePassword);
    document.getElementById("hotel-password-toggle")?.addEventListener("click", togglePassword);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCreateHotel(); });
  }

  function openCreateHotel() {
    const modal = document.getElementById("hotel-create-modal");
    hideCreateError();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-modal");
    history.replaceState({}, "", location.pathname);
    setTimeout(() => document.getElementById("hotel-name")?.focus(), 0);
  }

  function closeCreateHotel() {
    const modal = document.getElementById("hotel-create-modal");
    const submit = document.getElementById("hotel-create-submit");
    if (submit?.disabled) return;
    modal?.classList.remove("is-open");
    modal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-modal");
    hideCreateError();
  }

  async function submitCreateHotel(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submit = document.getElementById("hotel-create-submit");
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.hotel_name = payload.hotel_name.trim();
    payload.hotel_email = payload.hotel_email.trim().toLowerCase();
    payload.user_name = payload.user_name.trim();
    payload.user_email = payload.user_email.trim().toLowerCase();
    if (!payload.hotel_name || !payload.hotel_email || !payload.user_name || !payload.user_email) return showCreateError("Vul alle verplichte velden in.");
    if (payload.user_password.length < 12) return showCreateError("Het tijdelijke wachtwoord moet minimaal 12 tekens bevatten.");
    submit.disabled = true;
    submit.textContent = "Aanmaken…";
    hideCreateError();
    try {
      await core.request("/partners/create", { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      document.getElementById("hotel-user-password").type = "password";
      document.getElementById("hotel-password-toggle").textContent = "Tonen";
      closeCreateHotelAfterSubmit();
      core.toast("Hotel en beheerder zijn aangemaakt.");
      page = 1;
      await load();
    } catch (error) {
      showCreateError(error.message || "Het hotel kon niet worden aangemaakt.");
    } finally {
      submit.disabled = false;
      submit.textContent = "Hotel en beheerder aanmaken";
    }
  }

  function closeCreateHotelAfterSubmit() {
    const modal = document.getElementById("hotel-create-modal");
    modal?.classList.remove("is-open");
    modal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-modal");
    hideCreateError();
  }

  function generatePassword() {
    const input = document.getElementById("hotel-user-password");
    const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*-_+"];
    const all = groups.join("");
    const randomIndex = (length) => crypto.getRandomValues(new Uint32Array(1))[0] % length;
    const value = groups.map((group) => group[randomIndex(group.length)]);
    while (value.length < 16) value.push(all[randomIndex(all.length)]);
    for (let index = value.length - 1; index > 0; index--) {
      const swap = randomIndex(index + 1);
      [value[index], value[swap]] = [value[swap], value[index]];
    }
    input.value = value.join("");
    input.type = "text";
    document.getElementById("hotel-password-toggle").textContent = "Verbergen";
    input.focus();
    input.select();
  }

  function togglePassword() {
    const input = document.getElementById("hotel-user-password");
    const button = document.getElementById("hotel-password-toggle");
    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "Tonen" : "Verbergen";
  }

  function showCreateError(message) {
    const target = document.getElementById("hotel-create-error");
    target.textContent = message;
    target.classList.add("is-visible");
  }

  function hideCreateError() {
    const target = document.getElementById("hotel-create-error");
    target.textContent = "";
    target.classList.remove("is-visible");
  }

  function pagination(data) {
    const pages = Math.max(1, Number(data?.pageTotal) || 1), total = Number(data?.itemsTotal) || items(data).length;
    page = Number(data?.curPage) || page;
    document.getElementById("hotels-pagination").innerHTML = `<div class="pagination"><span>${total} hotels · pagina ${page} van ${pages}</span><div class="pagination-buttons"><button id="hotels-prev" ${page <= 1 ? "disabled" : ""}>←</button><button id="hotels-next" ${page >= pages ? "disabled" : ""}>→</button></div></div>`;
    document.getElementById("hotels-prev")?.addEventListener("click", () => { page--; load(); });
    document.getElementById("hotels-next")?.addEventListener("click", () => { page++; load(); });
  }
  function items(data) { return [data, data?.items, data?.data, data?.data?.items].find(Array.isArray) || []; }
  function fileUrl(file) { const path = typeof file === "string" ? file : file?.url || file?.path; return !path ? "" : path.startsWith("http") ? path : core.config.xanoOrigin + path; }
  function showError(message) { const target = document.getElementById("hotels-content"); if (target) { target.className = "error-panel"; target.textContent = message; } }
})();
