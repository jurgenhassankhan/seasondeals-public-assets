(() => {
  "use strict";
  const core = window.AdminCore;
  let supplierPage = 1;
  let offers = [];
  init();
  async function init() {
    try {
      const admin = await core.requireAuth();
      if (!admin) return;
      core.mountShell({active:"suppliers", title:"Leveranciers", subtitle:"Externe aanbodbronnen, geïmporteerde deals en leveranciersboekingen."}, admin);
      document.getElementById("supplier-offer-filters").addEventListener("submit", event => { event.preventDefault(); renderOffers(); });
      document.getElementById("supplier-offers-refresh").addEventListener("click", loadOffers);
      document.getElementById("supplier-bookings-refresh").addEventListener("click", () => { supplierPage = 1; loadSupplierBookings(); });
      document.getElementById("supplier-bookings-filters").addEventListener("submit", event => { event.preventDefault(); supplierPage = 1; loadSupplierBookings(); });
      document.querySelectorAll("#supplier-bookings-filters select").forEach(select => select.addEventListener("change", () => { supplierPage = 1; loadSupplierBookings(); }));
      await Promise.all([loadOffers(), loadSupplierBookings()]);
    } catch (error) { showOfferError(error); }
  }
  async function loadOffers() {
    const target = document.getElementById("supplier-offers-content");
    target.className = "loading-state"; target.textContent = "Aanbod ophalen…";
    try {
      offers = (await window.AdminOfferData.all("/deals")).filter(deal => deal.source === "provider_sync");
      await Promise.all(offers.map(async deal => {
        try { const detail = await core.request(`/supplier-deals/${encodeURIComponent(deal.id)}`); deal.supplier = detail?.supplier_deal; }
        catch { deal.supplier = null; }
      }));
      renderOffers();
    } catch (error) { offers = []; showOfferError(error); }
  }
  function renderOffers() {
    const status = document.getElementById("supplier-offer-status").value;
    const search = document.getElementById("supplier-offer-search").value.trim().toLocaleLowerCase("nl-NL");
    const filtered = offers.filter(deal => (!status || deal.status === status) && (!search || `${deal.title || ""} ${deal.hotel_name || ""}`.toLocaleLowerCase("nl-NL").includes(search)));
    const target = document.getElementById("supplier-offers-content");
    if (!filtered.length) { target.className="empty-state"; target.innerHTML="<strong>Geen leveranciersdeals gevonden</strong><span>Pas de filters aan. Nieuwe import volgt via de bestaande gecontroleerde route.</span>"; return; }
    target.className = "table-wrap";
    target.innerHTML = `<table class="data-table"><thead><tr><th>Deal</th><th>Status</th><th>Omgeving</th><th>Verkoopprijs</th><th>Inkoopvoorbeeld</th><th></th></tr></thead><tbody>${filtered.map(deal => {
      const image = core.imageUrl(deal.images) || core.imageUrl(deal.external_image_urls);
      const supplier = deal.supplier;
      return `<tr><td><div class="deal-cell">${image ? `<img class="deal-thumb" src="${core.escapeHtml(image)}" alt="">` : '<span class="deal-thumb deal-thumb-placeholder">S</span>'}<div><strong>${core.escapeHtml(deal.title || "Naamloze deal")}</strong><span>Leveranciersdeal #${core.escapeHtml(deal.id)} · ${core.escapeHtml(supplier?.provider_slug || "leverancier")}</span></div></div></td><td>${core.statusBadge(deal.status)}</td><td>${core.escapeHtml(supplier?.environment || "Niet beschikbaar")}</td><td>${core.money(deal.price)}</td><td>${supplier?.supplier_base_amount != null ? core.money(supplier.supplier_base_amount) : "—"}</td><td><a class="row-link" href="deal-detail.html?id=${encodeURIComponent(deal.id)}">Openen →</a></td></tr>`;
    }).join("")}</tbody></table>`;
  }
  function showOfferError(error) { const target = document.getElementById("supplier-offers-content"); target.className="error-panel"; target.textContent=error.message; }
async function loadSupplierBookings() {
    const target = document.getElementById("supplier-bookings-content");
    const summaryTarget = document.getElementById("supplier-bookings-summary");
    if (!target || !summaryTarget) return;
    target.className = "loading-state";
    target.innerHTML = '<div class="spinner"></div>Leveranciersboekingen ophalen…';
    const form = document.getElementById("supplier-bookings-filters");
    const values = new FormData(form);
    const params = new URLSearchParams({ page: String(supplierPage), per_page: "25" });
    ["provider_slug", "environment", "booking_status", "search"].forEach(key => {
      const value = String(values.get(key) || "").trim();
      params.set(key, value || " ");
    });
    try {
      const data = normalizeObject(await core.request(`/supplier-bookings?${params.toString()}`));
      const items = getItems(data);
      renderSupplierSummary(normalizeObject(data.summary) || {});
      if (!items.length) {
        target.className = "empty-state";
        target.innerHTML = "<strong>Geen leveranciersboekingen gevonden</strong><span>Pas de filters aan of voer eerst een gecontroleerde sandboxboeking uit.</span>";
      } else {
        target.className = "table-wrap";
        target.innerHTML = `<table class="data-table supplier-bookings-table"><thead><tr><th>Hotel</th><th>Referentie</th><th>Verblijf</th><th>Status</th><th>Omgeving</th><th>Financieel</th><th>Bijgewerkt</th><th></th></tr></thead><tbody>${items.map(supplierBookingRow).join("")}</tbody></table>`;
        wireSupplierBookingDetails();
      }
      renderSupplierPagination(data, items.length);
    } catch (error) {
      summaryTarget.innerHTML = "";
      target.className = "error-panel";
      target.textContent = error.message;
    }
  }

  function renderSupplierSummary(summary) {
    const target = document.getElementById("supplier-bookings-summary");
    if (!target) return;
    target.innerHTML = `
      <div><span>Totaal</span><strong>${Number(summary.total_count || 0)}</strong><small>boekingsrecords, inclusief historie</small></div>
      <div><span>Sandbox</span><strong>${Number(summary.sandbox_count || 0)}</strong><small>testomgeving leverancier</small></div>
      <div><span>Productie</span><strong>${Number(summary.production_count || 0)}</strong><small>live boekingen</small></div>
      <div><span>Opgetelde klantprijzen</span><strong>${core.money(summary.total_selling_price)}</strong><small>inclusief tests en herhaalde pogingen; geen omzet</small></div>
      <div class="supplier-margin-card"><span>SeasonDeals-marge</span><strong>${core.money(summary.total_seasondeals_margin)}</strong><small>recordsom, inclusief schattingen en historie</small></div>
      <div class="${Number(summary.total_cancellation_fee || 0) > 0 ? "has-attention" : ""}"><span>Annuleringskosten</span><strong>${core.money(summary.total_cancellation_fee)}</strong><small>${Number(summary.cancelled_count || 0)} geannuleerd</small></div>`;
  }

  function supplierBookingRow(item) {
    const environment = String(item.environment || "unknown").toLowerCase();
    const meta = supplierStatusMeta(item.booking_status);
    const stay = `${formatStayDate(item.checkin)} – ${formatStayDate(item.checkout)}`;
    const id = String(item.id || item.order_id || Math.random());
    const stripeActual = Number(item.stripe_fee || 0);
    const stripeEstimated = Number(item.stripe_fee_estimated || 0);
    const reconciled = item.financial_reconciliation === "reconciled";
    const actualFeeKnown = reconciled && item.stripe_fee != null && item.stripe_fee !== "" && Number.isFinite(stripeActual);
    const stripeLabel = actualFeeKnown ? core.money(stripeActual) : `${core.money(stripeEstimated)} geschat`;
    const marginLabel = actualFeeKnown ? "werkelijke marge" : "geschatte marge";
    const environmentLabel = environment === "sandbox" ? "Sandbox · test" : environment === "production" ? "Productie" : "Omgeving onbekend";
    const hotel = item.hotel_name || item.deal_title || item.hotel_external_id || "Onbekend hotel";
    const mailStatus = item.confirmation_mail_status === "sent" ? "Verzonden" : "Niet bevestigd";
    const reconcile = item.financial_reconciliation === "reconciled" ? "Afgestemd" : "Controle nodig";
    return `<tr>
      <td><div class="integration-cell"><strong>${core.escapeHtml(hotel)}</strong><span>${core.escapeHtml(item.hotel_external_id || "Geen extern ID")}</span></div></td>
      <td><div class="integration-cell"><strong>${core.escapeHtml(item.client_reference || item.external_booking_id || "—")}</strong><span>Nuitée ${core.escapeHtml(item.external_booking_id || "—")} · order #${core.escapeHtml(item.order_id || "—")}</span></div></td>
      <td><div class="integration-cell"><strong>${core.escapeHtml(stay)}</strong><span>${Number(item.guest_count || 0)} gast${Number(item.guest_count || 0) === 1 ? "" : "en"} · ${core.escapeHtml(item.refundable_tag || "—")}</span></div></td>
      <td><span class="supplier-booking-status status-${core.escapeHtml(meta.tone)}"><i></i>${core.escapeHtml(meta.label)}</span></td>
      <td><span class="supplier-environment supplier-environment-${core.escapeHtml(environment)}">${core.escapeHtml(environmentLabel)}</span></td>
      <td><div class="integration-cell"><strong>${core.money(item.selling_price)}</strong><span>Inkoop ${core.money(item.supplier_amount)} · ${marginLabel} ${core.money(item.seasondeals_margin)}</span></div></td>
      <td>${core.escapeHtml(core.date(item.updated_at || item.last_synced_at, true))}</td>
      <td><button class="row-link supplier-booking-toggle" type="button" data-booking-id="${core.escapeHtml(id)}" aria-expanded="false">Bekijken</button></td>
    </tr>
    <tr class="supplier-booking-detail-row" data-booking-detail="${core.escapeHtml(id)}" hidden><td colspan="8"><div class="supplier-booking-detail">
      <section><span>Boeking</span><strong>${core.escapeHtml(item.deal_title || hotel)}</strong><small>SeasonDeals-order #${core.escapeHtml(item.order_id || "—")} · ${core.escapeHtml(item.order_status || item.payment_status || "—")}</small><small>Klant ${core.escapeHtml(item.customer_email || "—")}</small></section>
      <section><span>Leverancier</span><strong>Nuitée ${core.escapeHtml(item.external_booking_id || "—")}</strong><small>Clientref. ${core.escapeHtml(item.client_reference || "—")}</small><small>${core.escapeHtml(stay)} · ${Number(item.guest_count || 0)} gast(en)</small></section>
      <section><span>Financieel</span><strong>${core.money(item.seasondeals_margin)} ${marginLabel}</strong><small>Klantprijs ${core.money(item.selling_price)} · inkoop ${core.money(item.supplier_amount)}</small><small>Verwerking ${core.money(item.processing_fee)} · Stripe ${core.escapeHtml(stripeLabel)} · ${core.escapeHtml(reconcile)}</small></section>
      <section><span>Voucher & mail</span><strong>${core.escapeHtml(item.voucher_code || "Geen voucher")}</strong><small>Voucher ${core.escapeHtml(item.voucher_status || item.voucher_redemption_status || "—")} · QR ${item.qr_payload ? "beschikbaar" : "ontbreekt"}</small><small>Bevestiging: ${core.escapeHtml(mailStatus)}${item.confirmation_mail_sent_at ? ` · ${core.escapeHtml(core.date(item.confirmation_mail_sent_at, true))}` : ""}</small></section>
      ${item.provider_slug === "nuitee" && item.environment === "sandbox" && item.order_id ? `<section><span>Beheer</span><a class="row-link" href="checkout-recovery.html?order=${encodeURIComponent(item.order_id)}">Status controleren, annuleren of herstellen →</a></section>` : ""}
      ${item.error_message ? `<section class="supplier-booking-error"><span>Actie vereist</span><strong>${core.escapeHtml(item.error_message)}</strong></section>` : ""}
    </div></td></tr>`;
  }

  function wireSupplierBookingDetails() {
    document.querySelectorAll(".supplier-booking-toggle").forEach(button => {
      button.addEventListener("click", () => {
        const row = document.querySelector(`[data-booking-detail="${CSS.escape(button.dataset.bookingId || "")}"]`);
        if (!row) return;
        const opening = row.hidden;
        row.hidden = !opening;
        button.setAttribute("aria-expanded", String(opening));
        button.textContent = opening ? "Sluiten" : "Bekijken";
      });
    });
  }

  function supplierStatusMeta(value) {
    const status = String(value || "").toLowerCase();
    if (status === "confirmed") return {label:"Bevestigd", tone:"confirmed"};
    if (status === "cancelled_with_charges") return {label:"Geannuleerd met kosten", tone:"cancelled"};
    if (status === "cancelled") return {label:"Geannuleerd", tone:"cancelled"};
    if (status === "financial_test") return {label:"Financiële test", tone:"test"};
    if (status.includes("failed") || status.includes("error") || status.includes("attention")) return {label:"Actie vereist", tone:"attention"};
    if (status.includes("pending") || status.includes("processing") || status.includes("book")) return {label:"In behandeling", tone:"pending"};
    return {label:core.label(status || "onbekend"), tone:"pending"};
  }

  function formatStayDate(value) {
    if (!value) return "—";
    const parsed = typeof value === "number" || /^\d{12,}$/.test(String(value))
      ? new Date(Number(value))
      : new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
  }

  function renderSupplierPagination(data, visibleCount) {
    const target = document.getElementById("supplier-bookings-pagination");
    if (!target) return;
    const current = Number(data.page || supplierPage) || 1;
    const pages = Math.max(1, Number(data.total_pages || 1) || 1);
    const total = Number(data.total || visibleCount) || visibleCount;
    supplierPage = current;
    target.innerHTML = `<div class="pagination"><span>${total} boekingen · pagina ${current} van ${pages}</span><div class="pagination-buttons"><button id="supplier-bookings-prev" ${current <= 1 ? "disabled" : ""}>←</button><button id="supplier-bookings-next" ${current >= pages ? "disabled" : ""}>→</button></div></div>`;
    document.getElementById("supplier-bookings-prev")?.addEventListener("click", () => { supplierPage--; loadSupplierBookings(); });
    document.getElementById("supplier-bookings-next")?.addEventListener("click", () => { supplierPage++; loadSupplierBookings(); });
  }

  function normalizeObject(value) { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return value; } }
  function unwrapPayload(value) { let current = normalizeObject(value); for (let depth = 0; depth < 6 && current && typeof current === "object" && current.payload != null; depth++) current = normalizeObject(current.payload); return current; }
  function getItems(data) {
    const current = unwrapPayload(data);
    const values = [current, normalizeObject(current?.items), normalizeObject(current?.deals), normalizeObject(current?.deals?.items), normalizeObject(current?.data), normalizeObject(current?.data?.items), normalizeObject(current?.data?.deals), normalizeObject(current?.result), normalizeObject(current?.result?.items), normalizeObject(current?.result?.deals)];
    return values.find(Array.isArray) || [];
  }
  
})();
