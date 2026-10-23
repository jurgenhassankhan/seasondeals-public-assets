(() => {
  "use strict";
  const core = window.AdminCore;
  const params = new URLSearchParams(location.search);
  let page = Math.max(1, Number(params.get("page")) || 1);

  init();
  async function init() {
    try {
      const admin = await core.requireAuth();
      if (!admin) return;
      core.mountShell({ active: "deals", title: "Dealbeoordeling", subtitle: "Bekijk, zoek en beoordeel alle aanbiedingen van hotelpartners." }, admin);
      const form = document.getElementById("deal-filters");
      form.elements[0].value = params.get("search") || "";
      document.getElementById("status-filter").value = params.get("status") || "";
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
      const data = await core.request(`/deals?${query}`);
      render(resolveItems(data));
      renderPagination(data);
    } catch (error) { showError(error.message); }
  }

  function render(items) {
    const content = document.getElementById("deals-content");
    if (!items.length) { content.className = "empty-state"; content.innerHTML = "<strong>Geen deals gevonden</strong><span>Pas de zoekopdracht of het statusfilter aan.</span>"; return; }
    content.className = "table-wrap";
    content.innerHTML = `<table class="data-table"><thead><tr><th>Deal</th><th>Status</th><th>Voorraad</th><th>Ingediend</th><th>Prijs</th><th></th></tr></thead><tbody>${items.map((deal) => { const image = core.imageUrl(deal.images); return `<tr><td><div class="deal-cell">${image ? `<img class="deal-thumb" src="${core.escapeHtml(image)}" alt="">` : '<span class="deal-thumb deal-thumb-placeholder">S</span>'}<div><strong>${core.escapeHtml(deal.title || "Naamloze deal")}</strong><span>${core.escapeHtml(deal.hotel?.name || deal.hotel_name || "Onbekend hotel")} · ${core.escapeHtml(deal.hotel?.city || deal.city || "")}</span></div></div></td><td>${core.statusBadge(deal.status)}</td><td>${core.escapeHtml(deal.inventory ?? 0)}</td><td>${core.date(deal.submitted_at || deal.created_at)}</td><td>${core.money(deal.price)}</td><td><a class="row-link" href="deal-detail.html?id=${encodeURIComponent(deal.id)}">Openen →</a></td></tr>`; }).join("")}</tbody></table>`;
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
    if (status) next.set("status", status); if (search) next.set("search", search); if (page > 1) next.set("page", page);
    history.replaceState({}, "", `${location.pathname}${next.size ? `?${next}` : ""}`);
  }
  function showError(message) { const target = document.getElementById("deals-content"); if (target) { target.className = "error-panel"; target.textContent = message; } }
})();
