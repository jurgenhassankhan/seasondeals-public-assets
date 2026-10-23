(() => {
  "use strict";
  const core = window.AdminCore;
  let page = 1;
  init();

  async function init() {
    try {
      const admin = await core.requireAuth();
      if (!admin) return;
      core.mountShell({ active: "orders", title: "Omzet & orders", subtitle: "Bekijk gerealiseerde omzet en alle bestellingen op het platform." }, admin);
      document.getElementById("orders-filters")?.addEventListener("submit", (event) => { event.preventDefault(); page = 1; load(); });
      load();
    } catch (error) { showError(error.message); }
  }

  async function load() {
    const target = document.getElementById("orders-content");
    target.className = "loading-state";
    target.innerHTML = '<div class="spinner"></div>Orders ophalen…';
    const query = new URLSearchParams({ page: String(page), per_page: "25", date_from: String(dateValue("orders-from", 0)), date_to: String(dateValue("orders-to", 4102444799999, true)) });
    const status = document.getElementById("orders-status").value || "paid";
    const search = document.getElementById("orders-search").value.trim();
    query.set("status", status);
    if (search) query.set("search", search);
    try {
      const response = await core.request(`/orders?${query}`);
      const data = normalize(response);
      renderTotals(data.totals || {});
      render(items(data));
      renderPagination(data);
    } catch (error) { showError(error.message); }
  }

  function renderTotals(totals) {
    totals = normalizeValue(totals) || {};
    const revenue = number(totals, ["total_paid_revenue", "paid_revenue", "revenue", "total"]);
    const paid = number(totals, ["total_paid_orders", "paid_orders", "orders"]);
    const refunded = number(totals, ["total_refunded", "refunded_amount", "refunds"]);
    document.getElementById("orders-totals").innerHTML = [["Administratief betaald totaal", core.money(revenue), "Inclusief aanwezige testdata"],["Betaalde orders", paid, "Inclusief aanwezige testdata"],["Terugbetaald", core.money(refunded), "Refunds"]].map(([label,value,note])=>`<article class="kpi-card"><div class="kpi-top"><span class="kpi-label">${core.escapeHtml(label)}</span></div><strong class="kpi-value">${core.escapeHtml(value)}</strong><span class="kpi-note">${core.escapeHtml(note)}</span></article>`).join("");
  }

  function render(orders) {
    const target = document.getElementById("orders-content");
    if (!orders.length) { target.className = "empty-state"; target.innerHTML = "<strong>Geen orders gevonden</strong><span>Pas de filters aan of controleer later opnieuw.</span>"; return; }
    target.className = "table-wrap";
    target.innerHTML = `<table class="data-table"><thead><tr><th>Order</th><th>Klant</th><th>Hotel & deal</th><th>Verblijf</th><th>Bedrag</th><th>Status</th><th>Voucher</th></tr></thead><tbody>${orders.map(row).join("")}</tbody></table>`;
  }

  function row(order) {
    return `<tr><td><strong>#${core.escapeHtml(order.id)}</strong><br><span>${core.date(order.created_at, true)}</span></td><td><strong>${core.escapeHtml(order.customer_name || "Onbekende klant")}</strong><br><span>${core.escapeHtml(order.customer_email || "—")}</span></td><td><strong>${core.escapeHtml(order.hotel_name || "Onbekend hotel")}</strong><br><span>${core.escapeHtml(order.deal_title || `Deal #${order.deal_id || "—"}`)}</span></td><td>${core.date(order.checkin)} – ${core.date(order.checkout)}<br><span>${core.escapeHtml(order.guests || 1)} gast(en)</span></td><td><strong>${core.money(order.total_amount)}</strong><br><span>${core.escapeHtml((order.currency || "EUR").toUpperCase())}</span></td><td>${core.statusBadge(order.payment_status || order.status)}</td><td><strong>${core.escapeHtml(order.voucher_code || "—")}</strong><br><span>${core.escapeHtml(core.label(order.voucher_status || ""))}</span></td></tr>`;
  }

  function renderPagination(data) {
    const p = normalizeValue(data.pagination) || data;
    const total = Number(p.total_items ?? p.itemsTotal) || items(data).length, pages = Math.max(1, Number(p.total_pages ?? p.pageTotal) || 1);
    page = Number(p.page ?? p.curPage) || page;
    document.getElementById("orders-pagination").innerHTML = `<div class="pagination"><span>${total} orders · pagina ${page} van ${pages}</span><div class="pagination-buttons"><button id="orders-prev" ${page <= 1 ? "disabled" : ""}>←</button><button id="orders-next" ${page >= pages ? "disabled" : ""}>→</button></div></div>`;
    document.getElementById("orders-prev")?.addEventListener("click",()=>{page--;load();}); document.getElementById("orders-next")?.addEventListener("click",()=>{page++;load();});
  }
  function normalize(data) { const result = { ...data }; ["items","pagination","totals"].forEach((key)=>{result[key]=normalizeValue(result[key]);}); return result; }
  function normalizeValue(value) { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return value; } }
  function items(data) { return [data, data?.items, data?.data, data?.data?.items].map(normalizeValue).find(Array.isArray) || []; }
  function number(object, keys) { for (const key of keys) if (Number.isFinite(Number(object?.[key]))) return Number(object[key]); return 0; }
  function dateValue(id, fallback, end=false) { const value=document.getElementById(id)?.value; if(!value)return fallback; return new Date(`${value}T${end?"23:59:59.999":"00:00:00"}`).getTime(); }
  function showError(message) { const target=document.getElementById("orders-content"); if(target){target.className="error-panel";target.textContent=message;} }
})();
