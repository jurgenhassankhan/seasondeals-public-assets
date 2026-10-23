(() => {
  "use strict";
  const core = window.AdminCore;

  init();
  async function init() {
    try {
      const admin = await core.requireAuth();
      if (!admin) return;
      core.mountShell({ active: "dashboard", title: "Dashboard", subtitle: "Platformoverzicht en de nieuwste deals die op beoordeling wachten." }, admin);
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
      const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
      const results = await Promise.allSettled([
        core.request("/dashboard"),
        core.request("/deals?status=pending_approval&page=1&per_page=6"),
        window.AdminOfferData.all("/deals"),
        window.AdminOfferData.all("/hotels"),
        core.request("/analytics/growth"),
        core.request(`/orders?page=1&per_page=5&status=paid&date_from=${startToday.getTime()}&date_to=${endToday.getTime()}`),
        core.request("/orders?page=1&per_page=5&status=refunded&date_from=0&date_to=4102444799999")
      ]);
      const [dashboard, pending, deals, hotels, growth, paidToday, refunds] = results.map((result) => result.status === "fulfilled" ? result.value : null);
      renderKpis(dashboard, pending, deals, hotels, growth);
      if (pending !== null) renderPending(items(pending));
      else { const target = document.getElementById("pending-content"); target.className = "error-panel"; target.textContent = "De beoordelingswachtrij kon niet worden geladen."; }
      renderOperations(paidToday, refunds, dashboard);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) showDashboardWarning(failures.map((result) => result.reason?.message || "Onbekende API-fout"));
    } catch (error) { renderError(error.message); }
  }

  function renderKpis(data, pending, deals, hotels, growth) {
    const allDeals = items(deals);
    const hotelTotal = hotels === null ? "—" : items(hotels).filter(hotel => hotel.legal_status === "active").length;
    const activeTotal = deals === null ? "—" : allDeals.filter(window.AdminOfferData.publicEligible).length;
    const pendingTotal = pending === null ? "—" : total(pending);
    const supplierTotal = deals === null ? "—" : allDeals.filter(deal => deal.source === "provider_sync").length;
    const revenue = findNumber(data, ["total_revenue", "revenue_total", "gross_revenue", "paid_revenue", "revenue"]) || findNumber(growth?.this_month ?? growth, ["total_revenue", "revenue_total", "gross_revenue", "paid_revenue", "revenue", "total"]);
    const cards = [
      ["Actieve partners", hotelTotal, "Partneraccounts · inclusief testaccounts", "", "hotels.html"],
      ["Publiek vrijgegeven", activeTotal, "Actief · test- en leveranciersaanbod uitgesloten", "green", "deals.html?status=active"],
      ["Te beoordelen", pendingTotal, "Partners en leveranciers", "orange", "deals.html?status=pending_approval"],
      ["Omzet", data === null && growth === null ? "—" : core.money(revenue), "Huidige administratie · kan testdata bevatten", "", "orders.html"],
      ["Leveranciersaanbod", supplierTotal, "Geïmporteerde deals · ook sandbox", "", "suppliers.html#supplier-offers"],
      ["Leveranciersboekingen", "Bekijken", "Nuitée · omgeving en margecontrole", "", "suppliers.html#supplier-bookings"]
    ];
    document.getElementById("dashboard-kpis").innerHTML = cards.map(([label, value, note, tone, href]) => `${href ? `<a href="${href}" style="color:inherit;text-decoration:none">` : ""}<article class="kpi-card"${href ? ' style="cursor:pointer"' : ""}><div class="kpi-top"><span class="kpi-label">${core.escapeHtml(label)}</span><span class="kpi-icon ${tone}">${kpiIcon()}</span></div><strong class="kpi-value">${core.escapeHtml(value)}</strong><span class="kpi-note">${core.escapeHtml(note)}${href ? " · Bekijken →" : ""}</span></article>${href ? "</a>" : ""}`).join("");
  }

  function renderPending(items) {
    const target = document.getElementById("pending-content");
    if (!items.length) { target.className = "empty-state"; target.innerHTML = "<strong>Alles is beoordeeld</strong><span>Er staan momenteel geen deals in de wachtrij.</span>"; return; }
    target.className = "table-wrap";
    target.innerHTML = `<table class="data-table"><thead><tr><th>Deal</th><th>Status</th><th>Ingediend</th><th>Prijs</th><th></th></tr></thead><tbody>${items.map(row).join("")}</tbody></table>`;
  }

  function row(deal) {
    const image = core.imageUrl(deal.images) || core.imageUrl(deal.external_image_urls);
    return `<tr><td><div class="deal-cell">${image ? `<img class="deal-thumb" src="${core.escapeHtml(image)}" alt="">` : '<span class="deal-thumb deal-thumb-placeholder">S</span>'}<div><strong>${core.escapeHtml(deal.title || "Naamloze deal")}</strong><span>${core.escapeHtml(deal.hotel?.name || deal.hotel_name || "Onbekend hotel")} · ${core.escapeHtml(deal.hotel?.city || deal.city || "")}</span></div></div></td><td>${core.statusBadge(deal.status)}</td><td>${core.date(deal.submitted_at, true)}</td><td>${core.money(deal.price)}</td><td><a class="row-link" href="deal-detail.html?id=${encodeURIComponent(deal.id)}">Beoordelen →</a></td></tr>`;
  }

  function renderOperations(paidToday, refunds, dashboard) {
    const paidItems = responseItems(paidToday), refundItems = responseItems(refunds), activity = activityItems(dashboard);
    const paidTotal = paidToday === null ? "—" : findNumber(normalize(paidToday?.totals), ["total_paid_orders", "paid_orders", "orders"]) || paidItems.length;
    const paidRevenue = findNumber(normalize(paidToday?.totals), ["total_paid_revenue", "paid_revenue", "revenue", "total"]);
    const host = document.getElementById("admin-page");
    host.insertAdjacentHTML("beforeend", `<section class="dashboard-grid" style="margin-top:20px"><div class="panel"><div class="panel-header"><div><h2>Betaalde orders vandaag</h2><p>${paidTotal} betaling${paidTotal===1?"":"en"} · ${paidToday === null ? "—" : core.money(paidRevenue)}</p></div><a class="text-link" href="orders.html">Alle orders →</a></div>${paidItems.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Klant</th><th>Hotel / deal</th><th>Bedrag</th></tr></thead><tbody>${paidItems.map(orderRow).join("")}</tbody></table></div>`:`<div class="empty-state"><strong>${paidToday === null ? "Betalingsgegevens konden niet worden geladen" : "Nog geen betalingen vandaag"}</strong><span>Nieuwe betaalde orders verschijnen hier automatisch.</span></div>`}</div><aside class="side-stack"><div class="panel quick-card"><span class="eyebrow">Aandachtspunten</span><h3>Refunds</h3><p>${refundItems.length ? `${refundItems.length} recente terugbetaling${refundItems.length===1?"":"en"} gevonden.` : refunds === null ? "Refundgegevens konden niet worden geladen." : "Er zijn momenteel geen recente refunds die aandacht vragen."}</p><a class="primary-button" href="orders.html">Bekijk orders</a></div><div class="panel quick-card"><span class="eyebrow">Recente activiteit</span>${activity.length?`<div class="meta-list">${activity.slice(0,5).map(activityRow).join("")}</div>`:'<p>Er zijn nog geen recente adminacties beschikbaar.</p>'}</div></aside></section>`);
  }
  function orderRow(order) { return `<tr><td><strong>#${core.escapeHtml(order.id)}</strong><br><span>${core.date(order.created_at,true)}</span></td><td>${core.escapeHtml(order.customer_name||order.customer_email||"Onbekende klant")}</td><td><strong>${core.escapeHtml(order.hotel_name||"Onbekend hotel")}</strong><br><span>${core.escapeHtml(order.deal_title||`Deal #${order.deal_id||"—"}`)}</span></td><td><strong>${core.money(order.total_amount)}</strong></td></tr>`; }
  function activityRow(entry) { return `<div class="meta-row"><span>${core.escapeHtml(core.label(entry.action||"Update"))}</span><strong>${core.escapeHtml(entry.resource_table||entry.type||"Platform")} #${core.escapeHtml(entry.resource_id||entry.id||"—")}</strong></div>`; }

  function renderError(message) {
    const target = document.getElementById("pending-content");
    if (target) { target.className = "error-panel"; target.textContent = message; }
    const kpis = document.getElementById("dashboard-kpis");
    if (kpis) kpis.innerHTML = `<div class="error-panel">${core.escapeHtml(message)}</div>`;
  }
  function kpiIcon() { return '<svg viewBox="0 0 24 24"><path d="M5 19V9M12 19V5M19 19v-7"/></svg>'; }
  function showDashboardWarning(messages) { const target = document.getElementById("pending-content"); if (!target || target.querySelector?.(".dashboard-warning")) return; const warning = document.createElement("div"); warning.className = "notice dashboard-warning"; warning.innerHTML = `<strong>Niet alle dashboardbronnen konden laden.</strong><br>${messages.map((message) => core.escapeHtml(message)).join(" · ")}`; target.prepend(warning); }
  function items(data) { return window.AdminOfferData.items(data); }
  function normalize(value) { if(typeof value!=="string") return value||{}; try{return JSON.parse(value);}catch{return{};} }
  function responseItems(data) { const normalized={...data,items:normalize(data?.items)}; return items(normalized); }
  function activityItems(data) { const value=normalize(data?.activity||data?.recent_activity||data?.audit_logs); return Array.isArray(value)?value:items(value); }
  function total(raw) { const data = window.AdminOfferData.normalize(raw); return Number(data?.itemsTotal ?? data?.pagination?.total_items ?? data?.total_items ?? items(data).length) || 0; }
  function findNumber(value, keys) { if (typeof value === "string") { try { return findNumber(JSON.parse(value), keys); } catch { return 0; } } if (!value || typeof value !== "object") return 0; for (const [key, child] of Object.entries(value)) { if (keys.includes(key) && Number.isFinite(Number(child))) return Number(child); } for (const child of Object.values(value)) { const found = findNumber(child, keys); if (found) return found; } return 0; }
})();
