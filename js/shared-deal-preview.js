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
  const params = new URLSearchParams(window.location.search);
  const portal = params.get("portal") === "admin" ? "admin" : "partner";
  const isAdmin = portal === "admin";
  const portalBase = isAdmin ? "admin" : ".";
  const portalBack = isAdmin ? `admin/deal-detail.html?id=${encodeURIComponent(params.get("id") || "")}` : `deal-detail.html?id=${encodeURIComponent(params.get("id") || "")}`;
  const CONFIG = {
    xanoOrigin: "https://xgrq-dkge-tace.n7e.xano.io",
    adminEndpoint: "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-admin",
    partnerEndpoint: "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-partner",
    tokenKey: isAdmin ? "sd_admin_token" : "sd_partner_token",
    loginUrl: isAdmin ? "admin/login.html" : "login.html",
    homePage: portalBack,
    locale: "nl-NL",
    currency: "EUR"
  };
  const container = document.getElementById("deal-detail");
  const dealId = new URLSearchParams(window.location.search).get("id");
  let deal = null;
  let supplier = null;
  const availabilityPreview = isAdmin && window.SEASONDEALS_AVAILABILITY_PREVIEW === true;
  const availabilityBranch = 'nuitee-availability-2026-10-08';
  let gallery = [];
  let activePhoto = 0;

  if (!dealId) return showError("Geen deal geselecteerd", "Open een deal via de SeasonDeals-homepage om alle informatie te bekijken.");
  loadDeal();

  async function loadDeal() {
    const token = sessionStorage.getItem(CONFIG.tokenKey);
    if (!token) {
      window.location.replace(CONFIG.loginUrl);
      return;
    }

    try {
      let response;
      if (isAdmin) {
        response = await fetch(`${CONFIG.adminEndpoint}/deals/${encodeURIComponent(dealId)}/preview`, {
          method: "GET",
          mode: "cors",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
        });
      } else {
        response = await fetch(`${CONFIG.partnerEndpoint}/deals`, {
          method: "GET",
          mode: "cors",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
        });
      }

      if (response.status === 401) {
        sessionStorage.removeItem(CONFIG.tokenKey);
        window.location.replace(CONFIG.loginUrl);
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || data?.error || `De dealservice gaf status ${response.status}.`);

      if (isAdmin) {
        const preview = data?.preview || {};
        if (preview.enabled !== true || preview.public !== false || preview.bookable !== false) {
          throw new Error("Xano heeft de beveiligde previewmodus niet bevestigd.");
        }
        deal = data?.deal || null;
        if (deal && data?.hotel && !deal.hotel) deal.hotel = data.hotel;
      } else {
        deal = resolveDeals(data).find((item) => String(item?.id) === String(dealId));
      }

      if (availabilityPreview) {
        const supplierResponse = await fetch(`${CONFIG.adminEndpoint}/supplier-deals/${encodeURIComponent(dealId)}`, {headers:{Accept:'application/json',Authorization:`Bearer ${token}`,'X-Branch':availabilityBranch},cache:'no-store'});
        if (!supplierResponse.ok) throw new Error('Leveranciersmapping kon niet worden geladen.');
        supplier = (await supplierResponse.json()).supplier_deal;
        if (!supplier || supplier.provider !== 'nuitee' || supplier.environment !== 'sandbox') throw new Error('Deze preview is alleen voor Nuitée-sandboxdeals.');
        if (deal && supplier.supplier_content?.hotel) deal.hotel = supplier.supplier_content.hotel;
      }
      if (!deal) return showError("Deze deal is niet beschikbaar", "De deal is niet gevonden binnen jouw beveiligde portaal.");
      // Older admin preview contracts omit source; resolve it through the authenticated supplier reader.
      if (isAdmin && (!deal.source || deal.source === "provider_sync")) {
        const supplierResponse = supplier ? null : await fetch(`${CONFIG.adminEndpoint}/supplier-deals/${encodeURIComponent(dealId)}`, {headers:{Accept:"application/json",Authorization:`Bearer ${token}`},cache:"no-store"});
        if (supplierResponse && !supplierResponse.ok && !(supplierResponse.status === 404 && !deal.source)) throw new Error("De leveranciersgegevens konden niet worden gecontroleerd.");
        const confirmedSupplier = supplier || (supplierResponse?.ok ? (await supplierResponse.json()).supplier_deal : null);
        if (confirmedSupplier) {
          if (confirmedSupplier.provider !== "nuitee" || String(confirmedSupplier.deal_id) !== String(dealId)) throw new Error("De leverancierskoppeling komt niet overeen met deze deal.");
          supplier = confirmedSupplier;
          const hotel = supplier.supplier_content?.hotel;
          const content = nuiteeDealContent(supplier.supplier_mapping, supplier.supplier_hotel_id, hotel);
          const {title,short_description,long_description,...facts} = content;
          Object.assign(deal, facts, {source:"provider_sync"});
          if (hotel) deal.hotel = hotel;
          deal.external_image_urls = hotel?.photo_verification?.status === "verified" && hotel.room_photos_matched === true ? hotel.images || [] : [];
        } else if (deal.source === "provider_sync") throw new Error("De leveranciersgegevens ontbreken.");
      }
      if (isAdmin && !supplier && !deal.hotel?.name && !deal.hotel_name) {
        const hotelResponse = await fetch(`${CONFIG.adminEndpoint}/deals/${encodeURIComponent(dealId)}`, {headers:{Accept:"application/json",Authorization:`Bearer ${token}`},cache:"no-store"});
        if (!hotelResponse.ok) throw new Error("De hotelnaam kon niet worden gecontroleerd.");
        const detailData = await hotelResponse.json();
        const detail = detailData.deal || detailData;
        if (String(detail.id) !== String(dealId)) throw new Error("De hotelgegevens horen niet bij deze deal.");
        deal.hotel = detail.hotel;
        deal.hotel_name = detail.hotel_name || detail.hotel?.name;
      }
      gallery = getImages(deal);
      renderDeal();
      bindDealEvents();
      bindPreviewNavigation();
      if (availabilityPreview) window.SeasonDealsSupplierAvailability.mount({form:document.getElementById('booking-form'),endpoint:`${CONFIG.adminEndpoint}/supplier-deals/${encodeURIComponent(dealId)}/availability`,tokenKey:CONFIG.tokenKey,branch:availabilityBranch,defaults:supplier.supplier_mapping?.request});
    } catch (error) {
      console.error("SeasonDeals preview failed:", error);
      showError("De testpreview kon niet worden geladen", error?.message || "Probeer het opnieuw vanuit het portaal.");
    }
  }

  function bindPreviewNavigation() {
    ["shared-preview-back", "preview-all-deals", "preview-brand-link", "preview-footer-link"].forEach((id) => {
      const link = document.getElementById(id);
      if (link) link.href = portalBack;
    });
    document.querySelectorAll(".preview-portal-link").forEach((link) => {
      link.href = portalBack;
    });
  }

  function renderDeal() {
    const title = text(deal.title || deal.name, "SeasonDeals deal");
    const hotel = text(deal.hotel_name || deal.hotel?.name, "SeasonDeals");
    const city = text(deal.city || deal.hotel?.city, "");
    const country = text(deal.country || deal.hotel?.country, "");
    const location = [city, country].filter(Boolean).join(", ");
    const price = positiveNumber(deal.deal_price, deal.price);
    const original = number(deal.original_price) || price;
    const saving = original > price ? original - price : 0;
    const rating = number(deal.review_score ?? deal.hotel?.review_score);
    const reviews = number(deal.review_count ?? deal.hotel?.review_count);
    const amenities = getAmenities(deal);
    const excluded = Array.isArray(deal.excluded_items) ? deal.excluded_items : [];
    const remaining = getRemaining(deal);
    const maxGuests = Math.max(1, Math.min(20, number(deal.max_guests) || 10));
    const travelStart = toDate(deal.travel_period_start);
    const travelEnd = toDate(deal.travel_period_end);
    const mainDescription = text(deal.short_description || deal.description, "Ontdek deze bijzondere SeasonDeals-aanbieding en bekijk hieronder alles wat is inbegrepen.");
    const longDescription = text(deal.long_description, "");
    const policy = text(deal.cancellation_policy, "Controleer vóór het boeken altijd de voorwaarden van deze deal. Neem bij vragen contact op met SeasonDeals.");
    document.title = `${title} · SeasonDeals`;

    container.innerHTML = `<div class="detail-container">
      <nav class="detail-breadcrumbs" aria-label="Broodkruimel"><a href="${escapeAttribute(CONFIG.homePage)}">Home</a><span>›</span><a href="${escapeAttribute(CONFIG.homePage)}#deals">Deals</a><span>›</span><span>${escapeHtml(title)}</span></nav>
      ${renderGallery(title)}
      <header class="detail-heading"><div><span class="detail-kicker">${escapeHtml(formatCategory(getCategory(deal)))}${location ? ` · ${escapeHtml(location)}` : ""}</span><h1>${escapeHtml(title)}</h1><div class="detail-subline"><strong>${escapeHtml(hotel)}</strong>${rating > 0 ? `<span class="detail-rating">★ ${escapeHtml(formatDecimal(rating))}${reviews > 0 ? ` · ${escapeHtml(formatNumber(reviews))} beoordelingen` : ""}</span>` : ""}${deal.star_rating > 0 ? `<span>${"★".repeat(Math.min(5, Math.round(deal.star_rating)))} hotel</span>` : ""}${remaining !== null ? `<span class="detail-stock${remaining <= 5 ? " is-low" : ""}">● ${remaining === 0 ? "Uitverkocht" : `Actuele voorraad: ${formatNumber(remaining)}`}</span>` : ""}</div></div><div class="detail-heading-actions"><button class="detail-icon-button" id="share-deal" type="button" aria-label="Deal delen">↗</button><button class="detail-icon-button" id="save-deal" type="button" aria-label="Deal opslaan">♡</button></div></header>
      <div class="detail-layout"><article class="detail-content">
        <section><span class="detail-section-label">Over deze deal</span><h2>Een bijzonder moment voor een mooie prijs.</h2><p>${escapeHtml(mainDescription)}</p>${longDescription && longDescription !== mainDescription ? `<p class="detail-description-long">${formatText(longDescription)}</p>` : ""}</section>
        ${amenities.length ? `<section><span class="detail-section-label">Dit is inbegrepen</span><h2>Jouw verblijf</h2><div class="amenities-grid">${amenities.map(renderAmenity).join("")}</div></section>` : ""}
        ${Array.isArray(deal.facility_items) && deal.facility_items.length ? `<section><h2>Voorzieningen en voorwaarden</h2><div class="amenities-grid">${deal.facility_items.map(row => renderAmenity([true,row.icon,row.label,row.detail])).join("")}</div></section>` : ""}
        <section><span class="detail-section-label">Geldigheid</span><h2>Plan jouw moment.</h2><div class="period-card"><div><span>Te gebruiken vanaf</span><strong>${travelStart ? formatDate(travelStart) : "Zie dealvoorwaarden"}</strong></div><div><span>Te gebruiken tot en met</span><strong>${travelEnd ? formatDate(travelEnd) : "Zie dealvoorwaarden"}</strong></div></div></section>
        <section><span class="detail-section-label">Annuleren en wijzigen</span><h2>Goed om vooraf te weten.</h2><div class="policy-card">${formatText(policy)}</div></section>
      </article>
      <aside class="booking-card" aria-label="Deal boeken"><div class="booking-price"><span>${original > price ? `<del>${escapeHtml(formatCurrency(original))}</del>` : ""}<strong>${escapeHtml(formatCurrency(price))}</strong><small>${deal.max_guests > 1 ? `voor maximaal ${formatNumber(deal.max_guests)} personen` : "per boeking"}</small></span>${saving > 0 ? `<span class="booking-save">Bespaar ${escapeHtml(formatCurrency(saving))}</span>` : ""}</div>
        <form id="booking-form" class="booking-form" novalidate><div class="booking-dates"><label>Check-in<input id="sd-checkin" name="checkin" type="date" required></label><label>Check-out<input id="sd-checkout" name="checkout" type="date" required></label></div><label>Aantal gasten<select id="sd-guests" name="guests">${Array.from({length:maxGuests},(_,i)=>`<option value="${i+1}">${i+1} ${i ? "gasten" : "gast"}</option>`).join("")}</select></label><div id="booking-message" class="booking-message" role="alert"></div><button id="sd-check-availability" class="button button-primary booking-submit" type="submit">Bekijk beschikbaarheid & boek <span>→</span></button></form>
        <div class="booking-assurances"><div><span>♢</span><p><strong>Veilig betalen via Stripe</strong><br>Je betaling wordt beveiligd verwerkt.</p></div><div><span>▱</span><p><strong>Direct je voucher</strong><br>Na betaling ontvang je de bevestiging per e-mail.</p></div><div><span>◇</span><p><strong>Transparante voorwaarden</strong><br>Geen onverwachte verplichte kosten achteraf.</p></div></div>${remaining !== null ? `<p class="availability${remaining <= 5 ? " is-low" : ""}"><span>●</span> Actuele voorraad: <strong>${formatNumber(remaining)} ${remaining === 1 ? "deal" : "deals"}</strong></p>` : ""}
      </aside></div>
    </div>${renderLightbox(title)}`;
    const previewButton = document.getElementById("sd-check-availability");
    if (previewButton) {
      previewButton.classList.add("is-preview");
      previewButton.innerHTML = "Testpreview · boeken uitgeschakeld <span>→</span>";
    }
    setDateLimits(travelStart, travelEnd);
  }

  function renderGallery(title) {
    if (!gallery.length) return `<div class="detail-gallery detail-gallery-single"><div class="detail-photo"><div class="detail-placeholder"><strong>SeasonDeals</strong><small>Hot offers, cool prices</small></div></div></div>`;
    const visible = gallery.slice(0, 3);
    return `<div class="detail-gallery${visible.length === 1 ? " detail-gallery-single" : ""}">${visible.map((url,index)=>`<button class="detail-photo" type="button" data-photo="${index}" aria-label="Foto ${index+1} van ${gallery.length} openen"><img src="${escapeAttribute(url)}" alt="${escapeAttribute(title)}${index ? `, foto ${index+1}` : ""}"><span class="detail-photo-overlay"></span>${index === visible.length-1 && gallery.length > 1 ? `<span class="gallery-count">▦ Bekijk alle ${gallery.length} foto’s</span>` : ""}</button>`).join("")}</div>`;
  }

  function renderLightbox(title) { return gallery.length ? `<div id="deal-lightbox" class="lightbox" role="dialog" aria-modal="true" aria-label="Fotogalerij"><button class="lightbox-close" type="button" aria-label="Sluiten">×</button><button class="lightbox-nav lightbox-prev" type="button" aria-label="Vorige foto">‹</button><img id="lightbox-image" src="${escapeAttribute(gallery[0])}" alt="${escapeAttribute(title)}"><button class="lightbox-nav lightbox-next" type="button" aria-label="Volgende foto">›</button><span id="lightbox-counter" class="lightbox-counter">1 / ${gallery.length}</span></div>` : ""; }

  function bindDealEvents() {
    document.querySelectorAll("[data-photo]").forEach((button) => button.addEventListener("click", () => openPhoto(number(button.dataset.photo) || 0)));
    document.querySelector(".lightbox-close")?.addEventListener("click", closePhoto);
    document.querySelector(".lightbox-prev")?.addEventListener("click", () => movePhoto(-1));
    document.querySelector(".lightbox-next")?.addEventListener("click", () => movePhoto(1));
    document.getElementById("deal-lightbox")?.addEventListener("click", (event) => { if (event.target.id === "deal-lightbox") closePhoto(); });
    document.addEventListener("keydown", handleKeyboard);
    if (!availabilityPreview) document.getElementById("booking-form")?.addEventListener("submit", startCheckout);
    document.getElementById("share-deal")?.addEventListener("click", shareDeal);
    document.getElementById("save-deal")?.addEventListener("click", () => showToast("Deze favorietenfunctie koppelen we later aan je account."));
  }

  async function startCheckout(event) {
    event.preventDefault();
    showBookingMessage("Dit is een beveiligde testpreview. Er wordt geen boeking, betaling of voorraadwijziging uitgevoerd.", "info");
    showToast("Testpreview: boeken is uitgeschakeld.");
  }

  function setDateLimits(start, end) {
    const checkin = document.getElementById("sd-checkin"), checkout = document.getElementById("sd-checkout");
    if (!checkin || !checkout) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const min = start && start > today ? start : today;
    const minValue = inputDate(min); checkin.min = minValue; checkout.min = minValue;
    if (end) { const maxValue = inputDate(end); checkin.max = maxValue; checkout.max = maxValue; }
    checkin.addEventListener("change", () => { checkout.min = checkin.value || minValue; if (checkout.value && checkout.value <= checkin.value) checkout.value = ""; });
  }

  function openPhoto(index) { if (!gallery.length) return; activePhoto = index; updateLightbox(); document.getElementById("deal-lightbox")?.classList.add("is-open"); document.body.style.overflow = "hidden"; }
  function closePhoto() { document.getElementById("deal-lightbox")?.classList.remove("is-open"); document.body.style.overflow = ""; }
  function movePhoto(step) { activePhoto = (activePhoto + step + gallery.length) % gallery.length; updateLightbox(); }
  function updateLightbox() { const image=document.getElementById("lightbox-image"),counter=document.getElementById("lightbox-counter"); if(image) image.src=gallery[activePhoto]; if(counter) counter.textContent=`${activePhoto+1} / ${gallery.length}`; }
  function handleKeyboard(event) { if (!document.getElementById("deal-lightbox")?.classList.contains("is-open")) return; if(event.key==="Escape") closePhoto(); if(event.key==="ArrowRight") movePhoto(1); if(event.key==="ArrowLeft") movePhoto(-1); }
  async function shareDeal() { try { if(navigator.share) await navigator.share({title:deal.title,text:"Bekijk deze deal bij SeasonDeals",url:location.href}); else { await navigator.clipboard.writeText(location.href); showToast("De link naar deze deal is gekopieerd."); } } catch(error) { if(error?.name!=="AbortError") showToast("Kopieer de link uit je adresbalk om deze deal te delen."); } }

  function resolveDeals(data) { return [data,data?.items,data?.deals,data?.records,data?.data,data?.data?.items,data?.result,data?.result?.items].find(Array.isArray)||[]; }
  function isPublicDeal(item) { const status=String(item?.status||"").toLowerCase(); return (status==="active"||item?.is_active===true)&&(item?.deleted_at===0||item?.deleted_at===null||item?.deleted_at===undefined); }
  function getImages(item) { const values=item.source === "provider_sync" ? (Array.isArray(item.external_image_urls)?item.external_image_urls:[]) : [...(Array.isArray(item.images)?item.images:[]),item.image,item.cover_image,item.image_url]; return [...new Set(values.map((value)=>typeof value==="string"?value:value?.url).filter(Boolean))]; }
  function getAmenities(item) {
    if (item.source === "provider_sync") return item.content_verified === true && Array.isArray(item.included_items) ? item.included_items.map(row => [true,row.icon,row.label,row.detail]) : [];
    return [[item.includes_breakfast === true,"☕","Ontbijt inbegrepen","Bij deze aanbieding"],[item.includes_wifi === true,"⌁","Wifi inbegrepen","Bij deze aanbieding"],[item.includes_parking === true,"P","Parkeren inbegrepen","Bij deze aanbieding"],[item.includes_late_checkout === true,"◷","Late check-out","Volgens de dealvoorwaarden"],[item.includes_welcome_drink === true,"◇","Welkomstdrankje","Bij deze aanbieding"]].filter(([active])=>active);
  }
  function renderAmenity([,icon,title,subtitle]) { return `<div class="amenity"><span class="amenity-icon">${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(dealAmenityDetail(title,subtitle))}</small></div></div>`; }
  function getRemaining(item) { if (availabilityPreview || item.source === "provider_sync") return null; const direct=number(item.remaining_inventory??item.available_quantity??item.inventory); return direct===null?null:Math.max(0,direct); }
  function getCategory(item) { const raw=[item.category_slug,item.category?.slug,item.category?.name,item.category,item.deal_type,item.package_type,item.type].filter(v=>typeof v==="string").join(" ").toLowerCase(); if(/wellness|spa|sauna/.test(raw))return"wellness";if(/massage|beauty|behandeling/.test(raw))return"massage";if(/ticket|event|concert|festival/.test(raw))return"tickets";if(/attract|uitje|park|museum|activiteit/.test(raw))return"attraction";return"hotel"; }
  function formatCategory(value){return({hotel:"Hotel",wellness:"Wellness",massage:"Massage",tickets:"Tickets",attraction:"Attractie"})[value]||"Deal";}
  function toDate(value){if(!value)return null;const raw=Number(value);const date=Number.isFinite(raw)?new Date(raw<1e11?raw*1000:raw):new Date(value);return Number.isNaN(date.getTime())?null:date;}
  function inputDate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}
  function formatDate(date){return new Intl.DateTimeFormat(CONFIG.locale,{day:"numeric",month:"long",year:"numeric"}).format(date);}
  function formatCurrency(value){return new Intl.NumberFormat(CONFIG.locale,{style:"currency",currency:CONFIG.currency,maximumFractionDigits:2}).format(value||0);}
  function formatNumber(value){return new Intl.NumberFormat(CONFIG.locale,{maximumFractionDigits:0}).format(value||0);}
  function formatDecimal(value){return new Intl.NumberFormat(CONFIG.locale,{minimumFractionDigits:1,maximumFractionDigits:1}).format(value||0);}
  function number(value){const result=typeof value==="string"?Number(value.replace(",",".")):value;return Number.isFinite(result)?result:null;}
  function positiveNumber(...values){for(const value of values){const result=number(value);if(result!==null&&result>0)return result;}return 0;}
  function text(value,fallback){return value===null||value===undefined||String(value).trim()===""?fallback:String(value);}
  function formatText(value){return escapeHtml(value).replace(/\n/g,"<br>");}
  function escapeHtml(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
  function escapeAttribute(value){return escapeHtml(value).replace(/`/g,"&#096;");}
  function showBookingMessage(value,type){const el=document.getElementById("booking-message");if(!el)return;el.textContent=value;el.className=`booking-message is-visible is-${type}`;}
  function showToast(value){const toast=document.getElementById("preview-toast");if(!toast)return;toast.textContent=value;toast.classList.add("is-visible");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove("is-visible"),3500);}
  function showError(title,message){container.innerHTML=`<section class="detail-error"><span>!</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button button-primary" href="${escapeAttribute(CONFIG.homePage)}#deals">Terug naar alle deals <span>→</span></a></section>`;}
})();
