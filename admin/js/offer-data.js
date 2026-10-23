(() => {
  "use strict";
  const normalize = value => { if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return value; } };
  function items(raw) {
    const data = normalize(raw);
    return [data, normalize(data?.items), normalize(data?.data), normalize(data?.data?.items), normalize(data?.result?.items)].find(Array.isArray) || [];
  }
  async function all(path) {
    const output = [], seen = new Set();
    for (let page = 1; page <= 100; page++) {
      const data = normalize(await window.AdminCore.request(`${path}${path.includes("?") ? "&" : "?"}page=${page}&per_page=100`));
      const batch = items(data);
      if (!Array.isArray(data) && ![data?.items, data?.data, data?.data?.items, data?.result?.items].some(value => Array.isArray(normalize(value)))) throw new Error("Het overzicht bevat geen geldige lijst.");
      const pages = Number(data?.pageTotal ?? data?.total_pages ?? data?.pagination?.total_pages);
      const total = Number(data?.itemsTotal ?? data?.total_items ?? data?.pagination?.total_items);
      let added = 0;
      for (const item of batch) {
        const key = item.id ?? JSON.stringify(item);
        if (!seen.has(key)) { seen.add(key); output.push(item); added++; }
      }
      if (page > 1 && batch.length && !added) throw new Error("Niet alle pagina’s konden worden opgehaald. Vernieuw het overzicht.");
      if (Number.isFinite(pages) ? page >= pages : Number.isFinite(total) ? output.length >= total : batch.length < 100) {
        if (Number.isFinite(total) && output.length < total) throw new Error("Niet alle pagina’s konden worden opgehaald. Vernieuw het overzicht.");
        return output;
      }
      if (!added) throw new Error("Niet alle pagina’s konden worden opgehaald. Vernieuw het overzicht.");
    }
    throw new Error("Het overzicht is te groot om volledig te tellen.");
  }
  function publicEligible(deal) {
    if (deal.status !== "active" || deal.is_active !== true || deal.source === "provider_sync") return false;
    const environment = String(deal.integration_environment || "").toLowerCase();
    if (environment && environment !== "production") return false;
    if (deal.integration_id && !environment) return false;
    return !deal.integration_status || deal.integration_status === "active";
  }
  window.AdminOfferData = { normalize, items, all, publicEligible };
})();
