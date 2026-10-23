(() => {
  "use strict";
  const core = window.AdminCore;
  let page = 1;
  let admin;
  init();

  async function init() {
    try {
      admin = await core.requireAuth();
      core.mountShell({ active: "integrations", title: "Integratiebeheer", subtitle: "Beheer externe hotelkoppelingen en veilige API-toegang." }, admin);
      document.getElementById("integrations-refresh").addEventListener("click", load);
      document.getElementById("integration-create").addEventListener("click", openCreateIntegration);
      await load();
    } catch (error) { showError(error.message); }
  }

  async function load() {
    const target = document.getElementById("integrations-content");
    target.className = "loading-state";
    target.innerHTML = '<div class="spinner"></div>Integraties ophalen…';
    try {
      const raw = await core.request(`/integrations?page=${page}&per_page=25`);
      const data = normalizeObject(raw);
      const integrations = getItems(data);
      if (!integrations.length) {
        target.innerHTML = '<div class="empty-state"><strong>Nog geen integraties</strong><span>Nieuwe hotelintegraties verschijnen hier zodra ze zijn aangemaakt.</span></div>';
      } else {
        target.className = "table-wrap";
        target.innerHTML = `<table class="data-table"><thead><tr><th>Hotel</th><th>Provider</th><th>Omgeving</th><th>Synchronisatie</th><th>Status</th><th>Laatste resultaat</th><th>Acties</th></tr></thead><tbody>${integrations.map(row).join("")}</tbody></table>`;
        target.querySelectorAll("[data-integration-status]").forEach(select => select.addEventListener("change", () => updateStatus(select)));
        target.querySelectorAll("[data-manage-keys]").forEach(button => button.addEventListener("click", () => openKeyManager(button.dataset.manageKeys, button.dataset.integrationName)));
      }
      renderPagination(data, integrations.length);
    } catch (error) { showError(error.message); }
  }

  function row(item) {
    const hotel = normalizeObject(item.hotel) || {}, provider = normalizeObject(item.provider || item.integration_provider) || {};
    const status = item.status || "pending", environment = item.environment || "test";
    const statuses = ["pending", "testing", "active", "paused", "error", "revoked"];
    const integrationName = `${hotel.name || item.hotel_name || `Hotel #${item.hotel_id || "—"}`} · ${provider.name || item.provider_name || "API"}`;
    return `<tr><td><div class="integration-cell"><strong>${core.escapeHtml(hotel.name || item.hotel_name || `Hotel #${item.hotel_id || "—"}`)}</strong><span>ID ${core.escapeHtml(item.hotel_id || hotel.id || "—")}</span></div></td><td><div class="integration-cell"><strong>${core.escapeHtml(provider.name || item.provider_name || `Provider #${item.provider_id || "—"}`)}</strong><span>${core.escapeHtml(provider.slug || "")}</span></div></td><td>${core.escapeHtml(core.label(environment))}</td><td><div class="integration-cell"><strong>${core.escapeHtml(core.label(item.sync_direction || "bidirectional"))}</strong><span>${item.auto_sync_enabled ? "Automatisch" : "Handmatig"}</span></div></td><td><select class="integration-status-select" data-integration-status="${core.escapeHtml(item.id)}" data-current="${core.escapeHtml(status)}">${statuses.map(value => `<option value="${value}"${value === status ? " selected" : ""}>${core.escapeHtml(core.label(value))}</option>`).join("")}</select></td><td><div class="integration-cell"><strong>${core.escapeHtml(core.date(item.last_success_at || item.last_sync_at, true))}</strong>${item.last_error_message ? `<span class="integration-error">${core.escapeHtml(item.last_error_message)}</span>` : "<span>Geen foutmelding</span>"}</div></td><td><div class="integration-actions"><button class="integration-key-button" type="button" data-manage-keys="${core.escapeHtml(item.id)}" data-integration-name="${core.escapeHtml(integrationName)}">Sleutels beheren</button></div></td></tr>`;
  }

  async function updateStatus(select) {
    const status = select.value;
    if (!confirm(`Integratiestatus wijzigen naar ${core.label(status)}?${status === "revoked" ? " Alle gekoppelde API-sleutels worden direct ingetrokken." : ""}`)) { select.value = select.dataset.current; return; }
    select.disabled = true;
    try {
      await core.request(`/integrations/${select.dataset.integrationStatus}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      core.toast("Integratiestatus is bijgewerkt.");
      await load();
    } catch (error) { select.value = select.dataset.current; core.toast(error.message, "error"); }
    finally { select.disabled = false; }
  }

  async function createKey(integrationId, activeCount = 0) {
    if (!core.canReview(admin)) return core.toast("Alleen een superadmin kan API-sleutels aanmaken.", "error");
    if (activeCount > 0 && !confirm(`Er ${activeCount === 1 ? "is" : "zijn"} al ${activeCount} actieve testsleutel${activeCount === 1 ? "" : "s"}. Toch nog een sleutel aanmaken?`)) return;
    const name = prompt("Naam voor deze testsleutel:", "Testkoppeling");
    if (!name?.trim()) return;
    try {
      const result = normalizeObject(await core.request(`/integrations/${integrationId}/api-keys`, { method: "POST", body: JSON.stringify({ name: name.trim(), environment: "test", scopes: { "deals.read": true, "deals.write": true, "inventory.write": true, "bookings.read": true } }) }));
      const secret = result.api_key || result.key || result.secret || result.full_key;
      if (!secret) throw new Error("De sleutel is aangemaakt, maar de eenmalige sleutel ontbreekt in de response.");
      showSecret(secret);
      await loadManagedKeys(integrationId);
    } catch (error) { core.toast(error.message, "error"); }
  }

  async function openKeyManager(integrationId, integrationName = "Hotelintegratie") {
    const modal = document.getElementById("integration-keys-modal");
    modal.dataset.integrationId = integrationId; modal.dataset.integrationName = integrationName;
    modal.innerHTML = `<div class="integration-dialog integration-keys-dialog"><button class="integration-dialog-close" type="button" aria-label="Sluiten">×</button><span class="eyebrow">API-toegang</span><h2>${core.escapeHtml(integrationName)}</h2><div id="integration-keys-content" class="loading-state"><div class="spinner"></div>Sleutels ophalen…</div></div>`;
    modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false");
    modal.querySelector(".integration-dialog-close").addEventListener("click", () => closeKeyManager(modal));
    modal.addEventListener("click", event => { if (event.target === modal) closeKeyManager(modal); });
    await loadManagedKeys(integrationId);
  }

  async function loadManagedKeys(integrationId) {
    const modal = document.getElementById("integration-keys-modal"), target = document.getElementById("integration-keys-content");
    if (!target || String(modal.dataset.integrationId) !== String(integrationId)) return;
    try {
      const data = normalizeObject(await core.request(`/integrations/${integrationId}/api-keys`)), keys = getItems(data);
      const active = keys.filter(item => item.is_active !== false && !item.revoked_at);
      target.className = "integration-key-manager";
      target.innerHTML = `<div class="integration-key-summary"><div><strong>${active.length}</strong><span>Actieve sleutel${active.length === 1 ? "" : "s"}</span></div><div class="integration-key-summary-actions"><button id="integration-test-key" class="secondary-button" type="button"${active.length ? "" : " disabled"}>Verbinding testen</button><button id="integration-test-deal" class="secondary-button" type="button"${active.length ? "" : " disabled"}>Testdeal aanmaken</button><button id="integration-submit-deal" class="secondary-button" type="button"${active.length ? "" : " disabled"}>Indienen voor beoordeling</button><button id="integration-new-key" class="primary-button" type="button">Nieuwe testsleutel</button></div></div>${keys.length ? `<div class="integration-managed-keys">${keys.map(item => managedKeyRow(integrationId, item)).join("")}</div>` : '<div class="integration-key-empty">Er zijn nog geen API-sleutels voor deze koppeling.</div>'}`;
      document.getElementById("integration-new-key").addEventListener("click", () => createKey(integrationId, active.length));
      document.getElementById("integration-test-key")?.addEventListener("click", () => openConnectionTest(integrationId));
      document.getElementById("integration-test-deal")?.addEventListener("click", () => openTestDeal(integrationId));
      document.getElementById("integration-submit-deal")?.addEventListener("click", () => openSubmitDeal(integrationId));
      target.querySelectorAll("[data-revoke-managed-key]").forEach(button => button.addEventListener("click", () => revokeManagedKey(integrationId, button.dataset.revokeManagedKey)));
    } catch (error) { target.className = "error-panel"; target.textContent = error.message; }
  }

  function managedKeyRow(integrationId, item) {
    const active = item.is_active !== false && !item.revoked_at, masked = `${item.key_prefix || "sd_test_"}••••${item.key_last4 || ""}`;
    return `<div class="integration-managed-key"><div class="integration-managed-key-main"><strong>${core.escapeHtml(item.name || "API-sleutel")}</strong><code>${core.escapeHtml(masked)}</code><span>Aangemaakt ${core.date(item.created_at, true)} · laatst gebruikt ${item.last_used_at ? core.date(item.last_used_at, true) : "nog nooit"}</span></div><div class="integration-managed-key-side"><span class="status-badge status-${active ? "active" : "archived"}"><span></span>${active ? "Actief" : "Ingetrokken"}</span>${active ? `<button class="danger-button" type="button" data-revoke-managed-key="${core.escapeHtml(item.id)}">Intrekken</button>` : ""}</div></div>`;
  }

  async function revokeManagedKey(integrationId, keyId) {
    if (!confirm("Deze API-sleutel intrekken? De gekoppelde applicatie verliest direct toegang.")) return;
    try { await core.request(`/integrations/${integrationId}/api-keys/${keyId}/revoke`, { method: "POST" }); core.toast("API-sleutel is ingetrokken."); await loadManagedKeys(integrationId); }
    catch (error) { core.toast(error.message, "error"); }
  }

  function closeKeyManager(modal) { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); modal.innerHTML = ""; delete modal.dataset.integrationId; }

  function openConnectionTest(integrationId) {
    const modal = document.getElementById("integration-secret-modal");
    modal.innerHTML = `<div class="integration-dialog"><button class="integration-dialog-close" type="button" aria-label="Sluiten">×</button><span class="eyebrow">Veilige test</span><h2>API-verbinding testen</h2><p>Plak de volledige testsleutel. Deze wordt alleen voor deze test gebruikt en nergens opgeslagen.</p><form id="integration-test-form" class="integration-test-form"><label>Testsleutel<input id="integration-test-secret" type="password" autocomplete="off" spellcheck="false" required placeholder="sd_test_…"></label><button id="integration-test-submit" class="primary-button" type="submit">Test verbinding</button></form><div id="integration-test-result"></div></div>`;
    modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false");
    const close = () => { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); modal.innerHTML = ""; };
    modal.querySelector(".integration-dialog-close").addEventListener("click", close);
    modal.querySelector("#integration-test-form").addEventListener("submit", event => testConnection(event, integrationId));
    modal.querySelector("#integration-test-secret").focus();
  }

  async function testConnection(event, integrationId) {
    event.preventDefault();
    const input = document.getElementById("integration-test-secret"), button = document.getElementById("integration-test-submit"), result = document.getElementById("integration-test-result");
    let apiKey = input.value.trim();
    input.value = ""; button.disabled = true; button.textContent = "Testen…"; result.innerHTML = "";
    try {
      const response = await fetch("https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-integration/v1/deals?page=1&per_page=20", { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } });
      const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
      if (!response.ok) throw new Error(data.message || data.error || `Verbinding mislukt (${response.status}).`);
      const payload = unwrapPayload(data), hiddenStatus = Number(payload?.status || 0), hiddenError = payload?.error || payload?.message;
      if (hiddenError && (hiddenStatus >= 400 || payload?.stage)) throw new Error(`${hiddenError}${payload?.stage ? ` · fase: ${payload.stage}` : ""}`);
      const deals = getItems(payload);
      result.innerHTML = `<div class="integration-test-success"><strong>Verbinding geslaagd</strong><span>HTTP ${response.status} · ${deals.length} deal${deals.length === 1 ? "" : "s"} ontvangen</span></div>`;
      core.toast("De Integration API werkt correct.");
      await loadManagedKeys(integrationId);
    } catch (error) {
      result.innerHTML = `<div class="integration-test-failure"><strong>Verbinding mislukt</strong><span>${core.escapeHtml(error.message)}</span></div>`;
    } finally { apiKey = null; button.disabled = false; button.textContent = "Opnieuw testen"; }
  }

  function openTestDeal(integrationId) {
    const modal = document.getElementById("integration-secret-modal"), now = Date.now();
    const start = new Date(now + 86400000).toISOString().slice(0, 10), end = new Date(now + (90 * 86400000)).toISOString().slice(0, 10);
    modal.innerHTML = `<div class="integration-dialog integration-test-deal-dialog"><button class="integration-dialog-close" type="button" aria-label="Sluiten">×</button><span class="eyebrow">End-to-end test</span><h2>Complete conceptdeal via API</h2><p>Alle verplichte gegevens worden gevalideerd voordat Xano de deal opslaat.</p><form id="integration-test-deal-form" class="integration-test-deal-form"><label class="full">Testsleutel<input name="api_key" type="password" autocomplete="off" spellcheck="false" required placeholder="sd_test_…"></label><label class="full">Titel<input name="title" maxlength="120" required value="SeasonDeals API testdeal"></label><label>Dealprijs (€)<input name="price" type="number" min="1" step="0.01" required value="199"></label><label>Oorspronkelijke prijs (€)<input name="original_price" type="number" min="1" step="0.01" required value="249"></label><label>Voorraad<input name="inventory" type="number" min="1" step="1" required value="5"></label><label>Extern ID<input name="external_id" required value="E2E-${now}"></label><label>Minimum aantal nachten<input name="minimum_nights" type="number" min="1" max="30" step="1" required value="1"></label><label>Maximum aantal gasten<input name="max_guests" type="number" min="1" max="20" step="1" required value="2"></label><label>Geldig vanaf<input name="travel_period_start" type="date" required value="${start}"></label><label>Geldig tot en met<input name="travel_period_end" type="date" required value="${end}"></label><label class="full">Afbeeldings-URL (HTTPS)<input name="image_url" type="url" pattern="https://.*" required value="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&amp;fit=crop&amp;w=1600&amp;q=85"></label><label class="full">Korte omschrijving<textarea name="short_description" maxlength="240" required>Een complete testdeal die via de SeasonDeals Integration API is aangeleverd.</textarea></label><label class="full">Uitgebreide omschrijving<textarea name="long_description" maxlength="3000" required>Deze conceptdeal controleert de volledige keten: geldige invoer, veilige opslag, beoordeling door SeasonDeals en publicatie na goedkeuring.</textarea></label><label class="full">Annuleringsvoorwaarden<textarea name="cancellation_policy" maxlength="1500" required>Annuleren is mogelijk volgens de voorwaarden van het aangesloten hotel. De definitieve voorwaarden staan op de voucher en boekingsbevestiging.</textarea></label><div class="integration-form-note full">Er wordt automatisch een unieke Idempotency-Key gebruikt. Herhaald klikken tijdens de aanvraag kan geen dubbele deal veroorzaken.</div><div class="integration-form-actions full"><button class="secondary-button" data-cancel-test-deal type="button">Annuleren</button><button id="integration-test-deal-submit" class="primary-button" type="submit">Complete testdeal aanmaken</button></div></form><div id="integration-test-deal-result"></div></div>`;
    modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false");
    const close = () => { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); modal.innerHTML = ""; };
    modal.querySelector(".integration-dialog-close").addEventListener("click", close);
    modal.querySelector("[data-cancel-test-deal]").addEventListener("click", close);
    modal.querySelector("#integration-test-deal-form").addEventListener("submit", event => submitTestDeal(event, integrationId));
  }

  async function submitTestDeal(event, integrationId) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), button = document.getElementById("integration-test-deal-submit"), result = document.getElementById("integration-test-deal-result");
    let apiKey = String(form.get("api_key") || "").trim();
    event.currentTarget.elements.api_key.value = "";
    const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `sd-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body = {
      idempotency_key: idempotencyKey,
      external_id: String(form.get("external_id") || "").trim(),
      title: String(form.get("title") || "").trim(),
      price: Number(form.get("price")),
      original_price: Number(form.get("original_price")),
      inventory: Number(form.get("inventory")),
      travel_period_start: new Date(`${form.get("travel_period_start")}T00:00:00`).getTime(),
      travel_period_end: new Date(`${form.get("travel_period_end")}T23:59:59`).getTime(),
      short_description: String(form.get("short_description") || "").trim(),
      long_description: String(form.get("long_description") || "").trim(),
      cancellation_policy: String(form.get("cancellation_policy") || "").trim(),
      image_urls: [String(form.get("image_url") || "").trim()],
      max_guests: Number(form.get("max_guests")),
      minimum_nights: Number(form.get("minimum_nights")),
      includes_breakfast: false,
      includes_wifi: true,
      includes_parking: false,
      includes_late_checkout: false,
      includes_welcome_drink: false
    };
    button.disabled = true; button.textContent = "Aanmaken…"; result.innerHTML = "";
    try {
      const response = await fetch("https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-integration/v1/deals", { method: "POST", mode: "cors", credentials: "omit", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) });
      const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
      if (!response.ok) throw new Error(dealValidationMessage(data, response.status));
      const root = normalizeObject(data); let payload = root;
      for (let depth = 0; depth < 6 && payload && typeof payload === "object" && payload.payload != null && !payload.deal && !payload.id; depth++) payload = normalizeObject(payload.payload);
      const deal = normalizeObject(payload?.deal || payload?.data?.deal || payload?.response?.deal || payload?.result?.deal || payload?.data || payload?.response || payload?.result || {});
      const dealId = Number(deal?.id || payload?.id || 0);
      if (!Number.isInteger(dealId) || dealId <= 0) {
        const stage = payload?.stage || payload?.data?.stage || payload?.response?.stage || root?.stage || "onbekend";
        const statement = payload?.statement || root?.statement;
        const message = payload?.message || payload?.error || payload?.data?.message || payload?.response?.message || root?.message || root?.error || (statement ? String(statement).slice(0, 280) : "Xano retourneerde HTTP 200 zonder opgeslagen deal-ID");
        const fields = Object.keys(payload && typeof payload === "object" ? payload : {}).slice(0, 8).join(", ") || "geen";
        throw new Error(`${message} · fase: ${stage} · responsevelden: ${fields}`);
      }
      result.innerHTML = `<div class="integration-test-success"><strong>Testdeal succesvol aangemaakt</strong><span>HTTP ${response.status} · intern ID ${core.escapeHtml(dealId)} · extern ID ${core.escapeHtml(deal.external_id || payload.external_id || body.external_id)}</span></div>`;
      sessionStorage.setItem("sd_last_integration_external_id", deal.external_id || payload.external_id || body.external_id);
      core.toast("De testdeal is via de Integration API aangemaakt.");
      await loadManagedKeys(integrationId);
    } catch (error) { result.innerHTML = `<div class="integration-test-failure"><strong>Aanmaken mislukt</strong><span>${core.escapeHtml(error.message)}</span></div>`; }
    finally { apiKey = null; button.disabled = false; button.textContent = "Opnieuw proberen"; }
  }

  function openSubmitDeal(integrationId) {
    const modal = document.getElementById("integration-secret-modal"), externalId = sessionStorage.getItem("sd_last_integration_external_id") || "E2E-1784797495703";
    modal.innerHTML = `<div class="integration-dialog"><button class="integration-dialog-close" type="button" aria-label="Sluiten">×</button><span class="eyebrow">API-workflowtest</span><h2>Deal indienen voor beoordeling</h2><p>De deal gaat van Concept naar Te beoordelen en wordt niet automatisch actief.</p><form id="integration-submit-deal-form" class="integration-test-deal-form"><label class="full">Testsleutel<input name="api_key" type="password" autocomplete="off" spellcheck="false" required placeholder="sd_test_…"></label><label class="full">Extern deal-ID<input name="external_id" required value="${core.escapeHtml(externalId)}"></label><div class="integration-form-actions full"><button class="secondary-button" data-cancel-submit-deal type="button">Annuleren</button><button id="integration-submit-deal-submit" class="primary-button" type="submit">Indienen voor beoordeling</button></div></form><div id="integration-submit-deal-result"></div></div>`;
    modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false");
    const close = () => { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); modal.innerHTML = ""; };
    modal.querySelector(".integration-dialog-close").addEventListener("click", close);
    modal.querySelector("[data-cancel-submit-deal]").addEventListener("click", close);
    modal.querySelector("#integration-submit-deal-form").addEventListener("submit", event => submitDealForReview(event, integrationId));
  }

  async function submitDealForReview(event, integrationId) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), button = document.getElementById("integration-submit-deal-submit"), result = document.getElementById("integration-submit-deal-result");
    let apiKey = String(form.get("api_key") || "").trim(); const externalId = String(form.get("external_id") || "").trim();
    event.currentTarget.elements.api_key.value = ""; button.disabled = true; button.textContent = "Indienen…"; result.innerHTML = "";
    try {
      const response = await fetch(`https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-integration/v1/deals/${encodeURIComponent(externalId)}/submit`, { method: "POST", mode: "cors", credentials: "omit", headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } });
      const text = await response.text(); let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
      const root = normalizeObject(data); let payload = root;
      for (let depth = 0; depth < 6 && payload && typeof payload === "object" && payload.payload != null && !payload.deal; depth++) payload = normalizeObject(payload.payload);
      const deal = normalizeObject(payload?.deal || payload?.data?.deal || payload?.response?.deal || payload?.result?.deal || payload?.data || payload?.response || payload?.result || {});
      const status = String(deal?.status || payload?.deal_status || (typeof payload?.status === "string" ? payload.status : "") || "").toLowerCase();
      if (!response.ok || status !== "pending_approval") {
        const message = dealValidationMessage(payload, response.status);
        const stage = payload?.stage || payload?.data?.stage || payload?.response?.stage;
        const currentStatus = payload?.current_status || payload?.data?.current_status || payload?.response?.current_status;
        const requiredStatus = payload?.required_status || payload?.data?.required_status || payload?.response?.required_status;
        const fields = Object.keys(payload && typeof payload === "object" ? payload : {}).slice(0, 8).join(", ") || "geen";
        throw new Error(`${message}${stage ? ` · fase: ${stage}` : ""}${currentStatus ? ` · huidige dealstatus: ${currentStatus}` : ""}${requiredStatus ? ` · vereiste status: ${requiredStatus}` : ""} · ontvangen responsestatus: ${status || "ontbreekt"} · responsevelden: ${fields}`);
      }
      result.innerHTML = `<div class="integration-test-success"><strong>Deal ingediend voor beoordeling</strong><span>HTTP ${response.status} · ${core.escapeHtml(externalId)} · status Te beoordelen</span></div>`;
      core.toast("De API-deal staat klaar voor beoordeling."); await loadManagedKeys(integrationId);
    } catch (error) { result.innerHTML = `<div class="integration-test-failure"><strong>Indienen mislukt</strong><span>${core.escapeHtml(error.message)}</span></div>`; }
    finally { apiKey = null; button.disabled = false; button.textContent = "Opnieuw proberen"; }
  }

  async function openCreateIntegration() {
    if (!core.canReview(admin)) return core.toast("Alleen een superadmin of platformadmin kan koppelingen aanmaken.", "error");
    const modal = document.getElementById("integration-form-modal");
    modal.innerHTML = '<div class="integration-dialog"><button class="integration-dialog-close" type="button" aria-label="Sluiten">×</button><span class="eyebrow">Nieuwe integratie</span><h2>Hotel koppelen</h2><div class="loading-state"><div class="spinner"></div>Hotels en providers ophalen…</div></div>';
    modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false");
    bindCreateModalClose(modal);
    try {
      const [hotelResponse, providerResponse] = await Promise.all([
        core.request("/hotels?page=1&per_page=100"),
        core.request("/integration-providers")
      ]);
      const hotels = getItems(normalizeObject(hotelResponse));
      const providers = getItems(normalizeObject(providerResponse));
      renderCreateForm(modal, hotels, providers);
    } catch (error) {
      modal.querySelector(".loading-state").className = "error-panel";
      modal.querySelector(".error-panel").textContent = error.message;
    }
  }

  function renderCreateForm(modal, hotels, providers) {
    const body = modal.querySelector(".loading-state");
    if (!hotels.length || !providers.length) {
      body.className = "error-panel";
      body.textContent = !hotels.length ? "Er zijn geen hotels beschikbaar om te koppelen." : "Er zijn geen actieve integratieproviders beschikbaar.";
      return;
    }
    const preferred = providers.find(item => item.slug === "seasondeals_api")?.id;
    body.outerHTML = `<form id="integration-create-form" class="integration-form"><label>Hotel<select name="hotel_id" required><option value="">Kies een hotel…</option>${hotels.map(item => `<option value="${core.escapeHtml(item.id)}">${core.escapeHtml(item.name || `Hotel #${item.id}`)}</option>`).join("")}</select></label><label>Provider<select name="provider_id" required><option value="">Kies een provider…</option>${providers.map(item => `<option value="${core.escapeHtml(item.id)}"${String(item.id) === String(preferred) ? " selected" : ""}>${core.escapeHtml(item.name || item.slug)}</option>`).join("")}</select></label><label>Omgeving<input value="Test" disabled><input name="environment" type="hidden" value="test"></label><label>Synchronisatie<select name="sync_direction"><option value="bidirectional">Tweerichtingsverkeer</option><option value="inbound">Naar SeasonDeals</option><option value="outbound">Vanuit SeasonDeals</option></select></label><label class="full">Extern hotel-ID <span>(optioneel)</span><input name="external_hotel_id" placeholder="Bijvoorbeeld HOTEL-123"></label><div class="integration-form-note">De koppeling wordt veilig in de testomgeving aangemaakt. Productieverkeer blijft uitgeschakeld.</div><div class="integration-form-actions"><button class="secondary-button" data-cancel-integration type="button">Annuleren</button><button id="integration-create-submit" class="primary-button" type="submit">Koppeling aanmaken</button></div></form>`;
    modal.querySelector("[data-cancel-integration]").addEventListener("click", () => closeCreateModal(modal));
    modal.querySelector("#integration-create-form").addEventListener("submit", event => submitIntegration(event, modal));
  }

  async function submitIntegration(event, modal) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), button = document.getElementById("integration-create-submit");
    const body = {
      hotel_id: Number(form.get("hotel_id")), provider_id: Number(form.get("provider_id")), environment: "test",
      external_hotel_id: String(form.get("external_hotel_id") || "").trim(), sync_direction: String(form.get("sync_direction") || "bidirectional"),
      auto_sync_enabled: false, webhook_enabled: false
    };
    button.disabled = true; button.textContent = "Aanmaken…";
    try {
      await core.request("/integrations", { method: "POST", body: JSON.stringify(body) });
      closeCreateModal(modal); core.toast("Testkoppeling is aangemaakt."); page = 1; await load();
    } catch (error) { core.toast(error.message, "error"); button.disabled = false; button.textContent = "Koppeling aanmaken"; }
  }

  function bindCreateModalClose(modal) { modal.querySelector(".integration-dialog-close").addEventListener("click", () => closeCreateModal(modal)); modal.addEventListener("click", event => { if (event.target === modal) closeCreateModal(modal); }); }
  function closeCreateModal(modal) { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); modal.innerHTML = ""; }

  function showSecret(secret) {
    const modal = document.getElementById("integration-secret-modal");
    modal.innerHTML = `<div class="integration-dialog"><button class="integration-dialog-close" type="button" aria-label="Sluiten">×</button><span class="eyebrow">Eenmalig zichtbaar</span><h2>Bewaar deze testsleutel nu</h2><p>De volledige sleutel wordt niet opgeslagen en kan na het sluiten niet opnieuw worden bekeken.</p><div class="integration-secret"><code>${core.escapeHtml(secret)}</code><button class="primary-button" type="button">Kopiëren</button></div></div>`;
    modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false");
    const close = () => { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); modal.innerHTML = ""; };
    modal.querySelector(".integration-dialog-close").addEventListener("click", close);
    modal.querySelector(".primary-button").addEventListener("click", async event => { try { await navigator.clipboard.writeText(secret); event.currentTarget.textContent = "Gekopieerd"; } catch { event.currentTarget.textContent = "Selecteer handmatig"; } });
  }

  function renderPagination(data, visibleCount) {
    const paging = normalizeObject(data.paging) || data;
    const current = Number(paging.curPage || paging.page || page) || 1;
    const pages = Math.max(1, Number(paging.pageTotal || paging.total_pages || 1) || 1);
    const total = Number(paging.itemsTotal || paging.total || visibleCount) || visibleCount;
    page = current;
    document.getElementById("integrations-pagination").innerHTML = `<div class="pagination"><span>${total} integraties · pagina ${current} van ${pages}</span><div class="pagination-buttons"><button id="integrations-prev" ${current <= 1 ? "disabled" : ""}>←</button><button id="integrations-next" ${current >= pages ? "disabled" : ""}>→</button></div></div>`;
    document.getElementById("integrations-prev")?.addEventListener("click", () => { page--; load(); });
    document.getElementById("integrations-next")?.addEventListener("click", () => { page++; load(); });
  }

  function normalizeObject(value) { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return value; } }
  function unwrapPayload(value) { let current = normalizeObject(value); for (let depth = 0; depth < 6 && current && typeof current === "object" && current.payload != null; depth++) current = normalizeObject(current.payload); return current; }
  function getItems(data) {
    const current = unwrapPayload(data);
    const values = [current, normalizeObject(current?.items), normalizeObject(current?.deals), normalizeObject(current?.deals?.items), normalizeObject(current?.data), normalizeObject(current?.data?.items), normalizeObject(current?.data?.deals), normalizeObject(current?.result), normalizeObject(current?.result?.items), normalizeObject(current?.result?.deals)];
    return values.find(Array.isArray) || [];
  }
  function dealValidationMessage(data, status) {
    const payload = unwrapPayload(data) || {};
    const missing = Array.isArray(payload.missing_fields) ? payload.missing_fields.filter(Boolean) : [];
    const errors = Array.isArray(payload.validation_errors) ? payload.validation_errors : [];
    const details = [
      ...missing.map(field => `${field}: ontbreekt`),
      ...errors.map(item => typeof item === "string" ? item : `${item.field || "veld"}: ${item.message || item.code || "ongeldige waarde"}`)
    ];
    const message = payload.message || payload.error || `Aanmaken mislukt (${status}).`;
    return details.length ? `${message} — ${details.join(" · ")}` : message;
  }
  function showError(message) { const target = document.getElementById("integrations-content"); if (target) { target.className = "error-panel"; target.textContent = message; } }
})();
