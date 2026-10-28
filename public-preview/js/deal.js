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
        if(capResponse.ok){const p=await capResponse.json();stayCapability=p;if(validStayPolicy(p,Number(dealId))&&p.deal?.id===Number(dealId)&&p.deal.source==='provider_sync'&&p.deal.booking_enabled===false){pendingDeal={...(pendingDeal?.content_verified===true?pendingDeal:{}),...p.deal};if(checkoutBusy)return;deal=pendingDeal;gallery=getImages(pendingDeal);renderFlexibleDeal(p);bindDealEvents();await initStayChoice(p);return;}}
      }catch{}
      }
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
    document.title = `${title} · SeasonDeals`;

    container.innerHTML = `<div class="detail-container">
      <nav class="detail-breadcrumbs" aria-label="Broodkruimel"><a href="${escapeAttribute(CONFIG.homePage)}">Home</a><span>›</span><a href="${escapeAttribute(CONFIG.homePage)}#deals">Deals</a><span>›</span><span>${escapeHtml(title)}</span></nav>
      ${renderGallery(title)}
      <header class="detail-heading"><div><span class="detail-kicker">${escapeHtml(formatCategory(getCategory(deal)))}${location ? ` · ${escapeHtml(location)}` : ""}</span><h1>${escapeHtml(title)}</h1><div class="detail-subline"><strong>${escapeHtml(hotel)}</strong>${rating > 0 ? `<span class="detail-rating">★ ${escapeHtml(formatDecimal(rating))}${reviews > 0 ? ` · ${escapeHtml(formatNumber(reviews))} beoordelingen` : ""}</span>` : ""}${deal.star_rating > 0 ? `<span>${"★".repeat(Math.min(5, Math.round(deal.star_rating)))} hotel</span>` : ""}${flexiblePolicy ? '<span class="detail-stock">Kies je datums</span>' : deal.source === "provider_sync" ? `<span class="detail-stock">${checking ? "Beschikbaarheid nog niet bevestigd" : "● Beschikbaar"}</span>` : remaining !== null ? `<span class="detail-stock${remaining <= 5 ? " is-low" : ""}">● ${remaining === 0 ? "Uitverkocht" : `Actuele voorraad: ${formatNumber(remaining)}`}</span>` : ""}</div></div><div class="detail-heading-actions"><button class="detail-icon-button" id="share-deal" type="button" aria-label="Deal delen">↗</button><button class="detail-icon-button" id="save-deal" type="button" aria-label="Deal opslaan">♡</button></div></header>
      <div class="detail-layout"><article class="detail-content">
        <section><span class="detail-section-label">Over deze deal</span><h2>Een bijzonder moment voor een mooie prijs.</h2><p>${escapeHtml(mainDescription)}</p>${longDescription && longDescription !== mainDescription ? `<p class="detail-description-long">${formatText(longDescription)}</p>` : ""}</section>
        ${amenities.length ? `<section><span class="detail-section-label">Dit is inbegrepen</span><h2>Jouw verblijf</h2><div class="amenities-grid">${amenities.map(renderAmenity).join("")}</div></section>` : ""}
        ${Array.isArray(deal.facility_items) && deal.facility_items.length ? `<section><h2>Voorzieningen en voorwaarden</h2><div class="amenities-grid">${deal.facility_items.map(row => renderAmenity([true,row.icon,row.label,row.detail])).join("")}</div></section>` : ""}
        <section><span class="detail-section-label">Geldigheid</span><h2>Plan jouw moment.</h2><div class="period-card"><div><span>Te gebruiken vanaf</span><strong>${travelStart ? formatDate(travelStart) : "Zie dealvoorwaarden"}</strong></div><div><span>${flexiblePolicy ? "Laatste vertrek" : "Te gebruiken tot en met"}</span><strong>${travelEnd ? formatDate(travelEnd) : "Zie dealvoorwaarden"}</strong></div></div></section>
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
      short_description: `${policy.min_nights}–${policy.max_nights} nachten in ${deal.room} voor ${policy.guests} personen.`,
      long_description: `Verblijf bij ${text(deal.hotel_name,'het hotel')} in ${deal.room}, met ${deal.board}. Kies jouw aankomst en vertrek binnen de onderstaande periode. De actuele totaalprijs en annuleringsvoorwaarden worden voor jouw datums gecontroleerd.`,
      price: null, deal_price: null, original_price: null,
      travel_period_start: policy.start, travel_period_end: policy.end,
      minimum_nights: policy.min_nights, max_guests: policy.guests,
      cancellation_policy: 'De annuleringsvoorwaarden verschillen per gekozen verblijf. Bekijk de actuele voorwaarden bij het prijsantwoord voor jouw datums. Boeken is nog niet geopend.',
      content_verified: true,
      included_items: [
        {icon:'☾',label:`${policy.min_nights}–${policy.max_nights} nachten naar keuze`,detail:'Binnen de onderstaande verblijfsperiode'},
        {icon:'▱',label:deal.room,detail:deal.board},
        {icon:'♧',label:`Voor ${policy.guests} personen`,detail:'Bezetting van de aangeboden kamer'},
        ...extras
      ]
    };
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
    button.disabled = true; button.innerHTML = "Je wordt doorgestuurd…";
    showBookingMessage("Je wordt doorgestuurd naar de beveiligde betaalpagina…", "info");
    let failureCode = "CHECKOUT_NETWORK", failureStatus = 0;
    let acceptedCheckoutPrice=Number(deal.deal_price||deal.price);
    try {
      const supplier = deal.source === "provider_sync";
      // The backend verifies provider=nuitee, production approval, occupancy and price.
      // Never send a supplier deal through the ordinary partner checkout.
      const request = supplier ? supplierRequest(deal.id, checkin, checkout, guests) : { deal_id: deal.id, checkin, checkout, guests };
      let response = await fetch(supplier ? CONFIG.supplierCheckoutEndpoint : CONFIG.checkoutEndpoint, { method: "POST", mode: "cors", credentials: "omit", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(request) });
      failureStatus = response.status;
      failureCode = response.ok ? "CHECKOUT_RESPONSE" : "CHECKOUT_HTTP";
      let responseText = await response.text();
      let data = {}; try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = { message: responseText }; }
      if (supplier && response.ok && data?.status === "hotel_notes_review" && data.checkout_created === false) {
        failureCode = null;
        if (typeof data.hotel_notes !== 'string' || data.hotel_notes.length > 70000 || typeof data.hotel_notes_ack !== 'string' || data.hotel_notes_ack.length > 150000) throw checkoutCustomerError('De aanvullende hotelinformatie kon niet worden geladen.');
        const offer=data.offer_review;
        if (offer && (!offer.terms || offer.terms.deal_id!==Number(deal.id) || offer.terms.currency!=='EUR' || !Number.isFinite(offer.terms.price) || offer.terms.price<=0 || !Array.isArray(offer.changes) || !Array.isArray(offer.terms.local_fees))) throw checkoutCustomerError('De actuele voorwaarden konden niet worden gecontroleerd.');
        const approved = await reviewHotelNotes(data.hotel_notes,offer);
        if (!approved) {
          showBookingMessage('Je hebt nog niet geboekt of betaald.', 'info');
          checkoutBusy=false;button.disabled=false;button.innerHTML='Bekijk beschikbaarheid & boek <span>→</span>';
          return;
        }
        if(offer) acceptedCheckoutPrice=offer.terms.price;
        failureCode = 'CHECKOUT_NETWORK';
        response = await fetch(CONFIG.supplierCheckoutEndpoint, {method:'POST',mode:'cors',credentials:'omit',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({...request,hotel_notes_ack:data.hotel_notes_ack})});
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
      if (supplier && data.selling_price !== acceptedCheckoutPrice) {
        failureCode = "CHECKOUT_PRICE";
        throw checkoutCustomerError("De betaalpagina kon niet veilig worden bevestigd. Probeer dezelfde boeking opnieuw of neem contact op met SeasonDeals.");
      }
      if (!checkoutUrl) throw checkoutCustomerError("De betaalpagina kon niet worden geopend. Probeer het opnieuw.");
      window.location.href = checkoutUrl;
    } catch (error) {
      reportCheckoutError(failureCode, failureStatus);
      console.error("SeasonDeals checkout failed:", failureCode || "offer changed");
      showBookingMessage(error.customerMessage || "Boeken lukt op dit moment niet. Probeer het later opnieuw of neem contact op met SeasonDeals.", "error");
      checkoutBusy = false;
      button.disabled = false; button.innerHTML = "Bekijk beschikbaarheid & boek <span>→</span>";
    }
  }

  function reviewHotelNotes(raw,offer) {
    return new Promise(resolve => {
      const plain=value=>{const decoder=document.createElement('textarea');decoder.innerHTML=String(value||'').replace(/<(?:br\s*\/?|\/p|\/div|\/li)>/gi,'\n').replace(/<[^>]*>/g,'');return decoder.value.trim();};
      const normalize=value=>plain(value).replace(/\s+/g,' ').trim();
      // Compare against the page the customer actually read, not an older supplier label.
      const displayed={price:Number(deal.deal_price||deal.price),room:deal.room,board:deal.board,cancellation:deal.cancellation_policy};
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
              if(full&&full[1]<=String(deal.travel_period_start||'').slice(0,10)&&Number(full[2].replace(/\./g,'').replace(',','.'))===displayed.price)s=s.replace(/Early check out will attract full cancellation charge unless otherwise specified/gi,'');
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
      const paragraph=(label,value)=>{const row=document.createElement('p'),strong=document.createElement('strong');strong.textContent=label;row.append(strong,document.createTextNode(' '+plain(value)));notes.append(row);};
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
      }else notes.textContent=plain(raw);
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
  async function initStayChoice(knownPolicy) {
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
  function validStayPolicy(p,id) {return !!p && p.enabled===true && p.deal_id===id && p.can_book===false && validStayDay(p.start) && validStayDay(p.end) && p.start<p.end && Number.isInteger(p.min_nights) && Number.isInteger(p.max_nights) && p.min_nights>=1 && p.max_nights>=p.min_nights && p.max_nights<=30 && Number.isInteger(p.guests) && p.guests>=1 && p.guests<=6;}
  function validStayDates(p,a,b) {const nights=(Date.parse(b)-Date.parse(a))/86400000;return validStayDay(a)&&validStayDay(b)&&a>=p.start&&b<=p.end&&nights>=p.min_nights&&nights<=p.max_nights;}
  function validStayResult(r,id,a,b,guests,now=Date.now()) {
    return !!r && r.deal_id===id && r.checkin===a && r.checkout===b && r.guests===guests && r.nights===(Date.parse(b)-Date.parse(a))/86400000 && r.currency==='EUR' && r.can_book===false && Number.isFinite(r.checked_at) && Number.isFinite(r.valid_until) && r.checked_at<=now+5000 && r.valid_until>now && r.valid_until>r.checked_at && r.valid_until-r.checked_at<=60000 && Array.isArray(r.options) && r.options.length<=6 && ['available','unavailable','unknown','price_review_required'].includes(r.status) && (r.status==='available'?r.options.length>0:r.options.length===0) && r.options.every(o=>o && typeof o.room==='string' && typeof o.board==='string' && typeof o.cancellation==='string' && Number.isFinite(o.price)&&o.price>0);
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

  function supplierRequest(id, checkin, checkout, guests) {
    const dealId = Number(id);
    if (!Number.isSafeInteger(dealId) || dealId <= 0 || !Number.isInteger(guests) || guests < 1 || guests > 6) throw checkoutCustomerError("Deze hoteldeal ondersteunt dit aantal gasten niet.");
    const request = { deal_id: dealId, checkin, checkout, guest_count: guests, expected_terms: checkoutDisplayedTerms(deal) };
    // Reuse the same key after reloading changed terms. The server checks those
    // terms against an existing intent; it can never replace a previously created order.
    const fingerprint = JSON.stringify({deal_id: dealId, checkin, checkout, guest_count: guests}), key = supplierStorageKey(id);
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(key) || "null"); }
    catch (_) { throw checkoutCustomerError("Je betaalpoging kan niet veilig worden bewaard. Neem contact op met SeasonDeals."); }
    if (saved) {
      if (!/^[a-f0-9]{64}$/.test(saved.request_key || "") || !Number.isFinite(saved.created_at) || Date.now() < saved.created_at || Date.now() - saved.created_at >= 82800000) throw checkoutCustomerError("Een eerdere betaalpoging moet eerst worden gecontroleerd. Neem contact op met SeasonDeals.");
      if (saved.fingerprint !== fingerprint) throw checkoutCustomerError("Er staat al een betaalpoging voor andere datums of gasten klaar. Gebruik dezelfde gegevens of neem contact op met SeasonDeals.");
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
  function checkoutCustomerError(message) {
    const error = new Error(message);
    error.customerMessage = message;
    return error;
  }

  function showBookingMessage(value,type){const el=document.getElementById("booking-message");if(!el)return;el.textContent=value;el.className=`booking-message is-visible is-${type}`;}
  function showToast(value){const toast=document.getElementById("preview-toast");if(!toast)return;toast.textContent=value;toast.classList.add("is-visible");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove("is-visible"),3500);}
  function showError(title,message){container.innerHTML=`<section class="detail-error"><span>!</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button button-primary" href="${escapeAttribute(CONFIG.homePage)}#deals">Terug naar alle deals <span>→</span></a></section>`;}
})();
