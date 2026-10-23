(() => {
  "use strict";
  const core = window.AdminCore;
  const dealId = new URLSearchParams(location.search).get("id");
  let admin;
  let deal;

  init();
  async function init() {
    try {
      admin = await core.requireAuth();
      if (!admin) return;
      core.mountShell({ active: "deals", title: "Deal beoordelen", subtitle: "Controleer de aanbieding en leg je besluit zorgvuldig vast." }, admin);
      if (!dealId || !/^\d+$/.test(dealId)) throw new Error("Geen geldige deal geselecteerd.");
      await load();
    } catch (error) { showError(error.message); }
  }

  async function load() {
    const data = await core.request(`/deals/${encodeURIComponent(dealId)}`);
    deal = data?.deal || data;
    render();
  }

  function render() {
    const target = document.getElementById("deal-detail");
    const hotel = deal.hotel || {};
    const image = core.imageUrl(deal.images);
    const inclusions = [["includes_breakfast", "Ontbijt"], ["includes_wifi", "Wifi"], ["includes_parking", "Parkeren"], ["includes_late_checkout", "Late check-out"], ["includes_welcome_drink", "Welkomstdrankje"]].filter(([field]) => deal[field]).map(([, text]) => `<span class="inclusion">✓ ${text}</span>`).join("");
    const reviewAllowed = core.canReview(admin) && deal.status === "pending_approval";
    target.className = "detail-layout";
    target.innerHTML = `<article class="panel">${image ? `<img class="deal-hero" src="${core.escapeHtml(image)}" alt="${core.escapeHtml(deal.title || "Deal")}">` : '<div class="deal-hero deal-hero-placeholder">Geen afbeelding beschikbaar</div>'}<div class="deal-body"><div class="deal-title-row"><div><h2>${core.escapeHtml(deal.title || "Naamloze deal")}</h2><p class="hotel-line">${core.escapeHtml(hotel.name || deal.hotel_name || "Onbekend hotel")} · ${core.escapeHtml(hotel.city || deal.city || "")}</p></div>${core.statusBadge(deal.status)}</div><div class="fact-grid"><div class="fact"><span>Dealprijs</span><strong>${core.money(deal.price)}</strong></div><div class="fact"><span>Oorspronkelijke prijs</span><strong>${core.money(deal.original_price)}</strong></div><div class="fact"><span>Voorraad</span><strong>${core.escapeHtml(deal.inventory ?? 0)} beschikbaar</strong></div><div class="fact"><span>Verblijf</span><strong>${core.escapeHtml(deal.minimum_nights || 1)} nacht(en) · max. ${core.escapeHtml(deal.max_guests || 0)} gasten</strong></div><div class="fact"><span>Reisperiode</span><strong>${core.date(deal.travel_period_start)} – ${core.date(deal.travel_period_end)}</strong></div><div class="fact"><span>Ingediend</span><strong>${core.date(deal.submitted_at, true)}</strong></div></div>${inclusions ? `<div class="inclusion-list">${inclusions}</div>` : ""}<section class="deal-copy"><h3>Korte omschrijving</h3><p>${core.escapeHtml(deal.short_description || "Geen korte omschrijving.")}</p></section><section class="deal-copy"><h3>Uitgebreide omschrijving</h3><p>${core.escapeHtml(deal.long_description || "Geen uitgebreide omschrijving.")}</p></section><section class="deal-copy"><h3>Annuleringsvoorwaarden</h3><p>${core.escapeHtml(deal.cancellation_policy || "Niet opgegeven.")}</p></section></div></article><aside class="detail-sidebar"><section class="panel review-card"><span class="eyebrow">Beoordeling</span><h3>${reviewAllowed ? "Neem een besluit" : "Beoordelingsstatus"}</h3>${reviewAllowed ? `<label for="review-notes">Interne notitie (optioneel)</label><textarea id="review-notes" class="review-input" placeholder="Notitie voor het auditdossier"></textarea><label for="rejection-reason">Reden bij afwijzing</label><textarea id="rejection-reason" class="review-input" placeholder="Verplicht wanneer je de deal afwijst"></textarea><div class="review-actions"><button id="approve-deal" class="primary-button" type="button">Goedkeuren</button><button id="reject-deal" class="danger-button" type="button">Afwijzen</button></div>` : reviewSummary()}${!core.canReview(admin) && deal.status === "pending_approval" ? '<p class="notice">Je account mag deals bekijken, maar alleen superadmins en platformadmins kunnen besluiten nemen.</p>' : ""}</section><section class="panel review-card"><span class="eyebrow">Hotelpartner</span><h3>${core.escapeHtml(hotel.name || "Onbekend hotel")}</h3><div class="meta-list"><div class="meta-row"><span>Plaats</span><strong>${core.escapeHtml(hotel.city || "—")}</strong></div><div class="meta-row"><span>Land</span><strong>${core.escapeHtml(hotel.country || "—")}</strong></div><div class="meta-row"><span>E-mail</span><strong>${core.escapeHtml(hotel.email || "—")}</strong></div><div class="meta-row"><span>Telefoon</span><strong>${core.escapeHtml(hotel.phone || "—")}</strong></div><div class="meta-row"><span>Deal-ID</span><strong>#${core.escapeHtml(deal.id)}</strong></div></div></section></aside>`;
    document.getElementById("approve-deal")?.addEventListener("click", approve);
    document.getElementById("reject-deal")?.addEventListener("click", reject);
  }

  function reviewSummary() {
    if (deal.status === "rejected") return `<p class="notice"><strong>Afgewezen op ${core.date(deal.rejected_at, true)}</strong><br>${core.escapeHtml(deal.rejection_reason || "Geen reden opgeslagen.")}</p>${deal.review_notes ? `<div class="deal-copy"><h3>Interne notitie</h3><p>${core.escapeHtml(deal.review_notes)}</p></div>` : ""}`;
    if (deal.status === "active") return `<p class="notice"><strong>Goedgekeurd op ${core.date(deal.approved_at, true)}</strong><br>Deze deal is actief en zichtbaar voor bezoekers.</p>${deal.review_notes ? `<div class="deal-copy"><h3>Interne notitie</h3><p>${core.escapeHtml(deal.review_notes)}</p></div>` : ""}`;
    return `<p class="notice">Deze deal heeft status ${core.escapeHtml(core.statusLabel(deal.status))} en kan vanuit deze status niet worden goedgekeurd of afgewezen.</p>`;
  }

  async function approve() {
    if (!confirm(`Weet je zeker dat je “${deal.title}” wilt goedkeuren en live wilt zetten?`)) return;
    await updateStatus("active", "Deal goedgekeurd en geactiveerd.");
  }
  async function reject() {
    const reason = document.getElementById("rejection-reason").value.trim();
    if (!reason) { core.toast("Vul eerst een duidelijke reden voor afwijzing in.", "error"); document.getElementById("rejection-reason").focus(); return; }
    if (!confirm(`Weet je zeker dat je “${deal.title}” wilt afwijzen?`)) return;
    await updateStatus("rejected", "Deal afgewezen.", reason);
  }
  async function updateStatus(status, success, reason = null) {
    const buttons = [document.getElementById("approve-deal"), document.getElementById("reject-deal")];
    buttons.forEach((button) => { if (button) button.disabled = true; });
    const body = { status };
    const notes = document.getElementById("review-notes")?.value.trim();
    if (notes) body.review_notes = notes;
    if (reason) body.rejection_reason = reason;
    try {
      const response = await core.request(`/deals/${encodeURIComponent(dealId)}/status`, { method: "PATCH", body: JSON.stringify(body) });
      deal = response?.deal || response;
      core.toast(response?.message || success);
      render();
    } catch (error) { core.toast(error.message, "error"); buttons.forEach((button) => { if (button) button.disabled = false; }); }
  }
  function showError(message) { const target = document.getElementById("deal-detail"); if (target) { target.className = "error-panel"; target.textContent = message; } }
})();
