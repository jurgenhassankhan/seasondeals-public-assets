(function () {
  "use strict";

  const USER_KEY = "sd_partner_user";
  const rooms = [
    { name: "Standard Room", code: "SM-STANDARD", guests: 2, price: 119, available: 8 },
    { name: "Deluxe Room", code: "SM-DELUXE", guests: 2, price: 159, available: 5 },
    { name: "Family Room", code: "SM-FAMILY", guests: 4, price: 189, available: 3 }
  ];

  function readUser() {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "{}"); }
    catch { return {}; }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
    });
  }

  function money(value) {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(value);
  }

  function demoMarkup() {
    const user = readUser();
    const hotel = user.hotel_name || (user.hotel && user.hotel.name) || "Jouw hotel";
    const hotelId = (user.hotel && user.hotel.id) || user.hotel_id || "DEMO";
    return `<section class="sd-sm-demo" data-sm-demo>
      <div class="sd-sm-hero">
        <div class="sd-sm-hero-copy">
          <div class="sd-sm-kicker"><span class="sd-sm-logo">S</span><span>SiteMinder</span><span class="sd-sm-demo-label">Demo / test</span></div>
          <h2>Bekijk hoe een hotelkoppeling straks werkt</h2>
          <p>Deze technische demonstratie gebruikt veilige voorbeelddata. Er wordt niets naar SiteMinder verstuurd en er wordt geen deal opgeslagen of gepubliceerd.</p>
          <div class="sd-sm-actions">
            <button class="sd-primary-button" type="button" data-sm-start>Demo uitvoeren</button>
            <span class="sd-sm-adapter-state"><i></i>Xano demo-adapter gepubliceerd</span>
          </div>
        </div>
        <div class="sd-sm-connection" aria-label="Demoverbinding">
          <div><span>SeasonDeals</span><strong>Connector Framework</strong></div>
          <div class="sd-sm-link"><i></i><i></i><i></i></div>
          <div><span>SiteMinder</span><strong>Demo-omgeving</strong></div>
        </div>
      </div>

      <div class="sd-sm-progress" aria-label="Voortgang demo">
        <div class="is-ready" data-sm-step="1"><span>1</span><div><strong>Connector</strong><small>Framework gereed</small></div></div>
        <div data-sm-step="2"><span>2</span><div><strong>Hotel</strong><small>Wacht op demo</small></div></div>
        <div data-sm-step="3"><span>3</span><div><strong>Kamers & tarieven</strong><small>Wacht op demo</small></div></div>
        <div data-sm-step="4"><span>4</span><div><strong>Deal-kandidaat</strong><small>Wacht op demo</small></div></div>
      </div>

      <div class="sd-sm-results" data-sm-results hidden>
        <div class="sd-sm-summary">
          <div class="sd-sm-section-head"><div><span class="sd-page-eyebrow">Demoresultaat</span><h3>${escapeHtml(hotel)}</h3></div><span class="sd-sm-connected"><i></i>Demo verbonden</span></div>
          <dl>
            <div><dt>Extern hotel-ID</dt><dd>SM-DEMO-${escapeHtml(hotelId)}</dd></div>
            <div><dt>Omgeving</dt><dd>Test / simulatie</dd></div>
            <div><dt>Valuta</dt><dd>EUR</dd></div>
            <div><dt>Sync-modus</dt><dd>Alleen voorbeeld</dd></div>
          </dl>
        </div>

        <div class="sd-sm-room-panel">
          <div class="sd-sm-section-head"><div><span class="sd-page-eyebrow">Kamertypes</span><h3>Beschikbare voorbeelddata</h3></div><span class="sd-sm-count">3 gevonden</span></div>
          <div class="sd-sm-table-wrap"><table><thead><tr><th>Kamertype</th><th>Externe code</th><th>Gasten</th><th>Prijs</th><th>Voorraad</th></tr></thead><tbody>${rooms.map(function (room) { return `<tr><td><strong>${room.name}</strong></td><td><code>${room.code}</code></td><td>${room.guests}</td><td>${money(room.price)}</td><td><span class="sd-sm-stock">${room.available} beschikbaar</span></td></tr>`; }).join("")}</tbody></table></div>
        </div>

        <div class="sd-sm-bottom-grid">
          <div class="sd-sm-sync-panel">
            <div class="sd-sm-section-head"><div><span class="sd-page-eyebrow">Synchronisatie</span><h3>Demo-overzicht</h3></div></div>
            <div class="sd-sm-sync-list">
              <div><span>Prijzen</span><strong><i></i>3 ontvangen</strong></div>
              <div><span>Beschikbaarheid</span><strong><i></i>16 kamers</strong></div>
              <div><span>Boekingen</span><strong class="is-neutral">Niet verzonden</strong></div>
              <div><span>Automatische sync</span><strong class="is-neutral">Uit in demo</strong></div>
            </div>
          </div>
          <div class="sd-sm-candidate">
            <div class="sd-sm-section-head"><div><span class="sd-page-eyebrow">Deal-kandidaat</span><h3>Deluxe City Escape</h3></div><span class="sd-sm-ready">Gereed als voorbeeld</span></div>
            <p>2 personen · Deluxe Room · verblijf t/m 31 december 2026</p>
            <div class="sd-sm-price"><span><s>${money(159)}</s><strong>${money(129)}</strong> per nacht</span><small>5 kamers als voorbeeldvoorraad</small></div>
            <button class="sd-secondary-button" type="button" data-sm-candidate>Bekijk conceptgegevens</button>
          </div>
        </div>
      </div>
      <p class="sd-sm-disclaimer"><strong>Let op:</strong> dit is geen officiële of gecertificeerde live SiteMinder-verbinding. De echte provider-HTTP-koppeling en certificering volgen in een latere fase.</p>
    </section>`;
  }

  function candidateDialog() {
    const modal = document.createElement("div");
    modal.className = "sd-booking-modal is-open";
    modal.innerHTML = `<div class="sd-booking-dialog sd-sm-dialog"><button class="sd-modal-close" type="button" aria-label="Sluiten">×</button><span class="sd-page-eyebrow">Voorbeeld uit demo-adapter</span><h2>Conceptdeal-kandidaat</h2><div class="sd-sm-dialog-grid"><div><span>Titel</span><strong>Deluxe City Escape</strong></div><div><span>Kamertype</span><strong>Deluxe Room</strong></div><div><span>Externe code</span><strong>SM-DELUXE</strong></div><div><span>Voor gasten</span><strong>2 personen</strong></div><div><span>Originele prijs</span><strong>${money(159)}</strong></div><div><span>Voorstel dealprijs</span><strong>${money(129)}</strong></div><div><span>Voorbeeldvoorraad</span><strong>5 kamers</strong></div><div><span>Status</span><strong>Niet opgeslagen</strong></div></div><p>Deze gegevens tonen alleen wat de connector aan SeasonDeals kan aanleveren. Er is geen conceptdeal aangemaakt en niets is gepubliceerd.</p><button class="sd-primary-button" type="button" data-sm-close>Sluiten</button></div>`;
    (document.getElementById("sd-partner-app") || document.body).appendChild(modal);
    const close = function () { modal.remove(); };
    modal.querySelector(".sd-modal-close").addEventListener("click", close);
    modal.querySelector("[data-sm-close]").addEventListener("click", close);
    modal.addEventListener("click", function (event) { if (event.target === modal) close(); });
  }

  function runDemo(section) {
    const button = section.querySelector("[data-sm-start]");
    const results = section.querySelector("[data-sm-results]");
    const steps = Array.from(section.querySelectorAll("[data-sm-step]"));
    button.disabled = true;
    button.textContent = "Demo wordt uitgevoerd…";
    results.hidden = true;
    steps.slice(1).forEach(function (step) { step.classList.remove("is-ready", "is-active"); step.querySelector("small").textContent = "Wacht op demo"; });

    const updates = [
      { delay: 250, index: 1, text: "Voorbeeldhotel geladen" },
      { delay: 650, index: 2, text: "3 kamertypes geladen" },
      { delay: 1050, index: 3, text: "Voorstel samengesteld" }
    ];
    updates.forEach(function (update, position) {
      window.setTimeout(function () {
        steps[update.index].classList.add("is-active");
        window.setTimeout(function () {
          steps[update.index].classList.remove("is-active");
          steps[update.index].classList.add("is-ready");
          steps[update.index].querySelector("small").textContent = update.text;
          if (position === updates.length - 1) {
            results.hidden = false;
            button.disabled = false;
            button.textContent = "Demo opnieuw uitvoeren";
            results.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }, 260);
      }, update.delay);
    });
  }

  function injectDemo() {
    if (document.querySelector("[data-sm-demo]")) return;
    const guide = document.querySelector(".sd-api-guide");
    if (!guide) return;
    guide.insertAdjacentHTML("beforebegin", demoMarkup());
    const section = document.querySelector("[data-sm-demo]");
    section.querySelector("[data-sm-start]").addEventListener("click", function () { runDemo(section); });
    section.querySelector("[data-sm-candidate]").addEventListener("click", candidateDialog);
  }

  const observer = new MutationObserver(injectDemo);
  observer.observe(document.getElementById("sd-partner-app"), { childList: true, subtree: true });
  injectDemo();
}());
