(() => {
  "use strict";
  const KEY = "sd_cookie_consent_v1";
  const VERSION = 1;
  const COOKIE_POLICY_URL = /github\.io$/i.test(location.hostname) ? "cookies.html" : "/cookies";
  let consent = readConsent();
  applyConsent(consent);
  if (!consent) showBanner();
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-cookie-settings]");
    if (!trigger) return;
    event.preventDefault();
    openSettings();
  });

  function readConsent() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "null");
      return value && value.version === VERSION ? value : null;
    } catch { return null; }
  }

  function saveConsent(categories) {
    const previous = consent;
    consent = { version: VERSION, necessary: true, analytics: Boolean(categories.analytics), marketing: Boolean(categories.marketing), updated_at: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(consent));
    applyConsent(consent);
    document.querySelector(".sd-cookie-banner")?.remove();
    document.querySelector(".sd-cookie-modal")?.remove();
    if (previous && ((previous.analytics && !consent.analytics) || (previous.marketing && !consent.marketing))) location.reload();
  }

  function applyConsent(value) {
    const active = value || { necessary: true, analytics: false, marketing: false };
    document.documentElement.dataset.cookieAnalytics = String(Boolean(active.analytics));
    document.documentElement.dataset.cookieMarketing = String(Boolean(active.marketing));
    loadConfiguredScripts("analytics", active.analytics);
    loadConfiguredScripts("marketing", active.marketing);
    window.dispatchEvent(new CustomEvent("seasondeals:consent", { detail: active }));
  }

  function loadConfiguredScripts(category, allowed) {
    if (!allowed) return;
    const scripts = window.SEASONDEALS_COOKIE_SCRIPTS?.[category] || [];
    scripts.forEach((entry, index) => {
      const config = typeof entry === "string" ? { src: entry } : entry;
      const id = config.id || `sd-${category}-${index}`;
      if (!config.src || document.getElementById(id)) return;
      const script = document.createElement("script");
      script.id = id; script.src = config.src; script.async = config.async !== false;
      if (config.attributes) Object.entries(config.attributes).forEach(([key, value]) => script.setAttribute(key, value));
      document.head.appendChild(script);
    });
  }

  function showBanner() {
    const banner = document.createElement("section");
    banner.className = "sd-cookie-banner";
    banner.setAttribute("aria-label", "Cookievoorkeuren");
    banner.innerHTML = `<div><h2>Jij bepaalt wat we mogen meten</h2><p>SeasonDeals gebruikt noodzakelijke opslag om de website goed te laten werken. Analytische en marketingtechnieken blijven uit totdat je toestemming geeft. Lees meer in ons <a href="${COOKIE_POLICY_URL}">cookiebeleid</a>.</p></div><div class="sd-cookie-actions"><button type="button" data-cookie-necessary>Alleen noodzakelijk</button><button type="button" data-cookie-customize>Zelf kiezen</button><button class="is-primary" type="button" data-cookie-accept>Alles accepteren</button></div>`;
    document.body.appendChild(banner);
    banner.querySelector("[data-cookie-necessary]").addEventListener("click", () => saveConsent({ analytics: false, marketing: false }));
    banner.querySelector("[data-cookie-customize]").addEventListener("click", openSettings);
    banner.querySelector("[data-cookie-accept]").addEventListener("click", () => saveConsent({ analytics: true, marketing: true }));
  }

  function openSettings() {
    document.querySelector(".sd-cookie-modal")?.remove();
    const value = consent || { analytics: false, marketing: false };
    const modal = document.createElement("div");
    modal.className = "sd-cookie-modal";
    modal.innerHTML = `<div class="sd-cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="sd-cookie-title"><button class="sd-cookie-close" type="button" aria-label="Sluiten">×</button><span class="kicker orange">Privacyvriendelijke standaard</span><h2 id="sd-cookie-title">Cookievoorkeuren</h2><p>Kies welke categorieën SeasonDeals mag gebruiken. Noodzakelijke opslag staat altijd aan. Andere technieken worden alleen geladen na jouw toestemming.</p><div class="sd-cookie-options"><label class="sd-cookie-option"><div><strong>Noodzakelijk</strong><span>Nodig voor beveiliging, sessies, checkout en het onthouden van deze keuze.</span></div><input type="checkbox" checked disabled></label><label class="sd-cookie-option"><div><strong>Analytisch</strong><span>Helpt ons geanonimiseerd begrijpen welke pagina’s goed werken.</span></div><input name="analytics" type="checkbox"${value.analytics ? " checked" : ""}></label><label class="sd-cookie-option"><div><strong>Marketing</strong><span>Kan worden gebruikt om campagnes te meten of relevantere aanbiedingen te tonen.</span></div><input name="marketing" type="checkbox"${value.marketing ? " checked" : ""}></label></div><div class="sd-cookie-dialog-actions"><button type="button" data-cookie-reject>Alles weigeren</button><button class="is-primary" type="button" data-cookie-save>Voorkeuren opslaan</button></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector(".sd-cookie-close").addEventListener("click", close);
    modal.addEventListener("click", event => { if (event.target === modal) close(); });
    modal.querySelector("[data-cookie-reject]").addEventListener("click", () => saveConsent({ analytics: false, marketing: false }));
    modal.querySelector("[data-cookie-save]").addEventListener("click", () => saveConsent({ analytics: modal.querySelector('[name="analytics"]').checked, marketing: modal.querySelector('[name="marketing"]').checked }));
    modal.querySelector('[name="analytics"]').focus();
  }
})();
