(() => {
  "use strict";

  const CONFIG = Object.assign({
    dealsEndpoint: "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-public/deals",
    dealPage: "deal.html",
    locale: "nl-NL",
    currency: "EUR"
  }, window.SEASONDEALS_CONFIG || {});

  const grid = document.getElementById("deal-grid");
  const message = document.getElementById("deals-message");
  const chips = [...document.querySelectorAll(".filter-chip")];
  const menu = document.getElementById("main-nav");
  const menuToggle = document.getElementById("menu-toggle");
  const cardQuotes = new Map();
  let deals = [];
  let activeFilter = "all";
  let locationQuery = "";
  const DEALS_PER_PAGE = 8;
  let currentPage = 1;
  let pagination;

  initTechnicalSeo();
  bindNavigation();
  bindPreviewControls();
  if (grid) {
    bindDealControls();
    loadDeals();
    setInterval(()=>{if(!document.hidden)loadDeals();},60000);
  }

  function initTechnicalSeo() {
    document.documentElement.lang = "nl";

    setMetaIfMissing("description", "Ontdek exclusieve deals voor hotels, wellness, massages, evenementen en attracties. Boek veilig online en ontvang direct je SeasonDeals-voucher.");
    setMeta("og:type", "website", "property");
    setMeta("og:locale", "nl_NL", "property");
    setMeta("og:site_name", "SeasonDeals", "property");
    setMetaIfMissing("og:description", "Ontdek exclusieve deals voor hotels, wellness, massages, evenementen en attracties bij SeasonDeals.", "property");
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:description", "Hot offers, cool prices voor hotels, wellness, massages, evenementen en attracties.");

    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const isDevelopmentPage = path === "/new-website" || path.includes("/public-preview");

    if (isDevelopmentPage) {
      setMeta("robots", "noindex, nofollow");
      return;
    }

    if (path === "/") {
      setMeta("robots", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
      setCanonical("https://www.seasondeals.nl/");
      setStructuredData("seasondeals-site-schema", {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": "https://www.seasondeals.nl/#organization",
            name: "SeasonDeals",
            url: "https://www.seasondeals.nl/",
            email: "info@seasondeals.nl"
          },
          {
            "@type": "WebSite",
            "@id": "https://www.seasondeals.nl/#website",
            url: "https://www.seasondeals.nl/",
            name: "SeasonDeals",
            inLanguage: "nl-NL",
            publisher: { "@id": "https://www.seasondeals.nl/#organization" }
          }
        ]
      });
    }
  }

  function updateDealStructuredData(publicDeals) {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/" || !Array.isArray(publicDeals) || !publicDeals.length) return;

    const items = publicDeals.slice(0, 20).map((deal, index) => {
      const price = getPositiveNumber(deal.deal_price, deal.price);
      const remaining = getRemaining(deal);
      const image = getImage(deal);
      const url = new URL(CONFIG.dealPage, window.location.origin);
      url.searchParams.set("id", deal.id);
      url.searchParams.set("view", "inventory-v2");

      const product = {
        "@type": "Product",
        name: text(deal.title || deal.name, "SeasonDeals deal"),
        url: url.href
      };

      if (image) product.image = [image];
      if (!deal.stay_policy?.enabled && price > 0 && (deal.source !== "provider_sync" || (deal.price_is_current === true && deal.booking_enabled === true))) {
        product.offers = {
          "@type": "Offer",
          priceCurrency: CONFIG.currency,
          price: String(price),
          url: url.href,
          availability: remaining === 0 ? "https://schema.org/SoldOut" : "https://schema.org/InStock"
        };
      }

      return {
        "@type": "ListItem",
        position: index + 1,
        item: product
      };
    });

    setStructuredData("seasondeals-deals-schema", {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Actuele SeasonDeals",
      itemListElement: items
    });
  }

  function setMeta(key, value, attribute = "name") {
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attribute, key);
      document.head.appendChild(element);
    }
    element.setAttribute("content", value);
  }

  function setMetaIfMissing(key, value, attribute = "name") {
    if (!document.head.querySelector(`meta[${attribute}="${key}"]`)) setMeta(key, value, attribute);
  }

  function setCanonical(url) {
    let element = document.head.querySelector('link[rel="canonical"]');
    if (!element) {
      element = document.createElement("link");
      element.setAttribute("rel", "canonical");
      document.head.appendChild(element);
    }
    element.setAttribute("href", url);
  }

  function setStructuredData(id, data) {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement("script");
      element.id = id;
      element.type = "application/ld+json";
      document.head.appendChild(element);
    }
    element.textContent = JSON.stringify(data);
  }

  function bindNavigation() {
    menuToggle?.addEventListener("click", () => {
      const open = menu.classList.toggle("is-open");
      menuToggle.classList.toggle("is-open", open);
      menuToggle.setAttribute("aria-expanded", String(open));
    });
    menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
      menu.classList.remove("is-open");
      menuToggle.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    }));
  }

  function bindDealControls() {
    pagination = document.createElement("nav");
    pagination.className = "deal-pagination";
    pagination.setAttribute("aria-label", "Dealpagina’s");
    pagination.hidden = true;
    grid.after(pagination);
    grid.setAttribute("tabindex", "-1");
    pagination.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-page]");
      if (!button || button.disabled) return;
      currentPage = Number(button.dataset.page);
      renderDeals();
      grid.focus({ preventScroll: true });
      document.getElementById("deals")?.scrollIntoView({ block: "start" });
    });
    chips.forEach((chip) => chip.addEventListener("click", () => {
      activeFilter = chip.dataset.filter || "all";
      currentPage = 1;
      updateActiveChip();
      renderDeals();
    }));

    document.querySelectorAll("[data-filter-link]").forEach((link) => link.addEventListener("click", () => {
      activeFilter = link.dataset.filterLink || "all";
      currentPage = 1;
      const select = document.getElementById("search-category");
      if (select) select.value = activeFilter;
      updateActiveChip();
      renderDeals();
    }));

    document.getElementById("deal-search")?.addEventListener("submit", (event) => {
      event.preventDefault();
      activeFilter = document.getElementById("search-category")?.value || "all";
      locationQuery = document.getElementById("search-location")?.value.trim().toLocaleLowerCase("nl") || "";
      currentPage = 1;
      updateActiveChip();
      renderDeals();
      document.getElementById("deals")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function bindPreviewControls() {
    document.getElementById("newsletter")?.addEventListener("submit", (event) => {
      event.preventDefault();
      showToast("Bedankt! Dit formulier wordt later aan de e-mailflow gekoppeld.");
      event.currentTarget.reset();
    });
    document.querySelectorAll('.round-action, button.account-action').forEach((control) => control.addEventListener("click", (event) => {
      event.preventDefault();
      showToast("Previewfunctie — deze koppelen we later aan je account.");
    }));
  }

  async function loadDeals() {
    try {
      const response = await fetch(CONFIG.dealsEndpoint, { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Xano gaf status ${response.status}.`);
      const data = await response.json();
      deals = resolveDeals(data).filter(isPublicDeal);
      updateDealStructuredData(deals);
      renderDeals();
    } catch (error) {
      console.error("SeasonDeals public deals failed:", error);
      grid.innerHTML = "";
      pagination.hidden = true;
      setMessage("De deals konden nu niet worden geladen. Probeer het over een paar minuten opnieuw.", "error");
    }
  }

  function resolveDeals(data) {
    const candidates = [data, data?.items, data?.deals, data?.records, data?.data, data?.data?.items, data?.result, data?.result?.items];
    return candidates.find(Array.isArray) || [];
  }

  function isPublicDeal(deal) {
    const status = String(deal?.status || "").toLowerCase();
    const deleted = deal?.deleted_at;
    return (status === "active" || deal?.is_active === true) && (deleted === 0 || deleted === null || deleted === undefined);
  }

  function renderDeals() {
    const filtered = deals.filter((deal) => {
      const categoryMatch = activeFilter === "all" || getCategory(deal) === activeFilter;
      const haystack = [deal.title, deal.hotel_name, deal.city, displayCity(deal.city || deal.hotel?.city), deal.country, deal.hotel?.name, deal.hotel?.city].filter(Boolean).join(" ").toLocaleLowerCase("nl");
      return categoryMatch && (!locationQuery || haystack.includes(locationQuery));
    }).sort((a, b) => {
      // Sort the whole selection before pagination; unpriced offers come last.
      const priceA = a.stay_policy?.enabled ? Infinity : getPositiveNumber(a.deal_price, a.price) || Infinity;
      const priceB = b.stay_policy?.enabled ? Infinity : getPositiveNumber(b.deal_price, b.price) || Infinity;
      return priceA - priceB || String(a.id).localeCompare(String(b.id), "en", { numeric: true });
    });

    grid.innerHTML = "";
    const pageCount = Math.ceil(filtered.length / DEALS_PER_PAGE);
    currentPage = Math.max(1, Math.min(currentPage, pageCount));
    renderPagination(pageCount);
    if (!filtered.length) {
      setMessage(deals.length ? "Voor deze selectie zijn momenteel geen deals beschikbaar." : "Er staan momenteel geen actieve deals online.", "empty");
      return;
    }

    setMessage("");
    const start = (currentPage - 1) * DEALS_PER_PAGE;
    filtered.slice(start, start + DEALS_PER_PAGE).forEach((deal) => {
      const card=createDealCard(deal);grid.appendChild(card);
      if(deal.source==='provider_sync' && deal.stay_policy?.enabled===true) fillCardQuote(card,deal);
    });
  }

  function renderPagination(pageCount) {
    pagination.hidden = pageCount <= 1;
    pagination.innerHTML = "";
    if (pageCount <= 1) return;
    const addButton = (page, label, disabled = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.page = page;
      button.textContent = label;
      button.disabled = disabled;
      if (label === String(page)) {
        button.setAttribute("aria-label", `Pagina ${page}`);
        if (page === currentPage) button.setAttribute("aria-current", "page");
      }
      pagination.appendChild(button);
    };
    addButton(currentPage - 1, "← Vorige", currentPage === 1);
    for (let page = 1; page <= pageCount; page++) {
      if (page === 1 || page === pageCount || Math.abs(page - currentPage) <= 1) {
        addButton(page, String(page));
      } else if (page === currentPage - 2 || page === currentPage + 2) {
        const gap = document.createElement("span");
        gap.textContent = "…";
        pagination.appendChild(gap);
      }
    }
    addButton(currentPage + 1, "Volgende →", currentPage === pageCount);
  }

  function createDealCard(deal) {
    const flexible = deal.source === "provider_sync" && deal.stay_policy?.enabled === true;
    const category = getCategory(deal);
    const title = text(deal.title || deal.name, "SeasonDeals deal");
    const image = getImage(deal);
    const price = getPositiveNumber(deal.deal_price, deal.price);
    const originalPrice = getNumber(deal.original_price);
    const checking = deal.source === "provider_sync" && !flexible && deal.price_is_current !== true;
    const discount = !checking && !flexible && originalPrice && price < originalPrice ? Math.round((1 - price / originalPrice) * 100) : 0;
    const remaining = getRemaining(deal);
    const features = getFeatures(deal).slice(0, 4);
    const city = displayCity(deal.city || deal.hotel?.city);
    const hotel = text(deal.hotel_name || deal.hotel?.name, "SeasonDeals partner");
    const rating = getNumber(deal.review_score ?? deal.hotel?.review_score);
    const reviews = getNumber(deal.review_count ?? deal.hotel?.review_count);
    const detailUrl = typeof deal.seo_url === "string" && /^\/deals\/[a-z0-9-]+$/.test(deal.seo_url) ? deal.seo_url : `${CONFIG.dealPage}?id=${encodeURIComponent(deal.id)}&view=inventory-v2`;
    const card = document.createElement("article");
    card.className = "deal-card";
    card.dataset.category = category;
    card.innerHTML = `
      <div class="deal-image">
        ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(title)}" loading="lazy">` : `<div class="deal-image-placeholder"><span>SeasonDeals</span><small>Hot offers, cool prices</small></div>`}
        ${discount ? `<span class="discount">-${discount}%</span>` : ""}
        ${flexible ? '<span class="stock-badge">Wordt gecontroleerd</span>' : deal.source === "provider_sync" ? `<span class="stock-badge">${checking ? "Wordt bijgewerkt" : "Beschikbaar"}</span>` : remaining !== null ? `<span class="stock-badge${remaining <= 5 ? " is-low" : ""}">${remaining === 0 ? "Uitverkocht" : `Nog ${formatNumber(remaining)} beschikbaar`}</span>` : ""}
      </div>
      <div class="deal-card-body">
        <span class="deal-type">${escapeHtml(formatCategory(category))}${city ? ` · ${escapeHtml(city)}` : ""}</span>
        <h3>${escapeHtml(title)}</h3>
        <div class="deal-partner">${escapeHtml(hotel)}</div>
        ${rating > 0 ? `<div class="rating"><span>★</span> ${escapeHtml(formatDecimal(rating))}${reviews > 0 ? ` · ${escapeHtml(formatNumber(reviews))} beoordelingen` : ""}</div>` : ""}
        <ul>${features.length ? features.map((feature) => `<li>✓ ${escapeHtml(feature)}</li>`).join("") : `<li>Bekijk de deal voor alle details</li>`}</ul>
        <div class="price-row"><span>${!checking && !flexible && originalPrice > price ? `<del>${escapeHtml(formatCurrency(originalPrice))}</del>` : ""}<strong>${flexible ? "Prijs ophalen…" : `${checking ? "Laatst bekend" : "Vanaf"} ${escapeHtml(formatCurrency(price))}`}</strong><small>${checking ? "Prijs en beschikbaarheid worden bijgewerkt" : flexible ? "Controleer prijs en beschikbaarheid" : remaining === null ? "Bekijk de actuele beschikbaarheid" : `Actuele voorraad: ${formatNumber(remaining)}`}</small></span><a href="${escapeAttribute(detailUrl)}">Bekijk deal →</a></div>
      </div>`;
    return card;
  }

  function cardStayCandidates(policy) {
    const valid=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s));
    if(!policy?.enabled || !valid(policy.start) || !valid(policy.end) || !Number.isInteger(policy.min_nights) || !Number.isInteger(policy.max_nights) || policy.min_nights<1 || policy.max_nights>30)return [];
    const today=new Date().toISOString().slice(0,10),start=policy.start>today?policy.start:today;
    const choices=[];
    // Bounded sample, not a claim that every date has been searched.
    for(let n=policy.min_nights;n<=policy.max_nights && choices.length<3;n++){
      const end=new Date(Date.parse(start)+n*86400000).toISOString().slice(0,10);
      if(end<=policy.end)choices.push({checkin:start,checkout:end,guests:policy.guests});
    }
    return choices;
  }

  function validCardQuote(r,id,stay,now=Date.now()) {
    return r?.status==='available' && r.deal_id===id && r.checkin===stay.checkin && r.checkout===stay.checkout && r.guests===stay.guests && r.nights===(Date.parse(stay.checkout)-Date.parse(stay.checkin))/86400000 && r.currency==='EUR' && r.can_book===false && Number.isFinite(r.checked_at) && r.checked_at<=now+5000 && Number.isFinite(r.valid_until) && r.valid_until>now && r.valid_until>r.checked_at && r.valid_until-r.checked_at<=60000 && Array.isArray(r.options) && r.options.length>0 && r.options.every(o=>Number.isFinite(o.price)&&o.price>0&&typeof o.room==='string'&&typeof o.board==='string'&&typeof o.cancellation==='string');
  }

  async function getCardQuote(deal) {
    const key=JSON.stringify([deal.id,deal.stay_policy]);
    const cached=cardQuotes.get(key);
    if(cached && cached.until>Date.now())return cached.promise;
    const entry={until:Date.now()+60000};
    entry.promise=(async()=>{
      for(const stay of cardStayCandidates(deal.stay_policy)){
        const response=await fetch(CONFIG.dealsEndpoint.replace(/\/deals$/, '/supplier/production/stay-options'),{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({deal_id:Number(deal.id),stay}),signal:AbortSignal.timeout(25000)});
        if(!response.ok)throw Error('Prijscontrole niet gelukt');
        const r=await response.json();
        if(validCardQuote(r,Number(deal.id),stay)){
          entry.until=r.valid_until;
          return {...r,price:Math.min(...r.options.map(o=>o.price))};
        }
        if(r?.deal_id!==Number(deal.id)||r.checkin!==stay.checkin||r.checkout!==stay.checkout||r.status!=='unavailable')throw Error('Geen bevestigde prijs');
      }
      return null;
    })().catch(()=>null);
    cardQuotes.set(key,entry);
    return entry.promise;
  }

  async function fillCardQuote(card,deal) {
    const badge=card.querySelector('.stock-badge'),price=card.querySelector('.price-row strong'),caption=card.querySelector('.price-row small');
    const reset=()=>{badge.textContent='Controleer beschikbaarheid';price.textContent='Bekijk prijs';caption.textContent='Kies je datums bij de deal';};
    const quote=await getCardQuote(deal);
    if(!card.isConnected)return;
    if(!quote || quote.valid_until<=Date.now()){reset();return;}
    badge.textContent='Beschikbaar';price.textContent=`Vanaf ${formatCurrency(quote.price)}`;
    const day=s=>new Intl.DateTimeFormat(CONFIG.locale,{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z'));
    caption.textContent=`${quote.nights} ${quote.nights===1?'nacht':'nachten'} · ${quote.guests} personen · ${day(quote.checkin)}–${day(quote.checkout)}`;
    // Expired quotes are never left behind as a current price or stock claim.
    setTimeout(()=>{if(card.isConnected)reset();},Math.max(0,quote.valid_until-Date.now()));
  }

  function getCategory(deal) {
    const raw = [deal.category_slug, deal.category?.slug, deal.category?.name, deal.category, deal.deal_type, deal.package_type, deal.type].filter((value) => typeof value === "string").join(" ").toLowerCase();
    if (/wellness|spa|sauna/.test(raw)) return "wellness";
    if (/massage|beauty|behandeling/.test(raw)) return "massage";
    if (/ticket|event|concert|festival/.test(raw)) return "tickets";
    if (/attract|uitje|park|museum|activiteit/.test(raw)) return "attraction";
    return "hotel";
  }

  function getImage(deal) {
    const first = deal.images?.[0];
    return deal.external_image_urls?.[0] || deal.image_url || deal.image?.url || (typeof first === "string" ? first : first?.url) || deal.cover_image?.url || "";
  }

  function getFeatures(deal) {
    const features = [];
    // Use structured offer facts for every card, including future imports.
    // Supplier occupancy is the quoted party; partner max_guests is capacity.
    if (getCategory(deal) === "hotel") {
      const nights = getNumber(deal.minimum_nights);
      const guests = getNumber(deal.max_guests);
      const stay = [];
      if (deal.source === "provider_sync" && deal.stay_policy?.enabled === true) stay.push(`${deal.stay_policy.min_nights}–${deal.stay_policy.max_nights} nachten naar keuze`);
      else if (Number.isInteger(nights) && nights > 0) stay.push(`${deal.source === "provider_sync" ? "" : "Vanaf "}${nights} ${nights === 1 ? "overnachting" : "overnachtingen"}`);
      if (Number.isInteger(guests) && guests > 0) stay.push(`${deal.source === "provider_sync" ? "Voor" : "Tot"} ${guests} ${guests === 1 ? "persoon" : "personen"}`);
      if (stay.length) features.push(stay.join(" · "));
      if (typeof deal.room_type === "string" && deal.room_type.trim()) features.push(deal.room_type.trim());
    }
    if (deal.includes_breakfast) features.push("Ontbijt inbegrepen");
    if (deal.includes_wifi) features.push("Wifi inbegrepen");
    if (deal.includes_parking) features.push("Parkeren inbegrepen");
    if (deal.includes_late_checkout) features.push("Late check-out");
    if (deal.includes_welcome_drink) features.push("Welkomstdrankje");
    return features;
  }

  function getRemaining(deal) {
    if (deal.source === "provider_sync") return null;
    const direct = getNumber(deal.remaining_inventory ?? deal.available_quantity ?? deal.inventory);
    if (direct !== null) return Math.max(0, direct);
    return null;
  }

  function updateActiveChip() {
    chips.forEach((chip) => chip.classList.toggle("is-active", chip.dataset.filter === activeFilter));
  }

  function setMessage(value, type = "") {
    if (!message) return;
    message.textContent = value;
    message.className = `deals-message${value ? " is-visible" : ""}${type ? ` is-${type}` : ""}`;
  }

  function getNumber(value) { const number = typeof value === "string" ? Number(value.replace(",", ".")) : value; return Number.isFinite(number) ? number : null; }
  function getPositiveNumber(...values) { for (const value of values) { const result = getNumber(value); if (result !== null && result > 0) return result; } return 0; }
  function formatNumber(value) { return new Intl.NumberFormat(CONFIG.locale, { maximumFractionDigits: 0 }).format(value || 0); }
  function formatDecimal(value) { return new Intl.NumberFormat(CONFIG.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value || 0); }
  function formatCurrency(value) { return new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 2 }).format(value || 0); }
  function formatCategory(value) { return ({ hotel: "Hotel", wellness: "Wellness", massage: "Massage", tickets: "Tickets", attraction: "Attractie" })[value] || "Deal"; }
  function text(value, fallback) { return value === null || value === undefined || String(value).trim() === "" ? fallback : String(value); }
  function displayCity(value) { const city = text(value, "").trim(); return /^the hague$/i.test(city) ? "Den Haag" : city; }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }

  function showToast(value) {
    const toast = document.getElementById("preview-toast");
    if (!toast) return;
    toast.textContent = value;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
  }
})();
