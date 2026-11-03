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

  const CONFIG = Object.assign({
    dealsEndpoint: "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-public/deals",
    checkoutEndpoint: "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-public/create-checkout-session",
    supplierCheckoutEndpoint: "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-public/supplier/production/guest-checkout",
    homePage: "index.html",
    locale: "nl-NL",
    currency: "EUR"
  }, window.SEASONDEALS_CONFIG || {});
  const container = document.getElementById("deal-detail");
  const cmsDealId = container?.dataset.sdDealId;
  const dealId = cmsDealId || new URLSearchParams(window.location.search).get("id");
  const mottoDecember = Number(dealId) === 36;
  const promoArrival = '2026-12-04', promoDeparture = '2026-12-05';
  function matchesMottoPromotion(offer) {
    return offer?.room === 'Compact King Room' && offer.board === 'Zonder maaltijden' &&
      offer.price === 111.48 && offer.local_fees?.length === 1 &&
      offer.local_fees[0].currency === 'EUR' && offer.local_fees[0].pay_at_property === true &&
      offer.local_fees[0].amount === 5.19 &&
      offer.cancellation?.startsWith('Bij annulering vóór 2026-12-03 10:00:00 (GMT) krijg je het volledige betaalde bedrag terug (€ 111,48).');
  }
  let mottoSelection = null;
  function validMottoOffer(o) {
    return o && [o.room,o.board,o.cancellation].every(v=>typeof v==='string' && v.trim()) &&
      Number.isFinite(o.price) && o.price>0 && Array.isArray(o.local_fees) &&
      o.local_fees.every(f=>f && typeof f.description==='string' && f.currency==='EUR' &&
        f.pay_at_property===true && Number.isFinite(f.amount) && f.amount>=0);
  }
  function mottoDifferences(before,after) {
    const labels={room:'Kamer',board:'Verzorging',price:'Online te betalen',local_fees:'Ter plaatse te betalen',cancellation:'Annuleringsvoorwaarden'};
    const comparable=(key,v)=>key==='local_fees'?JSON.stringify(v.map(f=>[f.description,f.amount,f.currency]).sort()):String(v).trim();
    return Object.keys(labels).filter(k=>comparable(k,before[k])!==comparable(k,after[k])).map(k=>({field:k,label:labels[k],before:before[k],after:after[k]}));
  }
  let deal = null;
  let gallery = [];
  let activePhoto = 0;
  let checkoutBusy = false;
  let dealLoading = false;
  let dealRetry;
  let renderedDeal = null;
  let stayCapability = null;
  document.addEventListener('visibilitychange',()=>{
    if (!document.hidden && deal?.price_is_current === false) loadDeal();
  });

  if (!dealId) return showError("Geen deal geselecteerd", "Open een deal via de SeasonDeals-homepage om alle informatie te bekijken.");
  loadDeal();

  async function loadDeal() {
    if (dealLoading) return;
    if (checkoutBusy) { clearTimeout(dealRetry); dealRetry=setTimeout(loadDeal,15000); return; }
    clearTimeout(dealRetry);
    if (document.hidden) return;
    dealLoading = true;
    const previousDeal = deal;
    let pendingDeal=previousDeal;
    try {
      const response = await fetch(cmsDealId ? `${CONFIG.dealsEndpoint}/${encodeURIComponent(dealId)}` : CONFIG.dealsEndpoint, { method: "GET", mode: "cors", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
      const data = response.ok ? await response.json() : null;
      pendingDeal = cmsDealId ? (data?.deal || data) : resolveDeals(data).find((item) => String(item?.id) === String(dealId));
      if (String(pendingDeal?.id) !== String(dealId)) pendingDeal = null;
      if (!pendingDeal || pendingDeal.source === 'provider_sync') {
      // Approved flexible stays remain accessible even when the old fixed offer expires.
      // The capability endpoint independently checks approval and exact supplier identity.
      try {
        const capResponse=await fetch(CONFIG.dealsEndpoint.replace(/\/deals$/, '/supplier/production/stay-options'),{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({deal_id:Number(dealId),stay:null}),signal:AbortSignal.timeout(15000)});
        if(capResponse.ok){const p=await capResponse.json();stayCapability=p;if(validStayPolicy(p,Number(dealId))&&p.deal?.id===Number(dealId)&&p.deal.source==='provider_sync'&&(p.deal.booking_enabled===false||p.mode==='free-calendar'&&p.can_book===true)){pendingDeal={...(pendingDeal?.content_verified===true?pendingDeal:{}),...p.deal};if(checkoutBusy)return;deal=pendingDeal;gallery=getImages(pendingDeal);renderFlexibleDeal(p);bindDealEvents();await initStayChoice(p);return;}}
      }catch{}
      }
      if (mottoDecember) return showError('Aanbod wordt gecontroleerd', 'Het verblijf van 4 tot 5 december kan nu niet worden bevestigd.');
      if (!response.ok) throw new Error(`De dealservice gaf status ${response.status}.`);
      if (!pendingDeal || !isPublicDeal(pendingDeal)) {
        // Hidden supplier offers are absent from /deals. Resolve their public status
        // separately so old links retain the reason; concepts remain protected by 404.
        const statusResponse = await fetch(CONFIG.dealsEndpoint.replace(/\/deals$/, '/supplier/production/availability-status'), {method:'POST',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({deal_id:Number(dealId)})});
        if (statusResponse.ok) {
          const availability = await statusResponse.json();
          return showError(availability.status === 'expired' ? 'Deze deal is verlopen' : availability.status === 'unavailable' ? 'Deze deal is niet beschikbaar' : 'Beschikbaarheid niet bevestigd', availability.message || 'Probeer het later opnieuw.');
        }
        return showError("Deze deal is niet beschikbaar", "De aanbieding is mogelijk afgelopen, uitverkocht of tijdelijk offline.");
      }
      if(pendingDeal.source==='provider_sync') {
        let availability={status:'unknown',available:false};
        try {
          const statusResponse=await fetch(CONFIG.dealsEndpoint.replace(/\/deals$/, '/supplier/production/availability-status'),{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({deal_id:Number(dealId)}),signal:AbortSignal.timeout(25000)});
          if(statusResponse.status===404 || statusResponse.status===403)return showError('Deze deal is niet beschikbaar','De aanbieding is niet meer gepubliceerd.');
          if(statusResponse.ok)availability=await statusResponse.json();
        }catch{}
        if(['expired','unavailable','mapping_required'].includes(availability.status))return showError(availability.status==='expired'?'Deze deal is verlopen':'Deze deal is niet beschikbaar',availability.message||'Bekijk onze andere aanbiedingen.');
        if(availability.available===true) {
          // The refresh may have changed the price and terms. Reload the public snapshot.
          try {
            const fresh=await fetch(CONFIG.dealsEndpoint,{cache:'no-store'});
            const updated=fresh.ok?resolveDeals(await fresh.json()).find(d=>String(d.id)===String(dealId)):null;
            if(!updated || !isPublicDeal(updated))return showError('Deze deal is niet beschikbaar','Bekijk onze andere aanbiedingen.');
            pendingDeal=updated;
            if(pendingDeal.price_is_current===false)availability={status:'unknown',available:false};
          }catch{availability={status:'unknown',available:false};}
        }
        pendingDeal.availability_status=availability.status;
        pendingDeal.price_is_current=availability.available===true;
        if(!pendingDeal.price_is_current) {
          pendingDeal.booking_enabled=false;
          dealRetry=setTimeout(loadDeal,15000);
        }
      }
      if (checkoutBusy) { pendingDeal=previousDeal; dealRetry=setTimeout(loadDeal,15000); return; }
      const snapshot = JSON.stringify(pendingDeal, (key,value) => /^(availability_checked_at|availability_valid_until|updated_at|last_synced_at)$/.test(key) ? undefined : value);
      if (snapshot !== renderedDeal) {
        deal = pendingDeal;
        gallery = getImages(pendingDeal);
        renderDeal();
        bindDealEvents();
        initStayChoice(stayCapability);
        renderedDeal = snapshot;
      }
    } catch (error) {
      console.error("SeasonDeals detail failed:", error);
      pendingDeal = previousDeal;
      if (renderedDeal && pendingDeal?.source === 'provider_sync' && !checkoutBusy && pendingDeal.price_is_current === true) {
        pendingDeal={...deal,price_is_current:false,booking_enabled:false};
        deal=pendingDeal;renderDeal();bindDealEvents();renderedDeal=null;
      }
      if (!previousDeal) showError("De deal kon niet worden geladen", "Controleer je internetverbinding. We proberen het automatisch opnieuw.");
      dealRetry=setTimeout(loadDeal,15000);
    } finally { dealLoading=false; }
  }

  function renderDeal(flexiblePolicy = null) {
    const checking = deal.source === "provider_sync" && !flexiblePolicy && deal.price_is_current !== true;
    const title = text(deal.title || deal.name, "SeasonDeals deal");
    const hotel = text(deal.hotel_name || deal.hotel?.name, "SeasonDeals");
    const city = displayCity(deal.city || deal.hotel?.city);
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
    // Preserve the server-generated SEO title on canonical CMS pages.
    if (!cmsDealId) document.title = `${title} · SeasonDeals`;

    container.innerHTML = `<div class="detail-container">
      <nav class="detail-breadcrumbs" aria-label="Broodkruimel"><a href="${escapeAttribute(CONFIG.homePage)}">Home</a><span>›</span><a href="${escapeAttribute(CONFIG.homePage)}#deals">Deals</a><span>›</span><span>${escapeHtml(title)}</span></nav>
      ${renderGallery(title)}
      <header class="detail-heading"><div><span class="detail-kicker">${escapeHtml(formatCategory(getCategory(deal)))}${location ? ` · ${escapeHtml(location)}` : ""}</span><h1>${escapeHtml(title)}</h1><div class="detail-subline"><strong>${escapeHtml(hotel)}</strong>${rating > 0 ? `<span class="detail-rating">★ ${escapeHtml(formatDecimal(rating))}${reviews > 0 ? ` · ${escapeHtml(formatNumber(reviews))} beoordelingen` : ""}</span>` : ""}${deal.star_rating > 0 ? `<span>${"★".repeat(Math.min(5, Math.round(deal.star_rating)))} hotel</span>` : ""}${flexiblePolicy ? (mottoDecember ? '<span class="detail-stock">4–5 december</span>' : '<span class="detail-stock">Kies je datums</span>') : deal.source === "provider_sync" ? `<span class="detail-stock">${checking ? "Beschikbaarheid nog niet bevestigd" : "● Beschikbaar"}</span>` : remaining !== null ? `<span class="detail-stock${remaining <= 5 ? " is-low" : ""}">● ${remaining === 0 ? "Uitverkocht" : `Actuele voorraad: ${formatNumber(remaining)}`}</span>` : ""}</div></div><div class="detail-heading-actions"><button class="detail-icon-button" id="share-deal" type="button" aria-label="Deal delen">↗</button><button class="detail-icon-button" id="save-deal" type="button" aria-label="Deal opslaan">♡</button></div></header>
      <div class="detail-layout"><article class="detail-content">
        <section><span class="detail-section-label">Over deze deal</span><h2>Een bijzonder moment voor een mooie prijs.</h2><p>${escapeHtml(mainDescription)}</p>${longDescription && longDescription !== mainDescription ? `<p class="detail-description-long">${formatText(longDescription)}</p>` : ""}</section>
        ${amenities.length ? `<section><span class="detail-section-label">Dit is inbegrepen</span><h2>Jouw verblijf</h2><div class="amenities-grid">${amenities.map(renderAmenity).join("")}</div></section>` : ""}
        ${Array.isArray(deal.facility_items) && deal.facility_items.length ? `<section><h2>Voorzieningen en voorwaarden</h2><div class="amenities-grid">${deal.facility_items.map(row => renderAmenity([true,row.icon,row.label,row.detail])).join("")}</div></section>` : ""}
        <section><span class="detail-section-label">Geldigheid</span><h2>Plan jouw moment.</h2><div class="period-card"><div><span>Te gebruiken vanaf</span><strong>${travelStart ? formatDate(travelStart) : "Zie dealvoorwaarden"}</strong></div><div><span>${flexiblePolicy ? "Laatste vertrek" : "Te gebruiken tot en met"}</span><strong>${travelEnd ? formatDate(travelEnd) : flexiblePolicy?.mode==='free-calendar'?"Zelf te kiezen":"Zie dealvoorwaarden"}</strong></div></div></section>
        <section><span class="detail-section-label">Annuleren en wijzigen</span><h2>Goed om vooraf te weten.</h2><div class="policy-card">${formatText(policy)}</div></section>
      </article>
      <aside class="booking-card" aria-label="${flexiblePolicy ? "Verblijf kiezen" : "Deal boeken"}"><div class="booking-price" ${flexiblePolicy ? 'hidden style="display:none"' : ""}><span>${!checking && original > price ? `<del>${escapeHtml(formatCurrency(original))}</del>` : ""}<strong>${checking ? "Laatst bekend: " : ""}${escapeHtml(formatCurrency(price))}</strong><small>${deal.max_guests > 1 ? `voor maximaal ${formatNumber(deal.max_guests)} personen` : "per boeking"}</small></span>${!checking && saving > 0 ? `<span class="booking-save">Bespaar ${escapeHtml(formatCurrency(saving))}</span>` : ""}</div>
        ${checking ? '<p class="notice" role="status">We werken de prijs en beschikbaarheid automatisch bij. Je ziet de laatst bekende dealgegevens. Boeken kan zodra het actuele aanbod is bevestigd.</p>' : ''}
        ${!checking && deal.source === "provider_sync" && deal.booking_enabled !== true ? '<p class="notice">Deze aanbieding is goedgekeurd. Boeken is binnenkort mogelijk.</p>' : ''}${checking ? '' : `<form id="booking-form" class="booking-form" ${flexiblePolicy ? 'hidden style="display:none"' : ""} novalidate><div class="booking-dates"><label>Check-in<input id="sd-checkin" name="checkin" type="date" required></label><label>Check-out<input id="sd-checkout" name="checkout" type="date" required></label></div><label>Aantal gasten<select id="sd-guests" name="guests">${Array.from({length:maxGuests},(_,i)=>`<option value="${i+1}">${i+1} ${i ? "gasten" : "gast"}</option>`).join("")}</select></label><div id="booking-message" class="booking-message" role="alert"></div><button id="sd-check-availability" class="button button-primary booking-submit" type="submit" ${deal.source === "provider_sync" && deal.booking_enabled !== true ? "disabled" : ""}>Bekijk beschikbaarheid & boek <span>→</span></button></form>`}
        <div class="booking-assurances"><div><span>♢</span><p><strong>Veilig betalen via Stripe</strong><br>Je betaling wordt beveiligd verwerkt.</p></div><div><span>▱</span><p><strong>Direct je voucher</strong><br>Na betaling ontvang je de bevestiging per e-mail.</p></div><div><span>◇</span><p><strong>Transparante voorwaarden</strong><br>Geen onverwachte verplichte kosten achteraf.</p></div></div>${remaining !== null ? `<p class="availability${remaining <= 5 ? " is-low" : ""}"><span>●</span> Actuele voorraad: <strong>${formatNumber(remaining)} ${remaining === 1 ? "deal" : "deals"}</strong></p>` : ""}
      </aside></div>
    </div>${renderLightbox(title)}`;
    setDateLimits(travelStart, travelEnd);
  }

  function renderFlexibleDeal(policy) {
    // Reuse the original detail layout and verified public hotel information.
    // Replace only fixed-stay facts; never present the old quote as a flexible price.
    const extras = Array.isArray(deal.included_items) ? deal.included_items.filter(row => !['☾','▱','♧'].includes(row.icon)) : [];
    deal = {...deal,
      title: `Kies je verblijf bij ${text(deal.hotel_name,'het hotel')}`,
      short_description: policy.mode==='free-calendar'?`Kies zelf je aankomst en vertrek. ${deal.room} voor ${policy.guests} personen.`:`${policy.min_nights}–${policy.max_nights} nachten in ${deal.room} voor ${policy.guests} personen.`,
      long_description: `Verblijf bij ${text(deal.hotel_name,'het hotel')} in ${deal.room}. ${deal.board}. Kies zelf jouw aankomst en vertrek. De actuele totaalprijs en annuleringsvoorwaarden worden voor jouw datums gecontroleerd.`,
      price: null, deal_price: null, original_price: null,
      travel_period_start: policy.start, travel_period_end: policy.end,
      minimum_nights: policy.min_nights, max_guests: policy.guests,
      cancellation_policy: 'De annuleringsvoorwaarden en totaalprijs worden getoond voor jouw gekozen datums.',
      content_verified: true,
      included_items: [
        {icon:'☾',label:policy.mode==='free-calendar'?'Vrije datumkeuze':`${policy.min_nights}–${policy.max_nights} nachten naar keuze`,detail:'Kies zelf aankomst en vertrek'},
        {icon:'▱',label:deal.room,detail:deal.board},
        {icon:'♧',label:`Voor ${policy.guests} personen`,detail:'Bezetting van de aangeboden kamer'},
        ...extras
      ]
    };
    if (mottoDecember) {
      Object.assign(deal, {title:'Vrijdagnacht bij Motto by Hilton Rotterdam City Centre',
        room:'Compact King Room', board:'Zonder maaltijden',
        short_description:'Vrijdag 4 tot zaterdag 5 december 2026. Eén nacht voor twee volwassenen.',
        long_description:'',
        travel_period_start:promoArrival,travel_period_end:promoDeparture,
        cancellation_policy:'De voorwaarden van het beschikbare verblijf staan bij de boekknop.',
        included_items:[{icon:'☾',label:'1 overnachting',detail:'4 tot 5 december 2026'},{icon:'▱',label:'Kamer voor twee',detail:'Zie het actuele aanbod bij de boekknop'},{icon:'♧',label:'2 volwassenen',detail:'Eén kamer voor twee'},...extras]});
    }
    renderDeal(policy);
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
    document.getElementById("booking-form")?.addEventListener("submit", startCheckout);
    document.getElementById("share-deal")?.addEventListener("click", shareDeal);
    document.getElementById("save-deal")?.addEventListener("click", () => showToast("Deze favorietenfunctie koppelen we later aan je account."));
  }

  async function startCheckout(event) {
    event.preventDefault();
    if (deal.source === "provider_sync" && deal.booking_enabled !== true) return showBookingMessage("Boeken is binnenkort mogelijk.", "error");
    if (checkoutBusy) return;
    const checkin = document.getElementById("sd-checkin").value;
    const checkout = document.getElementById("sd-checkout").value;
    const guests = Number(document.getElementById("sd-guests").value || 1);
    if (!checkin || !checkout) return showBookingMessage("Kies eerst een geldige check-in- en check-outdatum.", "error");
    if (new Date(`${checkout}T00:00:00`) <= new Date(`${checkin}T00:00:00`)) return showBookingMessage("De check-outdatum moet na de check-indatum liggen.", "error");
    const button = document.getElementById("sd-check-availability");
    checkoutBusy = true;
    setFlexibleBusy(true);
    button.disabled = true; button.innerHTML = "Je wordt doorgestuurd…";
    showBookingMessage("Je wordt doorgestuurd naar de beveiligde betaalpagina…", "info");
    let failureCode = "CHECKOUT_NETWORK", failureStatus = 0;
    let journey=createBookingJourney(), journeyRequest=null;
    recordBookingJourney(journey,'started',null);
    let acceptedStay=mottoSelection;
    let acceptedCheckoutPrice=Number(deal.deal_price||deal.price);
    try {
      const supplier = deal.source === "provider_sync";
      // The backend verifies provider=nuitee, production approval, occupancy and price.
      // Never send a supplier deal through the ordinary partner checkout.
      const request = supplier ? supplierRequest(deal.id, checkin, checkout, guests) : { deal_id: deal.id, checkin, checkout, guests };
      journeyRequest=request;
      recordBookingJourney(journey,'started',request);
      let response = supplier ? await recoverSupplierCheckout(request) : await fetch(CONFIG.checkoutEndpoint, { method: "POST", mode: "cors", credentials: "omit", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(request) });
      failureStatus = response.status;
      failureCode = response.ok ? "CHECKOUT_RESPONSE" : "CHECKOUT_HTTP";
      let responseText = await response.text();
      let data = {}; try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = { message: responseText }; }
      if (supplier && response.ok && data?.status === "hotel_notes_review" && data.checkout_created === false) {
        failureCode = null;
        if (typeof data.hotel_notes !== 'string' || data.hotel_notes.length > 70000 || typeof data.hotel_notes_ack !== 'string' || data.hotel_notes_ack.length > 150000) throw checkoutCustomerError('De aanvullende hotelinformatie kon niet worden geladen.');
        const offer=data.offer_review;
        if (offer && (!offer.terms || offer.terms.deal_id!==Number(deal.id) || offer.terms.currency!=='EUR' || !Number.isFinite(offer.terms.price) || offer.terms.price<=0 || !Array.isArray(offer.changes) || !Array.isArray(offer.terms.local_fees))) throw checkoutCustomerError('De actuele voorwaarden konden niet worden gecontroleerd.');
        if (mottoDecember && offer && (!validMottoOffer(offer.terms) || !validMottoOffer(acceptedStay))) throw checkoutCustomerError('Het hotel kon de volledige voorwaarden nog niet bevestigen.');
        const review = mottoDecember && offer ? {...offer,changes:[...mottoDifferences(acceptedStay,offer.terms),...offer.changes.filter(c=>['extras','hotel_notes'].includes(c.field))]} : offer;
        const approved = await reviewHotelNotes(data.hotel_notes,review,mottoDecember?acceptedStay:null);
        if(approved && mottoDecember && offer) acceptedStay=offer.terms;
        if (!approved) {
          recordBookingJourney(journey,'cancelled',request);
          showBookingMessage('Je hebt nog niet geboekt of betaald.', 'info');
          checkoutBusy=false;setFlexibleBusy(false);button.disabled=false;button.innerHTML='Bekijk beschikbaarheid & boek <span>→</span>';
          return;
        }
        if(offer) acceptedCheckoutPrice=offer.terms.price;
        failureCode = 'CHECKOUT_NETWORK';
        response = await recoverSupplierCheckout(request, data.hotel_notes_ack);
        failureStatus=response.status;failureCode=response.ok?'CHECKOUT_RESPONSE':'CHECKOUT_HTTP';
        responseText=await response.text();
        try {data=responseText?JSON.parse(responseText):{};} catch {data={};}
        if (response.ok && data?.status === 'hotel_notes_review' && data.checkout_created === false) {
          failureCode=null;
          throw checkoutCustomerError('De hotelinformatie is opnieuw gewijzigd. Bekijk de actuele informatie door opnieuw op boeken te klikken.');
        }
      }
      if (supplier && !response.ok && response.status === 403 && data?.message === "PRODUCTION_NOT_RELEASED") {
        failureCode = null;
        // This precise entry-gate rejection happens before any order or Stripe write.
        try { sessionStorage.removeItem(supplierStorageKey(deal.id)); } catch (_) {}
        throw checkoutCustomerError("Deze hoteldeal is nog niet beschikbaar om te boeken.");
      }
      if (supplier && response.ok && data?.status === "offer_changed" && data.checkout_created === false) {
        failureCode = null;
        try { sessionStorage.removeItem(supplierStorageKey(deal.id)); } catch (_) {}
        throw checkoutCustomerError("De prijs of voorwaarden zijn gewijzigd. Laad de deal opnieuw en bekijk het actuele aanbod voordat je boekt.");
      }
      if (!response.ok) throw checkoutCustomerError("Boeken lukt op dit moment niet. Probeer het later opnieuw of neem contact op met SeasonDeals.");
      const checkoutUrl = data?.checkout_url || data?.url || data?.session_url || data?.session?.url || data?.api1?.response?.url || data?.api1?.response?.result?.url;
      failureCode = "CHECKOUT_LINK";
      if (supplier && !validSupplierCheckout(data, checkoutUrl)) throw checkoutCustomerError("De betaalpagina kon niet veilig worden bevestigd. Probeer dezelfde boeking opnieuw of neem contact op met SeasonDeals.");
      if (mottoDecember) {
        const finalStay=data.customer_stay;
        if(!validMottoOffer(acceptedStay)||!validMottoOffer(finalStay)||finalStay.currency!=='EUR'||finalStay.price!==data.selling_price)
          throw checkoutCustomerError('De definitieve hotelvoorwaarden zijn nog niet bevestigd. Controleer het verblijf opnieuw.');
        const changes=mottoDifferences(acceptedStay,finalStay);
        if(changes.length && !await reviewHotelNotes('',{terms:finalStay,changes},acceptedStay))
          throw checkoutCustomerError('Je hebt de wijziging niet geaccepteerd. Er is niets betaald.', 'cancelled');
        acceptedCheckoutPrice=finalStay.price;
      }
      if (supplier && data.selling_price !== acceptedCheckoutPrice) {
        failureCode = "CHECKOUT_PRICE";
        throw checkoutCustomerError("De betaalpagina kon niet veilig worden bevestigd. Probeer dezelfde boeking opnieuw of neem contact op met SeasonDeals.");
      }
      if (!checkoutUrl) throw checkoutCustomerError("De betaalpagina kon niet worden geopend. Probeer het opnieuw.");
      recordBookingJourney(journey,'redirect',request);
      window.location.href = checkoutUrl;
    } catch (error) {
      if (error.quoteUnconfirmed) { failureCode = "CHECKOUT_QUOTE_UNCONFIRMED"; failureStatus = 400; }
      recordBookingJourney(journey,error.bookingStage||(failureCode?'failed':'changed'),journeyRequest,failureCode,failureStatus);
      reportCheckoutError(failureCode, failureStatus);
      console.error("SeasonDeals checkout failed:", failureCode || "offer changed");
      showBookingMessage(error.customerMessage || "Boeken lukt op dit moment niet. Probeer het later opnieuw of neem contact op met SeasonDeals.", "error");
      checkoutBusy = false;
      setFlexibleBusy(false);
      button.disabled = false; button.innerHTML = mottoDecember ? 'Verder naar betalen <span>→</span>' : 'Bekijk beschikbaarheid & boek <span>→</span>';
      if (error.quoteUnconfirmed) button.form?.dispatchEvent(new Event('sd-quote-unconfirmed'));
    }
  }

  function reviewHotelNotes(raw,offer,selectedStay=null) {
    return new Promise(resolve => {
      const plain=value=>{const decoder=document.createElement('textarea');decoder.innerHTML=String(value||'').replace(/<(?:br\s*\/?|\/p|\/div|\/li)>/gi,'\n').replace(/<[^>]*>/g,'');return decoder.value.trim();};
      const normalize=value=>plain(value).replace(/\s+/g,' ').trim();
      // Compare against the page the customer actually read, not an older supplier label.
      const displayed=selectedStay||{price:Number(deal.deal_price||deal.price),room:deal.room,board:deal.board,cancellation:deal.cancellation_policy};
      if(offer){
        const pageText=normalize(container.querySelector('.detail-content')?.textContent);
        const changes=offer.changes.map(change=>{
          const before=displayed[change.field]??change.before;
          if(change.field==='hotel_notes'){
            const oldLines=plain(change.before).split('\n').map(normalize).filter(Boolean);
            const newLines=plain(change.after).split('\n').map(normalize).filter(Boolean);
            // Optional, unselected services do not change this fixed room booking.
            // Match complete known clauses only; unknown obligations remain visible.
            const optionalInfo=value=>{
              let s=value;
              if(offer.terms.board_type==='RO')s=s.replace(/-?\s*Breakfast can be booked additionally and is offered for €\s*[\d.,]+ per person under the following conditions:\s*Up to [\d.]+ years: free of charge\s*Up to [\d.]+ years: [\d.]+%\s*From [\d.]+ years onwards: full price/gi,'');
              if((deal.facility_items||[]).some(f=>/park/i.test(f.label)&&/tegen betaling/i.test(f.detail)))s=s.replace(/-?\s*Parking spaces are available for €\s*[\d.,]+ per day\.\s*(?:=>\s*Parking garage is available\.)?/gi,'');
              // The fixed supplier checkout books adults only; no pets/extra beds are selected.
              if(deal.source==='provider_sync')s=s.replace(/-?\s*Pets are allowed\.\s*An extra charge of €\s*[\d.,]+ per pet\/day is required\./gi,'').replace(/-?\s*Children up to [\d.]+ years: free of charge in (?:baby cot or )?parents[’'] bed/gi,'').replace(/-?\s*Extra bed \(except baby cot\): €\s*[\d.,]+/gi,'').replace(/-?\s*From [\d.]+ years onwards: extra bed required \(if not included in the room category\)/gi,'');
              s=s.replace(/Please note that the hotel accepts bookings exclusively from demand partners located in the following countries: [A-Za-z ,]+\.\s*Thank you for your understanding\./g,'');
              // A full-charge early departure reminder repeats the existing policy only
              // when a 100% cancellation penalty already starts on/before check-in.
              const full=String(displayed.cancellation||'').match(/Vanaf (\d{4}-\d{2}-\d{2})[^.]*?€ 0,00 terugbetaling; € ([\d.,]+) annuleringskosten/);
              if(full&&full[1]<=(document.getElementById('sd-checkin')?.value||'')&&Number(full[2].replace(/\./g,'').replace(',','.'))===displayed.price)s=s.replace(/Early check out will attract full cancellation charge unless otherwise specified/gi,'');
              return s.trim();
            };
            const added=optionalInfo(newLines.filter(line=>!oldLines.includes(line)&&!pageText.includes(line)).join('\n'));
            const removed=oldLines.filter(line=>!newLines.includes(line));
            return {...change,before:removed.join('\n'),after:added};
          }
          return {...change,before};
        }).filter(change=>typeof change.before==='number'?change.before!==change.after:normalize(Array.isArray(change.before)?JSON.stringify(change.before):change.before)!==normalize(Array.isArray(change.after)?JSON.stringify(change.after):change.after));
        offer={...offer,changes};
        if(!changes.length){resolve(true);return;}
      }
      const dialog=document.createElement('dialog');
      dialog.setAttribute('aria-labelledby','sd-hotel-notes-title');
      dialog.style.cssText='width:min(380px,calc(100vw - 32px));max-height:60vh;padding:18px;border:1px solid #ddd7ce;border-radius:14px;color:#042821;background:#fffdf8;box-sizing:border-box';
      const title=document.createElement('h2');title.id='sd-hotel-notes-title';title.textContent='Dit is gewijzigd';title.style.cssText='font-size:22px;line-height:1.25;margin:0 0 14px';
      const notes=document.createElement('div');notes.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.5;max-height:30vh;overflow:auto';
      const dutch=value=>plain(value)
        .replace(/Early check out will attract full cancellation charge unless otherwise specified/gi,'Bij eerder vertrek worden de volledige annuleringskosten berekend, tenzij anders vermeld.')
        .replace(/Breakfast can be booked additionally and is offered for/gi,'Ontbijt is optioneel bij te boeken voor')
        .replace(/per person under the following conditions:/gi,'per persoon, onder deze voorwaarden:')
        .replace(/Parking spaces are available for/gi,'Parkeren is mogelijk voor')
        .replace(/Parking garage is available/gi,'Er is een parkeergarage')
        .replace(/Pets are not allowed/gi,'Huisdieren zijn niet toegestaan')
        .replace(/Pets are allowed/gi,'Huisdieren zijn toegestaan')
        .replace(/An extra charge of/gi,'Er geldt een toeslag van')
        .replace(/per pet\/day is required/gi,'per huisdier per dag')
        .replace(/Children up to/gi,'Kinderen tot en met')
        .replace(/Up to ([\d.]+) years:/gi,'Tot en met $1 jaar:')
        .replace(/From ([\d.]+) years onwards:/gi,'Vanaf $1 jaar:')
        .replace(/years: free of charge in baby cot or parents[’'] bed/gi,'jaar: gratis in een babybedje of in het bed van de ouders')
        .replace(/years: free of charge in parents[’'] bed/gi,'jaar: gratis in het bed van de ouders')
        .replace(/Extra bed \(except baby cot\)/gi,'Extra bed (behalve een babybedje)')
        .replace(/extra bed required \(if not included in the room category\)/gi,'een extra bed is verplicht als dit niet bij het kamertype is inbegrepen')
        .replace(/Mandatory resort fee/gi,'Verplichte resorttoeslag')
        .replace(/City tax|Tourist tax/gi,'Toeristenbelasting')
        .replace(/Security deposit/gi,'Borg')
        .replace(/Non-refundable/gi,'Niet restitueerbaar')
        .replace(/Free cancellation/gi,'Gratis annuleren')
        .replace(/subject to availability/gi,'afhankelijk van beschikbaarheid')
        .replace(/on request/gi,'op aanvraag')
        .replace(/free of charge/gi,'gratis')
        .replace(/full price/gi,'volledig tarief')
        .replace(/per person/gi,'per persoon').replace(/per stay/gi,'per verblijf')
        .replace(/per night/gi,'per nacht').replace(/per day/gi,'per dag');
      const paragraph=(label,value)=>{const row=document.createElement('p'),strong=document.createElement('strong');strong.textContent=label;row.append(strong,document.createTextNode(' '+dutch(value)));notes.append(row);};
      if(offer){
        const sentences=value=>plain(value).split(/\n+|(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ])/u).map(s=>s.trim()).filter(Boolean);
        for(const change of offer.changes){
          if(change.field==='price')paragraph(change.label+':',formatCurrency(change.before)+' → '+formatCurrency(change.after));
          else if(['room','board'].includes(change.field))paragraph(change.label+':',plain(change.before)+' → '+plain(change.after));
          else {
            const rows=value=>change.field==='local_fees'?(value||[]).map(f=>f.description+' — '+formatCurrency(f.amount)):change.field==='extras'?(value||[]).map(plain):sentences(value);
            const before=rows(change.before),after=rows(change.after);
            const removed=before.filter(v=>!after.includes(v)),added=after.filter(v=>!before.includes(v));
            if(removed.length)paragraph(change.label+' — vervalt:',removed.join('\n'));
            if(added.length)paragraph(change.label+(removed.length?' — nu:':':'),added.join('\n'));
          }
        }
      }else notes.textContent=dutch(raw);
      const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:16px';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Terug';cancel.className='button';
      const next=document.createElement('button');next.type='button';next.textContent='Akkoord, naar betalen';next.className='button button-primary';
      const finish=accepted=>{dialog.close();dialog.remove();resolve(accepted);};
      cancel.addEventListener('click',()=>finish(false));next.addEventListener('click',()=>finish(true));
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
      actions.append(cancel,next);dialog.append(title,notes,actions);document.body.append(dialog);dialog.showModal();cancel.focus();
    });
  }

    // Best-effort technical telemetry only: no guest details, URLs, tokens or raw errors.
  // Passive diagnostics only: a failure here must never interrupt booking.
  function createBookingJourney() {
    try {
      const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
      const q=new URLSearchParams(location.search);
      return {attempt_id:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),deal_id:Number(deal.id),is_test:q.get('sd_test')==='1',source:q.get('utm_source')||'',medium:q.get('utm_medium')||'',campaign:q.get('utm_campaign')||''};
    } catch (_) {return null;}
  }
  function recordBookingJourney(journey,stage,request,code,http_status) {
    if(!journey)return;
    try {
      fetch(new URL('booking-event',CONFIG.checkoutEndpoint).href,{method:'POST',mode:'cors',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({...journey,stage,request_key:request?.request_key||'',code:code||'',http_status:http_status||0})}).catch(()=>{});
    } catch (_) {}
  }

  function reportCheckoutError(code, httpStatus) {
    if (!code || !Number.isInteger(Number(deal?.id))) return;
    try {
      const endpoint = CONFIG.dealsEndpoint.replace(/\/deals$/, "/checkout-error");
      void fetch(endpoint, {method:"POST",mode:"cors",credentials:"omit",keepalive:true,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({deal_id:Number(deal.id),code,http_status:httpStatus||0}),
        signal:AbortSignal.timeout(3000)}).catch(()=>{});
    } catch (_) {}
  }

// A back/forward-cache restore preserves JS state, including the redirect lock.
  // Restore the controls without replacing the saved request key or creating an order.
  window.addEventListener?.("pageshow", event => {
    if (!event.persisted) return;
    const wasRedirecting = checkoutBusy;
    checkoutBusy = false;
    const button = document.getElementById("sd-check-availability");
    if (button) {
      button.disabled = deal?.source === "provider_sync" && deal.booking_enabled !== true;
      button.innerHTML = "Bekijk beschikbaarheid & boek <span>→</span>";
    }
    if (wasRedirecting) showBookingMessage("Je bent terug van de betaalpagina. Controleer je e-mail of de status van je boeking voordat je opnieuw betaalt.", "info");
  });

  // Read-only date selection. An explicit server policy enables it per supplier deal.
  // This flow never calls checkout and cannot open production booking gates.
  function setFlexibleBusy(busy) {
    if(stayCapability?.mode!=='free-calendar')return;
    for(const id of ['sd-checkin','sd-checkout','sd-flex-price-check','sd-nights','sd-week-start']){const element=document.getElementById(id);if(element)element.disabled=busy;}
    document.querySelectorAll('.sd-week-calendar button').forEach(b=>{if(busy){b.dataset.wasDisabled=String(b.disabled);b.disabled=true;}else if(b.dataset.wasDisabled){b.disabled=b.dataset.wasDisabled==='true';delete b.dataset.wasDisabled;}});
  }

  async function initFreeCalendar(policy) {
    if(!validStayPolicy(policy,Number(deal.id)))return;
    const form=document.getElementById('booking-form'),card=form?.closest('.booking-card');
    if(!form||!card)return;
    form.hidden=false;form.style.display='';card.classList.add('has-week-calendar');
    const arrival=document.getElementById('sd-checkin'),departure=document.getElementById('sd-checkout'),guests=document.getElementById('sd-guests'),book=document.getElementById('sd-check-availability');
    arrival.min=policy.start;departure.min=policy.start;arrival.removeAttribute('max');departure.removeAttribute('max');arrival.value='';departure.value='';
    guests.value=String(policy.guests);guests.disabled=true;guests.closest('label').hidden=true;guests.closest('label').style.display='none';
    const originalDates=form.querySelector('.booking-dates');originalDates.hidden=true;originalDates.style.display='none';
    const price=card.querySelector('.booking-price');price.hidden=true;price.style.display='none';
    book.disabled=true;book.hidden=true;book.style.display='none';
    const ui=document.createElement('section');ui.className='sd-week-calendar';
    ui.innerHTML=`<h2>Kies je verblijf</h2><p class="sd-week-room">${escapeHtml(deal.room)} · ${policy.guests} personen · ${escapeHtml(deal.board)}</p>
      <section class="sd-quick-stays" hidden aria-label="Snel een verblijf kiezen"><h3>Snel een verblijf kiezen</h3><p class="sd-quick-intro">Recent gecontroleerde opties</p><div class="sd-quick-list"></div><small>Bij selectie controleren we de actuele prijs en beschikbaarheid opnieuw. Eventuele lokale kosten staan bij de optie.</small></section>
      <h3 class="sd-other-dates" hidden>Liever andere datums?</h3><div class="sd-stay-dates"><label class="sd-arrival-label">Inchecken</label><label class="sd-departure-label">Uitchecken</label></div><p class="sd-date-help">Kies je aankomst- en vertrekdatum. Meerdere nachten? Kies een latere uitcheckdatum.</p>
      <label for="sd-nights">Aantal nachten</label><div class="sd-night-stepper"><button type="button" data-step="-1" aria-label="Een nacht minder">−</button><input id="sd-nights" type="number" min="1" step="1" value="1" inputmode="numeric"><button type="button" data-step="1" aria-label="Een nacht meer">+</button></div>
      <label class="sd-week-jump">Bekijk datums vanaf<input id="sd-week-start" type="date" min="${policy.start}" value="${policy.start}"></label>
      <p>Kies een aankomstdag</p><div class="sd-week-nav"><button type="button" data-week="-1" aria-label="Vorige week">‹</button><strong class="sd-week-label"></strong><button type="button" data-week="1" aria-label="Volgende week">›</button></div>
      <div class="sd-week-scroll"><div class="sd-week-days" role="group" aria-label="Aankomstdagen"></div></div>
      <div class="sd-week-legend"><span>✓ Beschikbaar</span><span>— Geen aanbod</span><span>… Nog te controleren</span></div>
      <small class="sd-week-basis"></small><p class="sd-week-status" role="status" aria-live="polite"></p><button class="sd-week-retry" type="button" hidden>Controleer resterende dagen</button>
      <div class="sd-week-selection" hidden></div><button type="button" id="sd-flex-price-check" class="button button-primary booking-submit" hidden>Controleer prijs en beschikbaarheid</button><div class="sd-week-result" role="status" aria-live="polite"></div>`;
    form.prepend(ui);
    ui.querySelector(".sd-arrival-label").append(arrival);ui.querySelector(".sd-departure-label").append(departure);
    const nightsInput=ui.querySelector('#sd-nights'),startInput=ui.querySelector('#sd-week-start'),days=ui.querySelector('.sd-week-days'),label=ui.querySelector('.sd-week-label'),status=ui.querySelector('.sd-week-status'),retry=ui.querySelector('.sd-week-retry'),selection=ui.querySelector('.sd-week-selection'),check=ui.querySelector('#sd-flex-price-check'),result=ui.querySelector('.sd-week-result');
    const endpoint=CONFIG.dealsEndpoint.replace(/\/deals$/,'/supplier/production/stay-options');
    const dateAdd=(day,n)=>{const d=new Date(Date.parse(day+'T00:00:00Z')+n*86400000);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'';};
    const dateLabel=day=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));
    const cash=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n).replace(/\s/g,'');
    let generation=0,quoteGeneration=0,nights=1,start=policy.start,selected='',chosen=null,loading=false,retryAt=0,debounce,expiry,retryTimer,retries=0;
    const cache=new Map(),failures=new Set(),pendingDays=new Set();
    const key=d=>[d,dateAdd(d,nights),policy.guests].join('|');
    for(const r of (Array.isArray(policy.calendar_cache)?policy.calendar_cache:[]).slice(-28)){
      if(validStayDay(r?.checkin)&&validStayDay(r?.checkout)&&r.guests===policy.guests&&r.can_book===false&&validStayResult(r,Number(deal.id),r.checkin,r.checkout,policy.guests))cache.set([r.checkin,r.checkout,r.guests].join('|'),r);
    }
    const entry=d=>{const r=cache.get(key(d));return r||null;};
    const quick=ui.querySelector('.sd-quick-stays'),quickList=ui.querySelector('.sd-quick-list');
    let quickSignature='',quickTimer;
    function quickOptions(){
      const now=Date.now();
      return Array.from(cache.values()).filter(r=>[33,36].includes(Number(deal.id))&&r.status==='available'&&r.checkin>=policy.start&&r.checkout>r.checkin&&r.guests===policy.guests&&Number.isFinite(r.options?.[0]?.price)&&r.options[0].price>0&&Array.isArray(r.options[0].local_fees)&&Number.isFinite(r.price_checked_at||r.checked_at)&&(r.price_checked_at||r.checked_at)<=now&&now-(r.price_checked_at||r.checked_at)<600000)
        .sort((a,b)=>a.checkin.localeCompare(b.checkin)||a.checkout.localeCompare(b.checkout)).slice(0,3);
    }
    function renderQuickStays(){
      clearTimeout(quickTimer);const options=quickOptions();
      quick.hidden=!options.length;ui.querySelector('.sd-other-dates').hidden=!options.length;
      const signature=JSON.stringify(options.map(r=>[r.checkin,r.checkout,r.options[0],selected===r.checkin&&departure.value===r.checkout,checkoutBusy]));
      if(signature!==quickSignature){quickSignature=signature;quickList.innerHTML=options.map(r=>{const o=r.options[0],count=Math.round((Date.parse(r.checkout)-Date.parse(r.checkin))/86400000),active=selected===r.checkin&&departure.value===r.checkout;
        return `<button type="button" class="sd-quick-option ${active?'is-selected':''}" data-quick-arrival="${r.checkin}" data-quick-departure="${r.checkout}" aria-pressed="${active}" ${checkoutBusy?'disabled':''}><span><strong>${dateLabel(r.checkin)} – ${dateLabel(r.checkout)}</strong><small>${count} ${count===1?'nacht':'nachten'} · ${policy.guests} personen</small>${o.local_fees.map(f=>`<small>${escapeHtml(f.description)}: ${escapeHtml(cash(f.amount))} ter plaatse</small>`).join('')}</span><span class="sd-quick-price"><strong>${escapeHtml(cash(o.price))}</strong><small>totaal</small></span><span aria-hidden="true">${active?'✓':'→'}</span></button>`;
      }).join('');}
      if(options.length)quickTimer=setTimeout(()=>{if(ui.isConnected)renderQuickStays();},Math.max(100,Math.min(...options.map(r=>(r.price_checked_at||r.checked_at)+600000-Date.now()))+25));
    }
    quickList.addEventListener('click',e=>{
      const button=e.target.closest('[data-quick-arrival]');if(!button||button.disabled||checkoutBusy)return;
      const r=quickOptions().find(r=>r.checkin===button.dataset.quickArrival&&r.checkout===button.dataset.quickDeparture);
      if(!r){renderQuickStays();return;}
      nights=Math.round((Date.parse(r.checkout)-Date.parse(r.checkin))/86400000);nightsInput.value=String(nights);start=r.checkin;startInput.value=start;
      selectDay(r.checkin);check.click();
    });
    function clearQuote(){quoteGeneration++;chosen=null;if(mottoDecember)mottoSelection=null;clearTimeout(expiry);book.hidden=true;book.style.display='none';book.disabled=true;result.textContent='';showBookingMessage('','info');}
    function clearSelection(){clearQuote();selected='';arrival.value='';departure.value='';selection.hidden=true;check.hidden=true;check.disabled=false;}
    function renderDays(){
      renderQuickStays();
      label.textContent=dateLabel(start)+' – '+dateLabel(dateAdd(start,6));
      ui.querySelector('[data-week="-1"]').disabled=start<=policy.start||checkoutBusy;
      ui.querySelector('[data-step="-1"]').disabled=nights<=1||checkoutBusy;
      ui.querySelector('.sd-week-basis').textContent=`Totaal voor ${nights} ${nights===1?'nacht':'nachten'} · ${policy.guests} personen. Prijzen zijn een indicatie; controleer je keuze. Lokale kosten apart vermeld.`;
      days.innerHTML=Array.from({length:7},(_,i)=>{const d=dateAdd(start,i),r=entry(d),available=r?.status==='available',unavailable=r?.status==='unavailable',weekday=new Intl.DateTimeFormat('nl-NL',{weekday:'short',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z')),amount=available?cash(r.options[0].price):unavailable?'—':pendingDays.has(key(d))?'Laden':failures.has(key(d))?'Opnieuw':'…';
        return `<button type="button" class="sd-week-day ${available?'is-available':unavailable?'is-unavailable':'is-unknown'} ${selected===d?'is-selected':''}" data-day="${d}" aria-pressed="${selected===d}" aria-label="${escapeAttribute(weekday+' '+dateLabel(d)+', '+(available?amount+' totaal':unavailable?'geen passend aanbod':pendingDays.has(key(d))?'prijs ophalen':failures.has(key(d))?'controle niet gelukt':'nog te controleren'))}" ${unavailable&&r.valid_until>Date.now()||checkoutBusy?'disabled':''}><span>${weekday}</span><strong>${Number(d.slice(-2))}</strong><small>${amount}</small>${available?'<span class="sd-week-tick" aria-hidden="true">✓</span>':''}</button>`;
      }).join('');
    }
    async function request(d,calendar){
      const end=dateAdd(d,nights),response=await fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({deal_id:Number(deal.id),stay:{checkin:d,checkout:end,guests:policy.guests,calendar}}),signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw Error('De controle is niet gelukt. Probeer het opnieuw.');
      const r=await response.json();
      if(!validStayResult(r,Number(deal.id),d,end,policy.guests))throw Error('De beschikbaarheid kon niet worden bevestigd.');
      if(r.options.some(o=>!Array.isArray(o.local_fees)||o.local_fees.some(f=>f.currency!=='EUR'||!Number.isFinite(f.amount)||f.amount<0||typeof f.description!=='string')))throw Error('De lokale kosten konden niet worden bevestigd.');
      return r;
    }
    function stopRetry(){clearTimeout(retryTimer);retryTimer=null;}
    function progress(){const done=Array.from({length:7},(_,i)=>entry(dateAdd(start,i))).filter(Boolean).length;status.textContent=`${done} van 7 dagen gecontroleerd. Prijzen ophalen… Dit kan even duren.`;}
    function resumeAfterWait(id){
      stopRetry();if(id!==generation||!ui.isConnected||document.hidden)return;
      const seconds=Math.max(0,Math.ceil((retryAt-Date.now())/1000));
      if(seconds){status.textContent=`De prijscontrole is tijdelijk druk. We gaan automatisch verder over ${seconds} seconden.`;retryTimer=setTimeout(()=>resumeAfterWait(id),1000);}
      else if(retries<2){retries++;loadWeek();}
      else{status.textContent='De prijzen konden nog niet worden bevestigd. Kies een dag voor een losse prijscontrole of probeer opnieuw.';retry.hidden=false;}
    }
    async function loadWeek(){
      stopRetry();const id=++generation;loading=true;retry.hidden=true;progress();
      let waiting=false,nextDay=0;
      async function worker(){while(nextDay<7){const i=nextDay++;
        if(id!==generation||checkoutBusy||!ui.isConnected||document.hidden)break;
        const d=dateAdd(start,i);if(entry(d)&&['available','unavailable'].includes(entry(d).status))continue;
        if(Date.now()<retryAt){waiting=true;break;}
        pendingDays.add(key(d));failures.delete(key(d));renderDays();
        try{const r=await request(d,true);if(id!==generation||!ui.isConnected)return;
          if(r.status==='available'||r.status==='unavailable'){cache.set(key(d),r);if(cache.size>84)cache.delete(cache.keys().next().value);}
          if(!['available','unavailable'].includes(r.status))failures.add(key(d));
          if(r.retry_after){retryAt=Date.now()+Math.min(60,r.retry_after)*1000;waiting=true;break;}
        }catch{if(id!==generation)return;waiting=true;failures.add(key(d));}
        finally{pendingDays.delete(key(d));}
        renderDays();progress();
      }}
      await Promise.all([worker(),worker()]);
      if(id!==generation||!ui.isConnected)return;
      loading=false;renderDays();const pending=Array.from({length:7},(_,i)=>entry(dateAdd(start,i))).some(r=>!r||!['available','unavailable'].includes(r.status));
      retry.hidden=!pending;status.textContent=pending?(waiting?'Nog niet alle dagen zijn bevestigd. Je kunt een dag kiezen of de resterende dagen later controleren.':'Kies een dag om deze te controleren.'):'Kies een groene dag. Prijzen en beschikbaarheid kunnen wijzigen.';
      status.textContent=pending?'Sommige prijzen zijn nog niet bevestigd. Kies een dag voor een losse controle.':'Laatst opgehaalde prijzen en beschikbaarheid. Controleer je keuze voor de actuele prijs.';
      if(pending&&Date.now()<retryAt)resumeAfterWait(id);
      else if(pending&&waiting){status.textContent='Een prijscontrole is niet gelukt. Kies een dag of probeer opnieuw.';}

    }
    function changeWeek(){
      if(checkoutBusy)return;stopRetry();retries=0;pendingDays.clear();const previous=selected;generation++;loading=false;clearSelection();clearTimeout(debounce);
      const n=Number(nightsInput.value),d=startInput.value;
      if(!Number.isSafeInteger(n)||n<1||!validStayDay(d)||d<policy.start||!validStayDay(dateAdd(d,n))||!validStayDay(dateAdd(d,6))){days.innerHTML='';status.textContent='Kies een geldig aantal nachten en een datum vanaf vandaag.';retry.hidden=true;return;}
      nights=n;start=d;renderDays();if(previous)selectDay(previous);debounce=setTimeout(loadWeek,450);
    }
    nightsInput.addEventListener('input',changeWeek);startInput.addEventListener('change',changeWeek);
    ui.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{if(checkoutBusy)return;nightsInput.value=String(Math.max(1,Number(nightsInput.value||1)+Number(b.dataset.step)));changeWeek();}));
    ui.querySelectorAll('[data-week]').forEach(b=>b.addEventListener('click',()=>{if(checkoutBusy)return;const d=dateAdd(start,7*Number(b.dataset.week));startInput.value=d<policy.start?policy.start:d;changeWeek();}));
    retry.addEventListener('click',()=>{if(checkoutBusy||loading)return;retries=0;failures.clear();if(Date.now()<retryAt){status.textContent=`Probeer opnieuw over ${Math.ceil((retryAt-Date.now())/1000)} seconden. Je kunt wel een dag kiezen.`;return;}for(const [k,r] of cache){if(r.valid_until<=Date.now())cache.delete(k);}loadWeek();});
    function selectDay(day){stopRetry();pendingDays.clear();generation++;loading=false;clearTimeout(debounce);clearQuote();selected=day;arrival.value=selected;departure.min=dateAdd(selected,1);departure.value=dateAdd(selected,nights);const r=entry(selected),o=r?.status==='available'?r.options[0]:null;
      selection.hidden=false;selection.innerHTML=`<h3>Jouw verblijf</h3><div class="sd-week-summary-dates"><span>Inchecken<strong>${dateLabel(selected)}</strong></span><span>Uitchecken<strong>${dateLabel(departure.value)}</strong></span></div><div class="sd-week-summary-total"><span>${nights} ${nights===1?'nacht':'nachten'} · ${policy.guests} personen</span><strong>${o?escapeHtml(cash(o.price)):'Prijs controleren'}</strong></div>`+(o?.local_fees||[]).map(f=>`<p>${escapeHtml(f.description)}: ${escapeHtml(cash(f.amount))} ter plaatse</p>`).join('');
      check.hidden=false;check.disabled=false;check.textContent='Controleer prijs en beschikbaarheid';status.textContent='Controleer je keuze voor de actuele prijs en voorwaarden.';renderDays();
    }
    days.addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(!b||b.disabled||checkoutBusy)return;selectDay(b.dataset.day);});
    function changeDates(){
      if(checkoutBusy)return;stopRetry();retries=0;pendingDays.clear();generation++;loading=false;clearTimeout(debounce);clearQuote();selected='';selection.hidden=true;check.hidden=true;check.disabled=false;
      const a=arrival.value,b=departure.value;departure.min=validStayDay(a)?dateAdd(a,1):policy.start;
      if(validStayDay(a)&&a>=policy.start&&validStayDay(dateAdd(a,6))){start=a;startInput.value=a;renderDays();}
      if(!validStayDay(a)||a<policy.start||!validStayDay(b)||b<=a){status.textContent='Kies een incheckdatum en een uitcheckdatum die daarna ligt.';return;}
      nights=Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);nightsInput.value=String(nights);start=a;startInput.value=a;selectDay(a);debounce=setTimeout(loadWeek,450);
    }
    function changeArrival(){
      if(checkoutBusy)return;
      const a=arrival.value;
      if(validStayDay(a)&&a>=policy.start){
        if(selected===a&&departure.value===dateAdd(a,nights))return;
        departure.value=dateAdd(a,nights);
      }
      changeDates();
    }
    function changeDeparture(){if(selected===arrival.value&&departure.value===dateAdd(selected,nights))return;changeDates();}
    for(const event of ['input','change']){arrival.addEventListener(event,changeArrival);departure.addEventListener(event,changeDeparture);}
    check.addEventListener('click',async()=>{
      if(checkoutBusy||!selected)return;stopRetry();pendingDays.clear();generation++;loading=false;clearTimeout(debounce);clearQuote();const id=quoteGeneration,d=selected;check.disabled=true;result.textContent='Prijs ophalen… Even geduld a.u.b.';
      try{const r=await request(d,false);if(id!==quoteGeneration||!ui.isConnected)return;
        if(r.status!=='available'){result.textContent=r.status==='unavailable'?(mottoDecember?'Geen kamer beschikbaar voor 4–5 december.':'Geen passend aanbod voor deze datums. Kies een andere dag.'):r.retry_after?`Probeer de controle over ${r.retry_after} seconden opnieuw.`:'De controle is niet gelukt. Probeer opnieuw.';return;}
        const o=mottoDecember ? r.options.find(v=>validMottoOffer(v)&&matchesMottoPromotion(v)) || r.options.find(validMottoOffer) : r.options[0];
        if (!o || (mottoDecember && r.can_book !== true)) {
          result.textContent='Er is geen bevestigd verblijf beschikbaar voor deze datums.'; return;
        }
        const alternative=mottoDecember && !matchesMottoPromotion(o);
        chosen=r;cache.set(key(d),r);renderDays();
        if(mottoDecember)mottoSelection=o;
        const local=o.local_fees.reduce((total,f)=>total+Math.round(f.amount*100),0)/100;
        const total=o.price+local;
        selection.querySelector('.sd-week-summary-total strong').textContent=cash(mottoDecember?total:o.price);
        deal={...deal,price:o.price,deal_price:o.price,room:o.room,board:o.board,cancellation_policy:o.cancellation,travel_period_start:r.checkin,travel_period_end:r.checkout,minimum_nights:r.nights,booking_enabled:true};
        if(mottoDecember) {
          selection.querySelector('h3').textContent=alternative?'Alternatief voor dezelfde nacht':'Jouw verblijf';
          selection.querySelectorAll('p').forEach(p=>p.remove());
          result.innerHTML=(alternative?'<p>De Compact King Room voor €116,67 is niet beschikbaar met de oorspronkelijke voorwaarden. Voor dezelfde nacht kun je dit verblijf boeken.</p>':'')+
            '<p><strong>'+escapeHtml(o.room)+'</strong> · '+escapeHtml(o.board)+'</p><p><strong>'+cash(total)+' totaal voor twee</strong><br>'+cash(o.price)+' online · '+cash(local)+' ter plaatse volgens het hoteltarief</p>'+
            '<p>'+escapeHtml(o.cancellation.split('. ')[0])+'.</p><details><summary>Volledige annuleringsvoorwaarden</summary><p>'+escapeHtml(o.cancellation)+'</p></details>';
        } else {
          result.innerHTML='<p><strong>'+cash(o.price)+' totaal</strong> · '+escapeHtml(o.room)+' · '+escapeHtml(o.board)+'</p><details><summary>Annuleringsvoorwaarden bekijken</summary><p>'+escapeHtml(o.cancellation)+'</p></details>'+o.local_fees.map(f=>'<p>'+escapeHtml(f.description)+': '+cash(f.amount)+' ter plaatse</p>').join('');
        }
        check.hidden=true;book.hidden=false;book.style.display='';book.disabled=false;book.innerHTML=alternative?'Boek dit alternatief <span>→</span>':'Verder naar betalen <span>→</span>';
        expiry=setTimeout(()=>{if(id===quoteGeneration&&!checkoutBusy){clearQuote();check.hidden=false;check.disabled=false;result.textContent='Controleer de prijs opnieuw om verder te gaan.';}},Math.max(0,r.valid_until-Date.now()));
      }catch(e){if(id===quoteGeneration)result.textContent=e.message;}
      finally{if(id===quoteGeneration)check.disabled=false;}
    });
    form.addEventListener('submit',e=>{if(!chosen||chosen.checkin!==arrival.value||chosen.checkout!==departure.value||chosen.valid_until<=Date.now()){e.preventDefault();e.stopImmediatePropagation();clearQuote();check.hidden=false;result.textContent='Controleer eerst de actuele prijs voor je gekozen verblijf.';}},true);
    renderDays();
    if (mottoDecember) {
      form.addEventListener('sd-quote-unconfirmed', () => {
        clearQuote();
        check.hidden=false; check.disabled=false;
        result.textContent='Controleer de kamer en de prijs opnieuw.';
      });
      for (const node of ui.children) {
        if (![selection,check,result].includes(node)) node.style.display='none';
      }
      if (policy.guests !== 2 || policy.start > promoArrival) {
        result.textContent='Dit arrangement is niet beschikbaar.'; return;
      }
      selectDay(promoArrival);
      arrival.readOnly=true; departure.readOnly=true;
      selection.querySelector('h3').textContent='4–5 december · 2 volwassenen';
      check.click();
      return;
    }
    // Only search when the booking panel is visible, once; never poll in the background.
    if(typeof IntersectionObserver==='function'){const observer=new IntersectionObserver(entries=>{if(!ui.isConnected){observer.disconnect();return;}if(entries.some(e=>e.isIntersecting)){observer.disconnect();if(!selected&&!loading)loadWeek();}},{rootMargin:'0px'});observer.observe(ui);}else loadWeek();
  }

  async function initStayChoice(knownPolicy) {
    if(knownPolicy?.mode==='free-calendar')return initFreeCalendar(knownPolicy);
    if (deal.source !== 'provider_sync') return;
    const endpoint = CONFIG.dealsEndpoint.replace(/\/deals$/, '/supplier/production/stay-options');
    const request = async stay => {
      const response = await fetch(endpoint, {method:'POST',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({deal_id:Number(deal.id),stay}),signal:AbortSignal.timeout(25000)});
      if (!response.ok) throw new Error('De beschikbaarheid kon niet worden gecontroleerd. Probeer opnieuw.');
      return response.json();
    };
    let policy;
    try { policy = knownPolicy || await request(null); } catch { return; }
    if (!validStayPolicy(policy, Number(deal.id))) return;
    const oldForm = document.getElementById('booking-form');
    if (!oldForm) return;
    oldForm.hidden = true;
    const card = oldForm.closest('.booking-card');
    card.querySelector('.booking-price').hidden = true;
    const section = document.createElement('section');
    section.className = 'flexible-stay';
    section.innerHTML = `<h2>Kies jouw verblijf</h2><p>${policy.min_nights}–${policy.max_nights} nachten voor ${policy.guests} personen. De totaalprijs en voorwaarden worden voor je datums gecontroleerd.</p><p>Verblijfsperiode: ${escapeHtml(policy.start)} t/m ${escapeHtml(policy.end)} (uitchecken).</p><form class="booking-form"><div class="booking-dates"><label>Aankomst<input name="arrival" type="date" required min="${policy.start}" max="${policy.end}"></label><label>Vertrek<input name="departure" type="date" required min="${policy.start}" max="${policy.end}"></label></div><button class="button button-primary booking-submit" type="submit">Bekijk prijs en beschikbaarheid</button></form><div class="stay-results" role="status" aria-live="polite"></div>`;
    oldForm.before(section);
    const form=section.querySelector('form'),arrival=form.elements.arrival,departure=form.elements.departure,button=form.querySelector('button'),output=section.querySelector('.stay-results');
    let generation=0, expiry;
    const invalidate=()=>{generation++;clearTimeout(expiry);output.textContent='';button.disabled=false;};
    form.addEventListener('input',invalidate);
    form.addEventListener('submit',async event=>{
      event.preventDefault();invalidate();
      const checkin=arrival.value,checkout=departure.value;
      if(!validStayDates(policy,checkin,checkout)) {output.textContent='Kies geldige datums binnen de aangeboden periode en verblijfsduur.';return;}
      const id=generation;
      button.disabled=true;output.textContent='Actuele beschikbaarheid en totaalprijs ophalen…';
      try {
        const result=await request({checkin,checkout,guests:policy.guests});
        if(id!==generation)return;
        if(!validStayResult(result,Number(deal.id),checkin,checkout,policy.guests))throw new Error('Het antwoord past niet bij je gekozen verblijf. Controleer opnieuw.');
        if(result.status!=='available'){output.textContent=result.status==='unavailable'?'Geen passend aanbod voor deze datums. Kies andere datums.':'De prijs of beschikbaarheid is nog niet bevestigd. Probeer opnieuw.';return;}
        output.innerHTML=`<p><strong>${result.nights} ${result.nights===1?'nacht':'nachten'} · ${policy.guests} personen</strong></p>`+result.options.map(o=>`<div class="policy-card"><strong>${escapeHtml(formatCurrency(o.price))} totaal</strong><p>${escapeHtml(o.room)} · ${escapeHtml(o.board)}</p><p>${escapeHtml(o.cancellation)}</p></div>`).join('')+'<p>Boeken is binnenkort mogelijk. Dit is een actuele prijscontrole, geen reservering.</p>';
        expiry=setTimeout(()=>{if(id===generation){output.textContent='Deze prijscontrole is verlopen. Controleer opnieuw voor een actuele prijs.';}},Math.max(0,result.valid_until-Date.now()));
      } catch(error){if(id===generation)output.textContent=error.message;}
      finally {if(id===generation)button.disabled=false;}
    });
  }
  function validStayDay(value) {return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
  function validStayPolicy(p,id) {if(p?.mode==='free-calendar')return p.enabled===true&&p.deal_id===id&&[33,36].includes(id)&&p.can_book===true&&validStayDay(p.start)&&p.end===null&&p.min_nights===1&&p.max_nights===null&&Number.isInteger(p.guests)&&p.guests>=1&&p.guests<=6&&typeof p.expected_terms==='string';return !!p && p.enabled===true && p.deal_id===id && p.can_book===false && validStayDay(p.start) && validStayDay(p.end) && p.start<p.end && Number.isInteger(p.min_nights) && Number.isInteger(p.max_nights) && p.min_nights>=1 && p.max_nights>=p.min_nights && p.max_nights<=30 && Number.isInteger(p.guests) && p.guests>=1 && p.guests<=6;}
  function validStayDates(p,a,b) {const nights=(Date.parse(b)-Date.parse(a))/86400000;return validStayDay(a)&&validStayDay(b)&&a>=p.start&&b<=p.end&&nights>=p.min_nights&&nights<=p.max_nights;}
  function validStayResult(r,id,a,b,guests,now=Date.now()) {
    return !!r && r.deal_id===id && r.checkin===a && r.checkout===b && r.guests===guests && r.nights===(Date.parse(b)-Date.parse(a))/86400000 && r.currency==='EUR' && (r.can_book===false||[33,36].includes(id)&&r.can_book===true) && Number.isFinite(r.checked_at) && Number.isFinite(r.valid_until) && r.checked_at<=now+5000 && r.valid_until>now && r.valid_until>r.checked_at && r.valid_until-r.checked_at<=60000 && Array.isArray(r.options) && r.options.length<=6 && ['available','unavailable','unknown','price_review_required'].includes(r.status) && (r.status==='available'?r.options.length>0:r.options.length===0) && r.options.every(o=>o && typeof o.room==='string' && typeof o.board==='string' && typeof o.cancellation==='string' && Number.isFinite(o.price)&&o.price>0);
  }

  // BEGIN DISPLAYED CHECKOUT TERMS
function checkoutCanonical(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

// This is a comparison with the displayed offer, never a client-selected price.
// Both sides normalize missing optional fields to null. No supplier costs are public.
function checkoutDisplayedTerms(deal) {
  const fields = ['id', 'title', 'price', 'deal_price', 'room_type', 'max_guests',
    'minimum_nights', 'travel_period_start', 'travel_period_end', 'cancellation_policy',
    'short_description', 'long_description', 'includes_breakfast', 'includes_wifi',
    'includes_parking', 'includes_late_checkout', 'includes_welcome_drink'];
  return checkoutCanonical(Object.fromEntries(fields.map(key => [key, deal?.[key] ?? null])));
}

  // END DISPLAYED CHECKOUT TERMS

  function supplierStorageKey(id) { return `sd-direct-checkout-v1:${id}`; }

  // Keep the old key on every uncertain response. Only the server can authorize a
  // deterministic successor after Stripe has confirmed the old session expired.
  async function recoverSupplierCheckout(request, hotelNotesAck) {
    let retries = 0, restarts = 0, quoteRetries = 0;
    for (;;) {
      let response, data;
      try {
        response = await fetch(CONFIG.supplierCheckoutEndpoint, {method:'POST',mode:'cors',credentials:'omit',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({...request,...(hotelNotesAck ? {hotel_notes_ack:hotelNotesAck} : {})})});
        data = await response.clone().json();
      } catch (_) {
        if (retries++ < 2) { await checkoutRecoveryDelay(); continue; }
        throw checkoutCustomerError('De controle van je betaalpoging duurt langer. Klik opnieuw op boeken om dezelfde poging veilig te hervatten.');
      }
      // Both quote rejections precede order admission and Stripe session creation.
      const quoteRejected = mottoDecember && response.status === 400 &&
        ['Approved production quote required', 'No approved, margin-safe production offer is available'].includes(data?.message);
      if (quoteRejected) {
        if (quoteRetries < 2) {
          quoteRetries++;
          showBookingMessage('Het hotel bevestigt de kamer opnieuw. Even geduld…', 'info');
          await new Promise(resolve => setTimeout(resolve, 1500 * quoteRetries));
          continue;
        }
        const error = checkoutCustomerError('Het hotel heeft de kamer voor 4–5 december nog niet bevestigd. Controleer de beschikbaarheid opnieuw.', 'changed');
        error.quoteUnconfirmed = true;
        throw error;
      }
      if ((!response.ok && (response.status >= 500 || response.status === 429)) || (response.ok && data?.status === 'checkout_check_pending')) {
        if (retries++ < 2) { await checkoutRecoveryDelay(); continue; }
        throw checkoutCustomerError('Je eerdere betaalpoging wordt nog gecontroleerd. Klik opnieuw op boeken om deze te hervatten.','pending');
      }
      if (response.ok && data?.status === 'checkout_paid') throw checkoutCustomerError('Deze betaalpoging is al betaald. Controleer je boekingsbevestiging; je hoeft niet opnieuw te betalen.','pending');
      if (response.ok && data?.status === 'checkout_processing') throw checkoutCustomerError('Je betaling wordt verwerkt. Wacht op de bevestiging; je hoeft niet opnieuw te betalen.','pending');
      if (!(response.ok && data?.status === 'checkout_restart')) return response;
      if (data.environment !== 'production' || data.checkout_created !== false || data.previous_session_closed !== true || !/^[a-f0-9]{64}$/.test(data.request_key || '') || data.request_key === request.request_key || restarts++ >= 2) throw checkoutCustomerError('Je betaalpoging wordt vernieuwd. Klik opnieuw op boeken om verder te gaan.');
      const key = supplierStorageKey(request.deal_id);
      let saved;
      try {
        saved = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (saved?.request_key !== request.request_key) throw new Error('Concurrent checkout');
        sessionStorage.setItem(key, JSON.stringify({request_key:data.request_key,created_at:Date.now(),fingerprint:JSON.stringify({deal_id:request.deal_id,checkin:request.checkin,checkout:request.checkout,guest_count:request.guest_count})}));
      } catch (_) { throw checkoutCustomerError('Je betaalpoging kon niet worden hervat. Klik opnieuw op boeken.'); }
      request.request_key = data.request_key;
      hotelNotesAck = null;
      showBookingMessage('Je betaalpagina wordt voorbereid…', 'info');
    }
  }

  function checkoutRecoveryDelay() {
    showBookingMessage('Je betaalpagina wordt voorbereid…', 'info');
    return new Promise(resolve => setTimeout(resolve, 1200));
  }

  function supplierRequest(id, checkin, checkout, guests) {
    const dealId = Number(id);
    if (!Number.isSafeInteger(dealId) || dealId <= 0 || !Number.isInteger(guests) || guests < 1 || guests > 6) throw checkoutCustomerError("Deze hoteldeal ondersteunt dit aantal gasten niet.");
    const request = { deal_id: dealId, checkin, checkout, guest_count: guests, expected_terms: stayCapability?.mode==='free-calendar'?stayCapability.expected_terms:checkoutDisplayedTerms(deal) };
    // Reuse the same key after reloading changed terms. The server checks those
    // terms against an existing intent; it can never replace a previously created order.
    const fingerprint = JSON.stringify({deal_id: dealId, checkin, checkout, guest_count: guests}), key = supplierStorageKey(id);
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(key) || "null"); }
    catch (_) { throw checkoutCustomerError("Je betaalpoging kan niet veilig worden bewaard. Neem contact op met SeasonDeals."); }
    if (saved) {
      if (!/^[a-f0-9]{64}$/.test(saved.request_key || "") || !Number.isFinite(saved.created_at)) throw checkoutCustomerError("Je eerdere betaalpoging kan niet worden herkend. Neem contact op met SeasonDeals.");
      // Age and changed stay details are reconciled by the server, never by
      // forgetting an existing key and potentially opening a second payment.
    } else {
      const bytes = new Uint8Array(32);
      window.crypto.getRandomValues(bytes);
      saved = { request_key: Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""), fingerprint, created_at: Date.now() };
      try { sessionStorage.setItem(key, JSON.stringify(saved)); }
      catch (_) { throw checkoutCustomerError("Je betaalpoging kan niet veilig worden bewaard. Neem contact op met SeasonDeals."); }
    }
    return { ...request, request_key: saved.request_key };
  }

  function validSupplierCheckout(data, url) {
    if (data?.environment !== "production" || data?.status !== "pending_payment" || data?.currency !== "EUR" || typeof url !== "string") return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "checkout.stripe.com" && !parsed.username && !parsed.password && !parsed.port && /^\/[a-z]\/pay\/cs_live_[A-Za-z0-9_]+$/.test(parsed.pathname);
    } catch (_) { return false; }
  }

  function setDateLimits(start, end) {
    const checkin = document.getElementById("sd-checkin"), checkout = document.getElementById("sd-checkout");
    if (!checkin || !checkout) return;
    if (deal.source === 'provider_sync' && !deal.stay_policy?.enabled && start && end) {
      checkin.value = start.toISOString().slice(0, 10);
      checkout.value = end.toISOString().slice(0, 10);
      checkin.disabled = true; checkout.disabled = true;
      const guests = document.getElementById('sd-guests');
      if (guests) { guests.value = String(deal.max_guests); guests.disabled = true; }
      return;
    }
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
  function getImages(item) { const values=[...(Array.isArray(item.external_image_urls)?item.external_image_urls:[]),...(Array.isArray(item.images)?item.images:[]),item.image,item.cover_image,item.image_url]; return [...new Set(values.map((value)=>typeof value==="string"?value:value?.url).filter(Boolean))]; }
  function getAmenities(item) {
    if (item.source === "provider_sync") return item.content_verified === true && Array.isArray(item.included_items) ? item.included_items.map(row => [true,row.icon,row.label,row.detail]) : [];
    return [[item.includes_breakfast === true,"☕","Ontbijt inbegrepen","Bij deze aanbieding"],[item.includes_wifi === true,"⌁","Wifi inbegrepen","Bij deze aanbieding"],[item.includes_parking === true,"P","Parkeren inbegrepen","Bij deze aanbieding"],[item.includes_late_checkout === true,"◷","Late check-out","Volgens de dealvoorwaarden"],[item.includes_welcome_drink === true,"◇","Welkomstdrankje","Bij deze aanbieding"]].filter(([active])=>active);
  }
  function renderAmenity([,icon,title,subtitle]) { return `<div class="amenity"><span class="amenity-icon">${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(dealAmenityDetail(title,subtitle))}</small></div></div>`; }
  function getRemaining(item) { if (item.source === "provider_sync") return null; const direct=number(item.remaining_inventory??item.available_quantity??item.inventory); return direct===null?null:Math.max(0,direct); }
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
  function displayCity(value) { const city = text(value, "").trim(); return /^the hague$/i.test(city) ? "Den Haag" : city; }
  function escapeHtml(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
  function escapeAttribute(value){return escapeHtml(value).replace(/`/g,"&#096;");}
  function checkoutCustomerError(message, bookingStage) {
    const error = new Error(message);
    error.customerMessage = message;
    error.bookingStage = bookingStage;
    return error;
  }

  function showBookingMessage(value,type){const el=document.getElementById("booking-message");if(!el)return;el.textContent=value;el.className=`booking-message is-visible is-${type}`;}
  function showToast(value){const toast=document.getElementById("preview-toast");if(!toast)return;toast.textContent=value;toast.classList.add("is-visible");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove("is-visible"),3500);}
  function showError(title,message){container.innerHTML=`<section class="detail-error"><span>!</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button button-primary" href="${escapeAttribute(CONFIG.homePage)}#deals">Terug naar alle deals <span>→</span></a></section>`;}
})();





