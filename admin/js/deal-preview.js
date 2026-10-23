(() => {
  const core = window.AdminCore;
  const target = document.getElementById("deal-preview");
  const params = new URLSearchParams(window.location.search);
  const dealId = params.get("id");

  const escape = (value) => core.escapeHtml(value == null ? "" : String(value));
  const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
  const asArray = (value) => Array.isArray(value) ? value : [];

  function absoluteImageUrl(value) {
    const raw = typeof value === "string"
      ? value
      : first(value?.url, value?.path, value?.image?.url, value?.image?.path);

    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${core.config.xanoOrigin}${raw.startsWith("/") ? "" : "/"}${raw}`;
  }

  function dealImages(deal) {
    const nativeImages = asArray(deal?.images).map(absoluteImageUrl).filter(Boolean);
    if (nativeImages.length) return nativeImages;

    return asArray(first(deal?.external_image_urls, deal?.image_urls))
      .map(absoluteImageUrl)
      .filter(Boolean);
  }

  function dateRange(deal) {
    const start = first(deal?.travel_start, deal?.start_date, deal?.valid_from, deal?.checkin_from);
    const end = first(deal?.travel_end, deal?.end_date, deal?.valid_until, deal?.checkout_until);
    if (!start && !end) return "Volgens beschikbaarheid";
    if (start && end) return `${core.date(start)} – ${core.date(end)}`;
    return core.date(start || end);
  }

  function inventory(deal) {
    const value = first(
      deal?.remaining_inventory,
      deal?.available_quantity,
      deal?.remaining_stock,
      deal?.inventory,
      deal?.stock,
      deal?.quantity
    );
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
  }

  function amenityCards(deal) {
    const amenities = [
      [first(deal?.wifi_included, deal?.wifi), "Wifi inbegrepen", "Blijf zorgeloos verbonden", "⌁"],
      [first(deal?.parking_included, deal?.parking), "Parkeren inbegrepen", "Comfortabel aankomen", "P"],
      [first(deal?.welcome_drink_included, deal?.welcome_drink), "Welkomstdrankje", "Een warm welkom", "◇"],
      [first(deal?.breakfast_included, deal?.breakfast), "Ontbijt inbegrepen", "Begin ontspannen aan de dag", "☕"]
    ].filter(([enabled]) => enabled === true || enabled === 1 || enabled === "true");

    if (!amenities.length) {
      return '<p class="preview-empty-copy">De inbegrepen onderdelen worden bij deze deal niet apart vermeld.</p>';
    }

    return `<div class="amenities-grid">${amenities.map(([, title, copy, icon]) => `
      <article class="amenity-card">
        <span class="amenity-icon">${escape(icon)}</span>
        <div><strong>${escape(title)}</strong><small>${escape(copy)}</small></div>
      </article>
    `).join("")}</div>`;
  }

  function renderError(message) {
    target.innerHTML = `
      <section class="preview-error">
        <p class="detail-section-label">Preview niet beschikbaar</p>
        <h1>De testpreview kon niet worden geladen.</h1>
        <p>${escape(message || "Probeer het opnieuw vanuit het dealoverzicht.")}</p>
        <a class="preview-back-link" href="deals.html">← Terug naar dealbeoordeling</a>
      </section>`;
  }

  function render(payload) {
    const preview = payload?.preview || {};
    const deal = payload?.deal || {};
    const hotel = payload?.hotel || deal?.hotel || {};
    const images = dealImages(deal);
    const stock = inventory(deal);
    const title = first(deal?.title, "Deal zonder titel");
    const category = first(deal?.category, deal?.deal_type, "SeasonDeal");
    const hotelName = first(hotel?.name, deal?.hotel_name, "SeasonDeals partner");
    const city = first(hotel?.city, deal?.city, hotel?.address, deal?.location);
    const description = first(deal?.description, deal?.short_description, deal?.summary, "Meer informatie over deze deal volgt.");
    const included = first(deal?.included, deal?.what_is_included, deal?.inclusions);
    const conditions = first(deal?.conditions, deal?.terms, deal?.cancellation_policy, "De definitieve voorwaarden worden vóór publicatie gecontroleerd.");
    const originalPrice = Number(first(deal?.original_price, deal?.regular_price, 0));
    const dealPrice = Number(first(deal?.deal_price, deal?.price, 0));
    const guests = Number(first(deal?.max_guests, deal?.guests, 2)) || 2;
    const status = first(deal?.status, "draft");
    const environment = first(deal?.integration_environment, "handmatig");

    document.title = `Testpreview: ${title} · SeasonDeals Admin`;
    document.getElementById("preview-back-top").href = `deal-detail.html?id=${encodeURIComponent(dealId)}`;

    const gallery = images.length
      ? `<div class="detail-photo"><img src="${escape(images[0])}" alt="${escape(title)}"></div>`
      : '<div class="preview-photo-placeholder">Geen afbeelding beschikbaar</div>';

    target.innerHTML = `
      <div class="detail-container preview-detail-container">
        <nav class="detail-breadcrumbs" aria-label="Broodkruimel">
          <a href="deals.html">Dealbeoordeling</a>
          <span>›</span>
          <a href="deal-detail.html?id=${encodeURIComponent(dealId)}">${escape(title)}</a>
          <span>›</span>
          <strong>Testpreview</strong>
        </nav>

        <span class="preview-watermark">TESTPREVIEW</span>
        <section class="detail-gallery preview-gallery">${gallery}</section>

        <header class="detail-heading">
          <p class="detail-kicker">${escape(category)}</p>
          <h1>${escape(title)}</h1>
          <div class="detail-subline">
            <strong>${escape(hotelName)}</strong>
            ${city ? `<span>·</span><span>${escape(city)}</span>` : ""}
          </div>
          <div class="preview-heading-tools">
            <span class="preview-mode-pill">Niet publiek · niet boekbaar</span>
            <span class="detail-stock">${stock === null ? "Voorraad niet vermeld" : `Actuele voorraad: ${escape(stock)}`}</span>
            <span class="detail-stock">Status: ${escape(core.statusLabel(status))}</span>
            <span class="detail-stock">Omgeving: ${escape(environment)}</span>
          </div>
        </header>

        <div class="detail-layout">
          <article class="detail-content">
            <section class="detail-section">
              <p class="detail-section-label">Over deze deal</p>
              <h2>Een bijzonder moment voor een mooie prijs.</h2>
              <p>${escape(description)}</p>
            </section>

            <section class="detail-section">
              <p class="detail-section-label">Dit is inbegrepen</p>
              <h2>Alles voor een zorgeloos verblijf.</h2>
              ${amenityCards(deal)}
              ${included ? `<p class="detail-copy-extra">${escape(included)}</p>` : ""}
            </section>

            <section class="detail-section">
              <p class="detail-section-label">Beschikbaarheid</p>
              <h2>Plan je verblijf.</h2>
              <div class="period-card">
                <strong>Geldige reisperiode</strong>
                <span>${escape(dateRange(deal))}</span>
              </div>
            </section>

            <section class="detail-section">
              <p class="detail-section-label">Voorwaarden</p>
              <h2>Goed om te weten.</h2>
              <div class="policy-card"><p>${escape(conditions)}</p></div>
            </section>
          </article>

          <aside class="booking-card preview-booking-card">
            <span class="preview-card-label">Admin testpreview</span>
            <div class="booking-price">
              ${originalPrice > dealPrice && originalPrice > 0 ? `<span class="booking-original">${escape(core.money(originalPrice))}</span>` : ""}
              <strong>${escape(core.money(dealPrice))}</strong>
              <small>voor maximaal ${escape(guests)} personen</small>
            </div>

            <div class="booking-fields">
              <label>Check-in<input type="date" disabled></label>
              <label>Check-out<input type="date" disabled></label>
              <label>Aantal gasten
                <select disabled><option>${escape(Math.min(guests, 1))} gast</option></select>
              </label>
            </div>

            <button class="button button-primary booking-submit" type="button" disabled>
              Boeken uitgeschakeld in testpreview
            </button>
            <div class="preview-warning">
              Deze beveiligde preview maakt geen betaling of bestelling aan en wijzigt de voorraad niet.
            </div>
          </aside>
        </div>
      </div>`;

    if (preview.enabled !== true || preview.public !== false || preview.bookable !== false) {
      renderError("Xano heeft geen geldige beveiligde previewmodus bevestigd.");
    }
  }

  async function init() {
    if (!dealId || !/^\d+$/.test(dealId)) {
      renderError("Er ontbreekt een geldig deal-ID.");
      return;
    }

    try {
      await core.requireAuth();
      const payload = await core.request(`/deals/${encodeURIComponent(dealId)}/preview`);
      render(payload);
    } catch (error) {
      renderError(error?.message);
    }
  }

  init();
})();
