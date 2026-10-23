(() => {
  "use strict";
// BEGIN GENERATED AMENITY LABELS
// Presentation only: retain amounts and conditions, translate known facility labels.
function dealAmenityDetail(label, detail) {
  const translations = {
    'wifi available':'Wifi','wifi':'Wifi','wi-fi':'Wifi','parking':'Parkeren',
    'accessible parking':'Toegankelijk parkeren','parking garage':'Parkeergarage',
    'self parking':'Zelf parkeren','private parking':'Privéparkeerplaats',
    'welcome drink':'Welkomstdrankje','late check-out':'Late check-out',
    'paid':'Tegen betaling'
  };
  const parts = String(detail || '').split(' · ');
  const status = parts.shift() || '';
  const rest = parts.map(text => translations[text.toLowerCase()] || text
    .replace(/if available|subject to availability/gi,'afhankelijk van beschikbaarheid')
    .replace(/on request|upon request/gi,'op aanvraag')
    .replace(/surcharge/gi,'toeslag'));
  return [status,...new Set(rest.filter(text => text.toLowerCase() !== String(label).toLowerCase() && text.toLowerCase() !== status.toLowerCase()))].join(' · ');
}
// END GENERATED AMENITY LABELS
// BEGIN GENERATED NUITEE CONTENT
// One projection for import, review, protected preview and public responses.
// Source: https://docs.liteapi.travel/reference/post_hotels-rates
function nuiteeDealContent(mapping, hotelId, contentHotel) {
  const hotel = mapping?.hotel, request = mapping?.request;
  const rates = mapping?.offer?.rates;
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const date = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw Error('Verblijfsdatums ontbreken.');
    const ms = Date.parse(value + 'T00:00:00Z');
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== value) throw Error('Ongeldige verblijfsdatum.');
    return ms;
  };
  if (!hotelId || String(hotel?.id) !== String(hotelId) || !clean(hotel?.name) || !request?.hotel_ids?.some(id => String(id) === String(hotelId))) throw Error('Bevestigde hotelgegevens ontbreken.');
  if (!Array.isArray(rates) || rates.length !== 1) throw Error('Eén bevestigd kameraanbod vereist.');
  const rate = rates[0], room = clean(rate.name);
  const nights = (date(request.checkout) - date(request.checkin)) / 86400000;
  if (!Number.isInteger(nights) || nights < 1 || !room) throw Error('Bevestigde kamer en verblijfsduur ontbreken.');
  const adults = rate.adultCount, children = rate.childCount;
  const occupancy = request.occupancies?.[0];
  if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0 || request.occupancies?.length !== 1 || occupancy?.adults !== adults || (occupancy.children?.length || 0) !== children) throw Error('Kamerbezetting komt niet overeen met het aanbod.');
  const boards = {
    RO: ['Alleen verblijf', false], BI: ['Ontbijt inbegrepen', true],
    HB: ['Halfpension inbegrepen', true], FB: ['Volpension inbegrepen', true],
    AI: ['All-inclusive', true], DI: ['Diner inbegrepen', false],
    LI: ['Lunch inbegrepen', false], BDI: ['Ontbijt en diner inbegrepen', true],
    BLI: ['Ontbijt en lunch inbegrepen', true], LDI: ['Lunch en diner inbegrepen', false]
  };
  const board = Object.hasOwn(boards, rate.boardType) ? boards[rate.boardType] : null;
  if (!board) throw Error('Bevestigde maaltijdvoorwaarden ontbreken.');
  const stay = `${nights} ${nights === 1 ? 'overnachting' : 'overnachtingen'}`;
  const guests = `${adults} ${adults === 1 ? 'volwassene' : 'volwassenen'}${children ? ` en ${children} ${children === 1 ? 'kind' : 'kinderen'}` : ''}`;
  const dutchDate = value => { const d = new Date(date(value)); return `${d.getUTCDate()} ${['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const details = contentHotel?.supplier_details || hotel.supplier_details;
  if (details && String(details.id) !== String(hotelId)) throw Error('Hotelvoorzieningen horen niet bij dit hotel.');
  const facilityNames = [...(Array.isArray(details?.hotelFacilities) ? details.hotelFacilities : []), ...(Array.isArray(details?.facilities) ? details.facilities.map(f => f?.name) : [])].map(clean).filter(Boolean);
  const definitions = [
    ['wifi','Wifi','⌁',/\b(?:wi[ -]?fi|wireless internet)\b/i],
    ['parking','Parkeren','P',/\b(?:parking|parkeren|parkeergelegenheid)\b/i],
    ['late_checkout','Late check-out','◷',/\b(?:late check[ -]?out|laat uitchecken)\b/i],
    ['welcome_drink','Welkomstdrankje','♧',/\b(?:welcome drink|welkomstdrankje)\b/i]
  ];
  const perks = (Array.isArray(rate.perks) ? rate.perks : []).filter(p => clean(p?.name) && ['HOTEL','RATE','ROOM'].includes(p.level));
  const conditional = /if available|subject to|on request|upon request|availability|op aanvraag|beschikbaarheid|voorwaarden/i;
  const unavailable = /\b(?:no|not available|unavailable|niet beschikbaar|geen)\b/i;
  const paid = /surcharge|additional (?:charge|cost)|paid|fee|tegen betaling|toeslag|kosten|\b(?:EUR|USD|GBP)\s*\d|[€$£]\s*\d/i;
  const extras = definitions.map(([key,label,icon,match]) => {
    const benefits = perks.filter(p => match.test(p.name));
    const names = facilityNames.filter(n => match.test(n));
    if (key === 'parking' && clean(details?.parking)) names.push(clean(details.parking));
    const evidence = [...new Set(benefits.length ? benefits.map(p => clean(p.name)) : names)];
    let status = 'unconfirmed';
    if (evidence.some(n => unavailable.test(n))) status = 'unconfirmed';
    else if (benefits.length) status = evidence.some(n => conditional.test(n) || paid.test(n)) ? 'conditional' : 'included';
    else if (names.length) {
      // Only explicit whole facility labels certify a complimentary service. No inference from hotel prose.
      const free = /^(?:free (?:wi[ -]?fi|wireless internet|parking|self parking)|gratis (?:wifi|wi-fi|parkeren))$/i;
      status = names.some(n => paid.test(n)) ? 'paid' : names.some(n => conditional.test(n)) ? 'conditional' : names.every(n => free.test(n)) ? 'included' : 'available';
    }
    const displayEvidence = evidence.map(n => n.replace(/\b(?:free|gratis|complimentary)\b/gi, '').replace(/\s{2,}/g, ' ').trim());
    const statusText = {included:'Inbegrepen',paid:'Tegen betaling',conditional:'Onder voorwaarden',available:'Beschikbaar; kosten niet bevestigd',unconfirmed:'Niet bevestigd door de leverancier'}[status];
    return {key,icon,label,status,detail:[statusText,...displayEvidence].join(' · ')};
  });
  const breakfastPerks = perks.filter(p => /\b(?:breakfast|ontbijt)\b/i.test(p.name));
  const breakfast = board[1] || breakfastPerks.some(p => !conditional.test(p.name) && !paid.test(p.name));
  const included = [
    {icon:'☾',label:stay,detail:`Van ${dutchDate(request.checkin)} tot ${dutchDate(request.checkout)}`},
    {icon:'▱',label:room,detail:'Het aangeboden kamertype'},
    {icon:'♧',label:`Voor ${guests}`,detail:'Bezetting van de aangeboden kamer'}
  ];
  if (rate.boardType !== 'RO') included.push({icon:'☕',label:board[0],detail:'Volgens het geselecteerde tarief'});
  if (!board[1]) for (const perk of breakfastPerks) included.push({icon:'☕',label:'Ontbijt volgens tariefvoorwaarden',detail:clean(perk.name).replace(/\b(?:free|gratis|complimentary)\b/gi,'').trim()});
  for (const extra of extras.filter(e => e.status === 'included')) included.push({icon:extra.icon,label:extra.label,detail:extra.detail});
  // Preserve original benefit conditions; amount is benefit value, never a customer charge.
  return {
    content_verified:true, hotel_name:clean(hotel.name), room_type:room,
    minimum_nights:nights, max_guests:adults+children,
    includes_breakfast:breakfast, board_type:rate.boardType,
    ...Object.fromEntries(extras.map(e => [`includes_${e.key}`,e.status === 'included'])),
    extra_conditions:extras, facility_items:extras.filter(e => !['included','unconfirmed'].includes(e.status)),
    included_items:included, excluded_items:board[1] || breakfastPerks.length ? [] : ['Ontbijt'],
    travel_period_start:date(request.checkin), travel_period_end:date(request.checkout),
    title:`${stay} bij ${clean(hotel.name)}`,
    short_description:`${stay} in ${room} voor ${guests}.${rate.boardType === 'RO' ? '' : ' ' + board[0] + '.'}`,
    long_description:`Verblijf van ${dutchDate(request.checkin)} tot ${dutchDate(request.checkout)} bij ${clean(hotel.name)}. Eén ${room} voor ${guests}. ${rate.boardType === 'RO' ? '' : board[0] + '.'}${breakfastPerks.length ? ' ' + breakfastPerks.map(p => clean(p.name).replace(/\b(?:free|gratis|complimentary)\b/gi,'').trim()).join('. ') + '.' : ''}`
  };
}
// END GENERATED NUITEE CONTENT
// BEGIN GENERATED PRICING
// Owner-approved estimates; never label these as verified account tariffs.
// Stripe EUR reserve: https://stripe.com/nl/pricing/local-payment-methods (2026-10-16).
// Nuitée: last measured sandbox processing fee, not a confirmed production tariff.
const supplierPricingDefaults = Object.freeze({
  mode: 'percentage', markup_percentage: 20, markup_amount: 0, override_amount: 0,
  discount_percentage: 0, min_margin_amount: 20, rounding: 'none',
  processing_fee: 2.30, stripe_fee_percentage: 3.15, stripe_fee_fixed: 0.25,
  calculation_basis: 'costs_included_v2', defaults_version: '20261016-2',
  production_costs_verified: false, cost_status: 'estimated',
  cost_policy: 'owner_approved_estimate_v1',
  cost_evidence: 'Owner-approved estimate 2026-10-16: Nuitée sandbox 2.30 EUR; Stripe EUR card reserve 3.15% + 0.25 EUR; iDEAL reference 0.29 EUR. Account tariffs not verified.',
  payment_method: 'ACC_CREDIT_CARD'
});

function supplierPricingConfig(saved = {}, proposal = false) {
  const config = {...supplierPricingDefaults, ...saved};
  // Missing stored costs inherit approved estimates; explicit zero stays zero.
  for (const key of ['processing_fee','stripe_fee_percentage','stripe_fee_fixed']) {
    config[key] = saved[key] ?? supplierPricingDefaults[key];
  }
  if (['processing_fee','stripe_fee_percentage','stripe_fee_fixed'].some(key=>saved[key] == null) || saved.production_costs_verified !== true) {
    config.production_costs_verified = false;
    config.cost_status = 'estimated';
    config.cost_policy = supplierPricingDefaults.cost_policy;
    config.cost_evidence = saved.cost_evidence || supplierPricingDefaults.cost_evidence;
  }
  if (proposal) config.mode = 'percentage';
  return config;
}

function acceptedSupplierCosts(config) {
  return !!config && config.payment_method === 'ACC_CREDIT_CARD' && !!config.cost_evidence &&
    (config.production_costs_verified === true ||
     (config.cost_status === 'estimated' && config.cost_policy === 'owner_approved_estimate_v1'));
}

function calculateSupplierPrice(base, config) {
  const names = {processing_fee:'Nuitée kosten',stripe_fee_percentage:'Stripe kosten (%)',stripe_fee_fixed:'Stripe kosten (€)',markup_percentage:'Jouw opslag (%)',markup_amount:'Jouw opslag (€)',override_amount:'Verkoopprijs',discount_percentage:'Korting',min_margin_amount:'Minimaal overhouden'};
  const active = config.mode === 'percentage' ? 'markup_percentage' : config.mode === 'fixed' ? 'markup_amount' : 'override_amount';
  if (!['percentage','fixed','override'].includes(config.mode)) throw Error('Kies een geldige prijsregel.');
  for (const key of ['processing_fee','stripe_fee_percentage','stripe_fee_fixed','discount_percentage','min_margin_amount',active]) {
    if (config[key] == null || config[key] === '') throw Error(names[key] + ': standaardtarief nog te bevestigen.');
    if (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] < 0) throw Error(names[key] + ': vul een geldig bedrag in.');
  }
  if (!Number.isFinite(base) || base <= 0) throw Error('Inkoopprijs (Nuitée) ontbreekt.');
  const rate = config.stripe_fee_percentage / 100;
  const discount = 1 - config.discount_percentage / 100;
  if (rate >= 1 || discount <= 0 || discount > 1) throw Error('Kosten en korting moeten lager zijn dan 100%.');
  const fixedCost = base + config.processing_fee + config.stripe_fee_fixed;
  let raw = config.override_amount;
  if (config.mode === 'percentage') {
    const factor = 1 + config.markup_percentage / 100;
    const denominator = 1 - factor * rate;
    if (denominator <= 0) throw Error('Deze opslag en Stripe kosten leveren geen geldige verkoopprijs op.');
    raw = fixedCost * factor / denominator;
  } else if (config.mode === 'fixed') {
    raw = (fixedCost + config.markup_amount) / (1 - rate);
  }
  raw *= discount;
  // Avoid adding a cent to an exact integer due to floating-point noise.
  const ceil = n => Math.ceil(n - 1e-9);
  if (!['none','whole','99'].includes(config.rounding)) throw Error('Kies een geldige afronding.');
  const amount = config.rounding === 'whole' ? ceil(raw) : config.rounding === '99' ? (ceil(raw - .99) * 100 + 99) / 100 : ceil(raw * 100) / 100;
  const stripeCost = amount * rate + config.stripe_fee_fixed;
  const estimatedMargin = amount - base - config.processing_fee - stripeCost;
  if (!Number.isFinite(amount) || amount <= 0 || estimatedMargin + 1e-9 < config.min_margin_amount) throw Error('Je houdt minder over dan het ingestelde minimum.');
  return {amount, estimatedMargin, stripeCost, totalCost: base + config.processing_fee + stripeCost};
}
// END GENERATED PRICING
  const core = window.AdminCore;
  const dealId = new URLSearchParams(location.search).get("id");
  let admin;
  let deal;
  let supplierDeal;
  let supplierError;

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

  let seoSync = null;
  let seoPoll = null;
  function seoStatusHtml() {
    if (supplierDeal?.environment !== "production") return "";
    const state = seoSync?.state;
    const pending = seoSync?.pending || state === "pending";
    const label = seoSync?.error_code ? "Synchronisatie vraagt aandacht" : pending ? "Wijziging wordt verwerkt" : state === "published" ? "SEO-pagina zichtbaar" : state === "withdrawn" ? "SEO-pagina verborgen" : "Nog geen SEO-publicatie";
    const message = seoSync?.error_code ? "De automatische verwerking probeert het opnieuw. De beheerder kan de fout onderzoeken; je hoeft niet opnieuw goed te keuren." : pending ? "De bestaande goedkeuring wordt automatisch verwerkt." : "Deze status wordt automatisch bijgewerkt vanuit de dealstatus.";
    const url = seoSync?.url;
    const link = typeof url === "string" && /^https:\/\/www\.seasondeals\.nl\/deals\/[a-z0-9-]+$/.test(url) ? `<a class="secondary-button" href="${core.escapeHtml(url)}" target="_blank" rel="noopener">SEO-pagina bekijken</a>` : "";
    return `<span class="eyebrow">Website</span><h3>${label}</h3><p class="notice">${message}</p>${link}`;
  }
  function pollSeoStatus() {
    clearTimeout(seoPoll);
    if (supplierDeal?.environment !== "production" || (!seoSync?.pending && seoSync?.state !== "retry")) return;
    seoPoll = setTimeout(async () => {
      try {
        const data = await core.request(`/supplier-deals/${encodeURIComponent(dealId)}`);
        seoSync = data?.seo_sync || null;
        const panel = document.getElementById("seo-sync-status");
        if (panel) panel.innerHTML = seoStatusHtml();
      } catch (_) { /* Preserve the last confirmed state; retry without changing the review form. */ }
      pollSeoStatus();
    },15000);
  }

  async function load() {
    const data = await core.request(`/deals/${encodeURIComponent(dealId)}`);
    deal = data?.deal || data;
    supplierDeal = null;
    supplierError = null;
    if (window.SeasonDealsAdminConfig.supplierDealsEnabled) {
      try {
        const supplier = await core.request(`/supplier-deals/${encodeURIComponent(dealId)}`);
        supplierDeal = supplier?.supplier_deal || null;
        seoSync = supplier?.seo_sync || null;
      } catch (error) { supplierError = error.message; }
    }
    if (supplierDeal?.provider === "nuitee") {
      if (String(supplierDeal.deal_id) !== String(dealId)) throw new Error("Verkeerde leverancierskoppeling.");
      const {title,short_description,long_description,...facts} = nuiteeDealContent(supplierDeal.supplier_mapping, supplierDeal.supplier_hotel_id, supplierDeal.supplier_content?.hotel);
      Object.assign(deal, facts);
    }
    render();
    if (window.SeasonDealsAvailability) await window.SeasonDealsAvailability.mount(deal, supplierDeal);
    pollSeoStatus();
  }

  function render() {
    const target = document.getElementById("deal-detail");
    const supplierHotel = supplierDeal?.supplier_content?.hotel;
    const hotel = supplierHotel || deal.hotel || {};
    const photoValues = supplierDeal ? (supplierHotel?.photo_verification?.status === "verified" && supplierHotel.room_photos_matched ? supplierHotel.images || [] : []) : (Array.isArray(deal.images) ? deal.images : []);
    const photos = [...new Set(photoValues.map(value => typeof value === "string" ? value : value?.url).filter(url => typeof url === "string" && url.startsWith("https://")))];
    const image = photos[0] || (supplierDeal ? "" : core.imageUrl(deal.images));
    const inclusions = supplierDeal?.provider === "nuitee" ? [...deal.included_items, ...deal.extra_conditions.filter(e => !["included","unconfirmed"].includes(e.status))].map(row => `<span class="inclusion">${core.escapeHtml(row.label)} · ${core.escapeHtml(dealAmenityDetail(row.label,row.detail))}</span>`).join("") : [["includes_breakfast", "Ontbijt"], ["includes_wifi", "Wifi"], ["includes_parking", "Parkeren"], ["includes_late_checkout", "Late check-out"], ["includes_welcome_drink", "Welkomstdrankje"]].filter(([field]) => deal[field] === true).map(([, text]) => `<span class="inclusion">✓ ${text}</span>`).join("");
    const environment = String(deal.integration_environment || "").toLowerCase();
    const isTestDeal = environment === "test";
    const reviewAllowed = core.canReview(admin) && !supplierError && deal.status === "pending_approval" && (!supplierDeal || ["sandbox", "production"].includes(supplierDeal.environment));
    target.className = "detail-layout";
    target.innerHTML = `<article class="panel">${image ? `<div class="admin-photo-gallery"><img id="admin-gallery-image" class="deal-hero" src="${core.escapeHtml(image)}" alt="${core.escapeHtml(deal.title || "Deal")}">${photos.length > 1 ? `<p id="admin-gallery-count" class="admin-gallery-count" aria-live="polite">Foto 1 van ${photos.length} · Hotelfoto’s</p><div class="admin-gallery-thumbnails" aria-label="Losse hotelfoto’s">${photos.map((url,index)=>`<button type="button" data-gallery-index="${index}" aria-label="Foto ${index + 1} bekijken" aria-pressed="${index === 0}"><img loading="lazy" src="${core.escapeHtml(url)}" alt="Hotelfoto ${index + 1}"></button>`).join("")}</div>` : ""}</div>` : '<div class="deal-hero deal-hero-placeholder">Nog geen bevestigde hotelfoto’s</div>'}<div class="deal-body"><div class="deal-title-row"><div><h2>${core.escapeHtml(deal.title || "Naamloze deal")}</h2><p class="hotel-line">${core.escapeHtml(hotel.name || deal.hotel_name || "Onbekend hotel")} · ${core.escapeHtml(hotel.city || deal.city || "")}</p></div>${core.statusBadge(deal.status)}</div><div class="fact-grid"><div class="fact"><span>Dealprijs</span><strong>${core.money(deal.price)}</strong></div><div class="fact"><span>Oorspronkelijke prijs</span><strong>${core.money(deal.original_price)}</strong></div><div class="fact"><span>Voorraad</span><strong>${supplierDeal ? "Op basis van actuele beschikbaarheid" : `${core.escapeHtml(deal.inventory ?? 0)} beschikbaar`}</strong></div><div class="fact"><span>Verblijf</span><strong>${core.escapeHtml(deal.minimum_nights || 1)} nacht(en) · max. ${core.escapeHtml(deal.max_guests || 0)} gasten</strong></div><div class="fact"><span>Reisperiode</span><strong>${core.date(deal.travel_period_start)} – ${core.date(deal.travel_period_end)}</strong></div><div class="fact"><span>Ingediend</span><strong>${core.date(deal.submitted_at, true)}</strong></div></div>${inclusions ? `<div class="inclusion-list">${inclusions}</div>` : ""}<section class="deal-copy"><h3>Korte omschrijving</h3><p>${core.escapeHtml(deal.short_description || "Geen korte omschrijving.")}</p></section><section class="deal-copy"><h3>Uitgebreide omschrijving</h3><p>${core.escapeHtml(deal.long_description || "Geen uitgebreide omschrijving.")}</p></section><section class="deal-copy"><h3>Annuleringsvoorwaarden</h3><p>${core.escapeHtml(deal.cancellation_policy || "Niet opgegeven.")}</p></section></div></article><aside class="detail-sidebar">${supplierDeal?.environment === "production" ? `<section id="seo-sync-status" class="panel review-card">${seoStatusHtml()}</section>` : ""}<section class="panel review-card"><span class="eyebrow">Beveiligde weergave</span><h3>Testpreview</h3><p class="notice">Bekijk deze deal in de nieuwe SeasonDeals-stijl. Boeken, betalen en voorraadwijzigingen zijn uitgeschakeld.</p><a class="secondary-button" href="../deal-preview.html?portal=admin&id=${encodeURIComponent(deal.id)}">Testpreview openen</a>${supplierDeal?.provider === "nuitee" && supplierDeal.environment === "sandbox" && deal.status === "active" ? `<a class="secondary-button" href="../nuitee-availability-preview.html?portal=admin&id=${encodeURIComponent(deal.id)}">Actuele beschikbaarheid testen</a>` : ""}</section><section class="panel review-card"><span class="eyebrow">Beoordeling</span><h3>${reviewAllowed ? "Neem een besluit" : "Beoordelingsstatus"}</h3>${reviewAllowed ? `<label for="review-notes">Interne notitie (optioneel)</label><textarea id="review-notes" class="review-input" placeholder="Notitie voor het auditdossier"></textarea><label for="rejection-reason">Reden bij afwijzing</label><textarea id="rejection-reason" class="review-input" placeholder="Verplicht wanneer je de deal afwijst"></textarea><div class="review-actions"><button id="approve-deal" class="primary-button" type="button">Goedkeuren</button><button id="reject-deal" class="danger-button" type="button">Afwijzen</button></div>` : reviewSummary()}${!core.canReview(admin) && deal.status === "pending_approval" ? '<p class="notice">Je account mag deals bekijken, maar alleen superadmins en platformadmins kunnen besluiten nemen.</p>' : ""}</section><section class="panel review-card"><span class="eyebrow">Hotel</span><h3>${core.escapeHtml(hotel.name || "Onbekend hotel")}</h3><div class="meta-list"><div class="meta-row"><span>Plaats</span><strong>${core.escapeHtml(hotel.city || "—")}</strong></div><div class="meta-row"><span>Land</span><strong>${core.escapeHtml(hotel.country || "—")}</strong></div><div class="meta-row"><span>E-mail</span><strong>${core.escapeHtml(hotel.email || "—")}</strong></div><div class="meta-row"><span>Telefoon</span><strong>${core.escapeHtml(hotel.phone || "—")}</strong></div><div class="meta-row"><span>Deal-ID</span><strong>#${core.escapeHtml(deal.id)}</strong></div></div></section></aside>`;
    target.querySelectorAll("[data-gallery-index]").forEach(button => button.addEventListener("click", () => {
      const index = Number(button.dataset.galleryIndex);
      document.getElementById("admin-gallery-image").src = photos[index];
      document.getElementById("admin-gallery-count").textContent = `Foto ${index + 1} van ${photos.length} · Hotelfoto’s`;
      target.querySelectorAll("[data-gallery-index]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    }));
    const titleRow = target.querySelector(".deal-title-row");
    titleRow?.insertAdjacentHTML("beforeend", environmentBadge(environment));
    if (isTestDeal) {
      const reviewCard = target.querySelector(".review-card");
      reviewCard?.insertAdjacentHTML("afterbegin", '<p class="notice environment-warning"><strong>TESTDEAL</strong><br>Goedkeuren zet deze deal op Actief + Test. De deal blijft buiten de publieke website totdat je hem via Koppeling live zetten publiceert.</p>');
    }
    if (supplierDeal || supplierError) {
      const sidebar = target.querySelector(".detail-sidebar");
      sidebar?.insertAdjacentHTML("afterbegin", supplierPanel());
      target.querySelector(".deal-title-row .environment-badge")?.remove();
      titleRow?.insertAdjacentHTML("beforeend", '<span class="environment-badge environment-test">NUITÉE · ' + core.escapeHtml(supplierDeal?.environment || "ONBEKEND") + '</span>');
      document.getElementById("supplier-pricing")?.addEventListener("submit", saveSupplierPricing);
      document.getElementById("supplier-content")?.addEventListener("submit", saveSupplierContent);
      document.getElementById("supplier-submit")?.addEventListener("click", () => supplierWorkflow("submit"));
      document.getElementById("supplier-draft")?.addEventListener("click", () => supplierWorkflow("draft"));
      document.getElementById("supplier-pricing")?.addEventListener("input", previewSupplierPrice);
      previewSupplierPrice();
    }
    document.getElementById("approve-deal")?.addEventListener("click", approve);
    document.getElementById("reject-deal")?.addEventListener("click", reject);
  }

  function reviewSummary() {
    if (supplierError) return '<p class="notice">Beoordeling wacht op de leveranciersgegevens.</p>';
    if (supplierDeal?.environment === "sandbox" && deal.status === "active") return '<p class="notice"><strong>Goedgekeurd in sandbox.</strong><br>Deze deal blijft buiten de publieke website.</p>';
    if (deal.status === "rejected") return `<p class="notice"><strong>Afgewezen op ${core.date(deal.rejected_at, true)}</strong><br>${core.escapeHtml(deal.rejection_reason || "Geen reden opgeslagen.")}</p>${deal.review_notes ? `<div class="deal-copy"><h3>Interne notitie</h3><p>${core.escapeHtml(deal.review_notes)}</p></div>` : ""}`;
    if (deal.status === "active") {
      const visibility = String(deal.integration_environment || "").toLowerCase() === "test"
        ? "Deze deal is Actief + Test en blijft buiten de publieke website totdat je hem live zet."
        : "Deze deal is actief en zichtbaar voor bezoekers.";
      return `<p class="notice"><strong>Goedgekeurd op ${core.date(deal.approved_at, true)}</strong><br>${visibility}</p>${deal.review_notes ? `<div class="deal-copy"><h3>Interne notitie</h3><p>${core.escapeHtml(deal.review_notes)}</p></div>` : ""}`;
    }
    return `<p class="notice">Deze deal heeft status ${core.escapeHtml(core.statusLabel(deal.status))} en kan vanuit deze status niet worden goedgekeurd of afgewezen.</p>`;
  }
  function environmentBadge(environment) {
    if (!environment) return '<span class="environment-badge environment-manual">HANDMATIG</span>';
    return `<span class="environment-badge environment-${core.escapeHtml(environment)}">${environment === "production" ? "PRODUCTIE" : "TEST"}</span>`;
  }

  async function approve() {
    const isTestDeal = supplierDeal?.environment === "sandbox" || String(deal.integration_environment || "").toLowerCase() === "test";
    const question = isTestDeal
      ? `Weet je zeker dat je “${deal.title}” wilt goedkeuren als Actief + Test? De deal wordt nog niet publiek.`
      : `Weet je zeker dat je “${deal.title}” wilt goedkeuren en live wilt zetten?`;
    if (!confirm(question)) return;
    await updateStatus("active", isTestDeal ? "Testdeal goedgekeurd als Actief + Test." : "Deal goedgekeurd en geactiveerd.");
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
      const response = await core.request(supplierDeal ? `/supplier-deals/${encodeURIComponent(dealId)}/workflow` : `/deals/${encodeURIComponent(dealId)}/status`, { method: "PATCH", body: JSON.stringify(supplierDeal ? {...body, action:status} : body) });
      core.toast(response?.message || success);
      await load();
    } catch (error) { core.toast(error.message, "error"); buttons.forEach((button) => { if (button) button.disabled = false; }); }
  }

  function supplierPanel() {
    if (supplierError) return '<section class="panel review-card"><h3>Nuitée-gegevens niet beschikbaar</h3><p class="notice">' + core.escapeHtml(supplierError) + '</p><p>Beoordeling wacht totdat de leveranciersgegevens zijn opgehaald.</p></section>';
    const saved = supplierDeal.pricing_config || {};
    const config = supplierPricingConfig(saved, deal.status === "draft" && String(saved.price_status || "").startsWith("proposal_"));
    const writable = core.canReview(admin) && deal.status === "draft";
    const numberInput = (key, label, suffix = "€") => `<div class="price-field"><label for="supplier-${key}">${label}</label><div class="price-input-wrap"><input id="supplier-${key}" name="${key}" type="number" min="0" step="0.01" inputmode="decimal" value="${core.escapeHtml(config[key] ?? "")}" placeholder="Nog te bevestigen" ${writable ? "" : "disabled"}><span aria-hidden="true">${suffix}</span></div></div>`;
    return `<section class="panel review-card supplier-price-card"><span class="eyebrow">Nuitée</span><h3>Prijs en marge</h3>
      <div class="price-base"><span>Inkoopprijs (Nuitée)</span><strong>${core.money(supplierDeal.supplier_base_amount)}</strong></div>
      <form id="supplier-pricing">
        <label for="supplier-mode">Prijsregel</label><select id="supplier-mode" name="mode" ${writable ? "" : "disabled"}>${[["percentage","Percentage"],["fixed","Vaste opslag"],["override","Vaste verkoopprijs"]].map(([value,label])=>`<option value="${value}" ${config.mode===value?"selected":""}>${label}</option>`).join("")}</select>
        <div data-price-mode="percentage">${numberInput("markup_percentage","Jouw opslag","%")}</div>
        <div data-price-mode="fixed">${numberInput("markup_amount","Jouw opslag")}</div>
        <div data-price-mode="override">${numberInput("override_amount","Verkoopprijs")}</div>
        <p class="price-help" id="supplier-basis-help">Boven op de inkoopprijs, Nuitée kosten en Stripe kosten.</p>
        <div class="price-result" id="supplier-price-preview" aria-live="polite"></div>
        <details class="price-settings"><summary>Kosten aanpassen <span id="supplier-cost-status"></span></summary>
          ${numberInput("processing_fee","Nuitée kosten")}
          <fieldset><legend>Stripe kosten</legend><div class="price-columns">${numberInput("stripe_fee_percentage","Percentage","%")}${numberInput("stripe_fee_fixed","Vast bedrag")}</div></fieldset>
          <p class="price-help">Vooraf ingevulde schattingen, bewerkbaar per deal. Nuitée: €2,30 op basis van onze test. Stripe: 3,15% + €0,25 reserve voor kaartbetalingen; iDEAL is normaal €0,29 bij het standaardtarief en zonder valutaomwisseling. Werkelijke kosten worden achteraf vergeleken.</p>
        </details>
        <details class="price-settings"><summary>Overige instellingen</summary>
          ${numberInput("discount_percentage","Korting","%")}${numberInput("min_margin_amount","Minimaal overhouden")}
          <label for="supplier-rounding">Afronding omhoog</label><select id="supplier-rounding" name="rounding" ${writable ? "" : "disabled"}>${[["none","Op centen"],["whole","Op hele euro"],["99","Op € …,99"]].map(([value,label])=>`<option value="${value}" ${config.rounding===value?"selected":""}>${label}</option>`).join("")}</select>
        </details>
        ${writable ? '<button type="submit" class="primary-button">Prijsregels opslaan</button>' : '<p class="price-help">Alleen bewerkbaar bij een conceptdeal door een bevoegde beheerder.</p>'}
        <p class="price-help">Opslaan wijzigt alleen deze deal. Actuele inkoop en kosten worden bij het boeken opnieuw gecontroleerd.</p>
      </form>
      ${writable ? supplierContentForm() + '<button id="supplier-submit" class="primary-button" type="button">Indienen ter beoordeling</button>' : core.canReview(admin) ? '<button id="supplier-draft" class="secondary-button" type="button">Terug naar concept</button>' : ""}
      <p class="notice">${supplierDeal.environment === "production" ? "Goedkeuren na beoordeling maakt de deal zichtbaar op de website. Boeken blijft tot de livegang gesloten." : "Sandboxgoedkeuring publiceert geen deal."}</p></section>`;
  }
  function supplierContentForm() {
    return '<form id="supplier-content"><h3>Dealinhoud</h3>' + [["title","Titel"],["short_description","Korte omschrijving"],["long_description","Uitgebreide omschrijving"],["cancellation_policy","Annuleringsvoorwaarden"]].map(([key,label]) => '<label for="supplier-content-' + key + '">' + label + '</label><textarea required id="supplier-content-' + key + '" name="' + key + '" class="review-input">' + core.escapeHtml(deal[key] || "") + '</textarea>').join("") + '<button class="secondary-button" type="submit">Inhoud opslaan</button></form>';
  }
  async function saveSupplierContent(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = {action:"save_content"};
    for (const key of ["title","short_description","long_description","cancellation_policy"]) body[key] = form.elements[key].value.trim();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      await core.request(`/supplier-deals/${encodeURIComponent(dealId)}/workflow`, {method:"PATCH",body:JSON.stringify(body)});
      await load(); core.toast("Dealinhoud opgeslagen.");
    } catch(error) {core.toast(error.message,"error");}
    finally {if(button.isConnected) button.disabled=false;}
  }
  async function supplierWorkflow(action) {
    if(!confirm(action === "submit" ? "De opgeslagen dealinhoud en prijsregels indienen ter beoordeling?" : "Terugzetten naar concept? De deal wordt van de website gehaald.")) return;
    const button = document.getElementById(action === "submit" ? "supplier-submit" : "supplier-draft");
    if(button) button.disabled=true;
    try {
      await core.request(`/supplier-deals/${encodeURIComponent(dealId)}/workflow`, {method:"PATCH",body:JSON.stringify({action})});
      await load(); core.toast(action === "submit" ? "Deal ingediend ter beoordeling." : "Deal teruggezet naar concept.");
    } catch(error) {core.toast(error.message,"error");}
    finally {if(button?.isConnected) button.disabled=false;}
  }
  function readSupplierPricing() {
    const form = document.getElementById("supplier-pricing");
    const config = {mode: form.elements.mode.value, rounding: form.elements.rounding.value};
    for (const key of ["markup_percentage","markup_amount","override_amount","discount_percentage","min_margin_amount","processing_fee","stripe_fee_percentage","stripe_fee_fixed"]) {
      const value = form.elements[key].value.trim();
      config[key] = value === "" ? null : Number(value);
    }
    return config;
  }
  function calculatePreview(config) {
    return calculateSupplierPrice(Number(supplierDeal.supplier_base_amount),config);
  }
  function previewSupplierPrice() {
    const target = document.getElementById("supplier-price-preview");
    if (!target) return;
    const form = document.getElementById("supplier-pricing"), config = readSupplierPricing();
    form.querySelectorAll('[data-price-mode]').forEach(row => { row.hidden = row.dataset.priceMode !== config.mode; });
    document.getElementById("supplier-basis-help").textContent = config.mode === "override" ? "Het totale bedrag dat de klant betaalt." : "Boven op de inkoopprijs, Nuitée kosten en Stripe kosten.";
    const missing = ['processing_fee','stripe_fee_percentage','stripe_fee_fixed'].some(key=>config[key] == null);
    document.getElementById("supplier-cost-status").textContent = missing ? "Vul de kosten in" : "Schatting · bewerkbaar";
    const submit = form.querySelector('button[type="submit"]');
    try {
      const result = calculatePreview(config);
      target.innerHTML = `<span>Verkoopprijs · kosten geschat</span><strong>${core.money(result.amount)}</strong><div><span>Verwacht over</span><b>${core.money(result.estimatedMargin)}</b></div><small>Na inkoop, Nuitée kosten en Stripe kosten (${core.money(result.stripeCost)}). Vóór overige bedrijfskosten en belastingen.</small>`;
      if(submit) submit.disabled=false;
    } catch (error) {
      target.innerHTML = '<span>Verkoopprijs</span><strong>—</strong><small>' + core.escapeHtml(error.message) + '</small>';
      if(submit) submit.disabled=true;
    }
  }
  async function saveSupplierPricing(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    try {
      const pricing_config = readSupplierPricing();
      calculatePreview(pricing_config);
      button.disabled = true;
      await core.request(`/supplier-deals/${encodeURIComponent(dealId)}/pricing`, {method:"PATCH", body:JSON.stringify({pricing_config})});
      await load();
      core.toast("Prijsregels opgeslagen; deal blijft concept.");
    } catch (error) { core.toast(error.message, "error"); }
    finally { if (button?.isConnected) button.disabled = false; }
  }

  function showError(message) { const target = document.getElementById("deal-detail"); if (target) { target.className = "error-panel"; target.textContent = message; } }
})();
