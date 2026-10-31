(() => {
  "use strict";
  const core = window.AdminCore;
  const params = new URLSearchParams(location.search);
  const hotelCache = new Map();
  let page = Math.max(1, Number(params.get("page")) || 1);

  init();
  async function init() {
    try {
      const admin = await core.requireAuth();
      if (!admin) return;
      core.mountShell({ active: "deals", title: "Deals", subtitle: "Alle aanbiedingen van partners en leveranciers. Het bestaande beoordelingsproces blijft leidend." }, admin);
      const form = document.getElementById("deal-filters");
      form.elements[0].value = params.get("search") || "";
      document.getElementById("status-filter").value = params.get("status") || "";
      document.getElementById("source-filter").value = params.get("source") || "";
      document.getElementById("archive-scope").onchange = () => { page = 1; load(); };
      form.addEventListener("submit", (event) => { event.preventDefault(); page = 1; updateUrl(); load(); });
      load();
    } catch (error) { showError(error.message); }
  }

  async function load() {
    const content = document.getElementById("deals-content");
    content.className = "loading-state"; content.innerHTML = '<div class="spinner"></div>Deals ophalen…';
    const query = new URLSearchParams({ page: String(page), per_page: "25" });
    const status = document.getElementById("status-filter").value;
    const search = document.getElementById("deal-search").value.trim();
    if (status) query.set("status", status);
    if (search) query.set("search", search);
    try {
      const source = document.getElementById("source-filter").value;
      let data;
      {
        query.delete("page"); query.delete("per_page");
        const all = await window.AdminOfferData.all(`/deals?${query}`);
        const tests = document.getElementById("archive-scope").value === "test";
        const filtered = all.filter(deal => window.AdminOfferData.isTest(deal) === tests && (!source || (source === "supplier" ? deal.source === "provider_sync" : deal.source !== "provider_sync")));
        const pages = Math.max(1, Math.ceil(filtered.length / 25));
        page = Math.min(page, pages);
        data = {items: filtered.slice((page - 1) * 25, page * 25), itemsTotal: filtered.length, pageTotal: pages, curPage: page};
      }
      const rows = resolveItems(data);
      // Only enrich the current page when the legacy list omits the supplier hotel.
      // Bound concurrency and cache within this page session; never load all supplier details.
      const missing = rows.filter(d => d.source === "provider_sync" && !d.hotel?.name && !d.hotel_name);
      let next = 0;
      await Promise.all(Array.from({length:Math.min(4,missing.length)},async () => {
        while (next < missing.length) {
          const deal = missing[next++];
          if (!hotelCache.has(deal.id)) {
            const result = await core.request(`/supplier-deals/${encodeURIComponent(deal.id)}`);
            const supplier = result?.supplier_deal;
            if (supplier && String(supplier.deal_id) !== String(deal.id)) throw new Error("Verkeerde hotelkoppeling.");
            hotelCache.set(deal.id, supplier?.supplier_content?.hotel || supplier?.supplier_mapping?.hotel || null);
          }
          const hotel = hotelCache.get(deal.id);
          if (hotel?.name) { deal.hotel_name = hotel.name; deal.hotel = hotel; }
        }
      }));
      const supplierRows=rows.filter(d=>d.source==='provider_sync');
      let availabilityIndex=0;
      await Promise.all(Array.from({length:Math.min(4,supplierRows.length)},async()=>{
        while(availabilityIndex<supplierRows.length){const d=supplierRows[availabilityIndex++];
          try{const r=await core.request(`/supplier-deals/${encodeURIComponent(d.id)}`);const a=r?.supplier_deal?.supplier_mapping?.availability;
            d.availability=a&&a.valid_until>Date.now()?a:{status:a?'stale':'unchecked',checked_at:a?.checked_at};
          }catch{d.availability={status:'unknown'};}
        }
      }));
      render(rows);
      renderPagination(data);
    } catch (error) { showError(error.message); }
  }

  function render(items) {
    const content = document.getElementById("deals-content");
    if (!items.length) { content.className = "empty-state"; content.innerHTML = "<strong>Geen deals gevonden</strong><span>Pas de zoekopdracht of het statusfilter aan.</span>"; return; }
    content.className = "table-wrap";
    content.innerHTML = `<table class="data-table"><thead><tr><th>Deal</th><th>Status</th><th>Beschikbaarheid / voorraad</th><th>Ingediend</th><th>Prijs</th><th></th></tr></thead><tbody>${items.map((deal) => { const image = core.imageUrl(deal.images) || core.imageUrl(deal.external_image_urls); return `<tr><td><div class="deal-cell">${image ? `<img class="deal-thumb" src="${core.escapeHtml(image)}" alt="">` : '<span class="deal-thumb deal-thumb-placeholder">S</span>'}<div><strong>${core.escapeHtml(deal.title || "Naamloze deal")}</strong><span>${core.escapeHtml(deal.hotel?.name || deal.hotel_name || "Onbekend hotel")} · ${core.escapeHtml(deal.hotel?.city || deal.city || "")}</span></div></div></td><td>${core.statusBadge(deal.status)}</td><td>${deal.source === "provider_sync" ? (window.SeasonDealsAvailability?.label(deal.availability) || "Nog niet gecontroleerd") + `<small style="display:block">${deal.availability?.checked_at ? core.date(deal.availability.checked_at,true) : "Nog geen controle"}</small>` : core.escapeHtml(deal.inventory ?? 0)}</td><td>${core.date(deal.submitted_at || deal.created_at)}</td><td>${core.money(deal.price)}</td><td><a class="row-link" href="deal-detail.html?id=${encodeURIComponent(deal.id)}">Openen →</a></td></tr>`; }).join("")}</tbody></table>`;
    content.querySelectorAll("tbody tr").forEach((row, index) => {
      const cell = row.children[1];
      if (!cell) return;
      cell.classList.add("deal-status-stack");
      cell.insertAdjacentHTML("beforeend", environmentBadge(items[index]?.integration_environment, items[index]?.source));
    });
  }

  function renderPagination(pagination) {
    const total = Number(pagination?.itemsTotal ?? pagination?.pagination?.total_items ?? pagination?.total_items) || resolveItems(pagination).length;
    const pages = Math.max(1, Number(pagination?.pageTotal ?? pagination?.pagination?.total_pages ?? pagination?.total_pages) || 1);
    page = Number(pagination?.curPage ?? pagination?.pagination?.page ?? pagination?.page) || page;
    document.getElementById("deals-pagination").innerHTML = `<div class="pagination"><span>${total} deal${total === 1 ? "" : "s"} · pagina ${page} van ${pages}</span><div class="pagination-buttons"><button id="previous-page" ${page <= 1 ? "disabled" : ""} aria-label="Vorige pagina">←</button><button id="next-page" ${page >= pages ? "disabled" : ""} aria-label="Volgende pagina">→</button></div></div>`;
    document.getElementById("previous-page")?.addEventListener("click", () => { page -= 1; updateUrl(); load(); });
    document.getElementById("next-page")?.addEventListener("click", () => { page += 1; updateUrl(); load(); });
  }
  function resolveItems(data) { return [data, data?.items, data?.data, data?.data?.items, data?.result?.items].find(Array.isArray) || []; }
  function updateUrl() {
    const next = new URLSearchParams();
    const status = document.getElementById("status-filter").value;
    const search = document.getElementById("deal-search").value.trim();
    const source = document.getElementById("source-filter").value;
    if (source) next.set("source", source);
    if (status) next.set("status", status); if (search) next.set("search", search); if (page > 1) next.set("page", page);
    history.replaceState({}, "", `${location.pathname}${next.size ? `?${next}` : ""}`);
  }
  function environmentBadge(environment, source) {
    if (source === "provider_sync") return '<span class="environment-badge environment-test">LEVERANCIER</span>';
    if (!environment) return '<span class="environment-badge environment-manual">HANDMATIG</span>';
    const value = String(environment).toLowerCase();
    return `<span class="environment-badge environment-${core.escapeHtml(value)}">${value === "production" ? "PRODUCTIE" : "TEST"}</span>`;
  }
  function showError(message) { const target = document.getElementById("deals-content"); if (target) { target.className = "error-panel"; target.textContent = message; } }
})();
