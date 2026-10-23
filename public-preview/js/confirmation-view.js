(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('-') : 'Nog niet beschikbaar';
  const copy = {
    loading: ['Even controleren…', 'We halen de actuele status van je betaling en reservering op.'],
    pending_payment: ['Je betaling wordt gecontroleerd', 'We hebben nog geen definitieve betaalbevestiging ontvangen. Betaal niet opnieuw; deze pagina controleert de status automatisch.'],
    processing: ['Betaling ontvangen, reservering in behandeling', 'Je hotelboeking wordt verwerkt. Zodra het hotel is bevestigd, verschijnen hier je reserveringsgegevens. Boek of betaal niet opnieuw.'],
    confirmed: ['Je reservering is bevestigd', 'Je betaling is ontvangen en je verblijf is vastgelegd voor de onderstaande data.'],
    needs_attention: ['We controleren je reservering', 'Je reservering heeft extra controle nodig. Boek of betaal niet opnieuw. Neem contact op met onze klantenservice als je hulp nodig hebt.'],
    cancelled: ['Deze reservering is geannuleerd', 'Gebruik de eerdere voucher niet meer. Bekijk je e-mail of neem contact op met ons voor de annuleringsvoorwaarden en de status van een eventuele terugbetaling.'],
    unavailable: ['Bevestiging niet beschikbaar', 'Deze link ontbreekt, is verlopen of kan niet worden gecontroleerd. Bekijk je bevestigingsmail of neem contact op met onze klantenservice. Dit betekent niet dat je boeking is mislukt.'],
    interrupted: ['Je bent terug van de betaalpagina', 'Hiermee is niet vastgesteld of je betaling is afgerond. Bekijk je e-mail of neem contact op met ons voordat je opnieuw betaalt.'],
    timeout: ['We wachten nog op de bevestiging', 'De verwerking duurt langer dan verwacht. Je kunt de status opnieuw controleren. Boek of betaal niet opnieuw.'],
    network: ['De status kon niet worden opgehaald', 'Controleer je verbinding en probeer de status opnieuw op te halen. Boek of betaal niet opnieuw.']
  };
  function render(data = {}) {
    let state = Object.hasOwn(copy, data.state) ? data.state : 'unavailable';
    const b = data.booking;
    if (state === 'confirmed' && (data.schema_version !== 1 || data.environment !== 'sandbox' || data.payment_status !== 'paid' || !b?.booking_reference)) state = 'unavailable';
    const confirmed = state === 'confirmed';
    const [title, message] = copy[state];
    const row = (label, value) => `<div class="confirmation-row"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
    const amount = Number.isFinite(b?.amount) && b?.currency === 'EUR' ? new Intl.NumberFormat('nl-NL', {style:'currency',currency:'EUR'}).format(b.amount) : 'Zie bevestigingsmail';
    return `<div class="confirmation-state is-${state}" role="status"><span class="confirmation-symbol" aria-hidden="true">${confirmed ? '✓' : ['loading','pending_payment','processing'].includes(state) ? '◷' : 'i'}</span><p class="confirmation-eyebrow">JOUW RESERVERING</p><h1>${title}</h1><p class="confirmation-intro">${message}</p></div>${confirmed ? `<div class="confirmation-details"><section><h2>Je verblijf</h2><h3>${escape(b.hotel_name || 'Hotelnaam nog niet beschikbaar')}</h3><dl>${row('Aankomst',date(b.checkin))}${row('Vertrek',date(b.checkout))}${row('Gasten',b.guest_count ?? 'Zie bevestigingsmail')}${row('Betaald',amount)}${row('Boekingsnummer',b.booking_reference)}${b.hotel_confirmation ? row('Hotelbevestiging',b.hotel_confirmation) : ''}${row('Annulering',b.refundable_tag === 'NRFN' ? 'Niet-restitueerbaar' : 'Volgens je bevestigingsmail')}</dl><p class="confirmation-note">Gebruik bij het hotel je boekingsnummer en eventuele hotelbevestiging. Je hoeft deze data niet opnieuw te reserveren.</p></section><section class="confirmation-voucher"><p class="confirmation-eyebrow">SEASONDEALS-VOUCHER</p>${data.voucher?.code ? `<strong class="confirmation-code">${escape(data.voucher.code)}</strong><div id="confirmation-qr" aria-label="QR-code van je SeasonDeals-voucher"></div><p>Deze QR-code is voor de SeasonDeals-administratie. Het is geen scanbare hotelcode van Nuitée.</p>` : '<h3>Je voucher wordt klaargezet</h3><p>Je verblijf is bevestigd. De voucher verschijnt zodra de verwerking is afgerond.</p>'}<div class="confirmation-mail">${data.mail_status === 'sent' ? 'Je bevestigingsmail is verzonden. Controleer ook je spammap.' : 'Je bevestigingsmail is nog niet verzonden.'}</div></section></div>` : ''}<div class="confirmation-actions">${['network','timeout'].includes(state) ? '<button type="button" id="confirmation-retry">Status opnieuw controleren</button>' : ''}${confirmed ? '<button type="button" id="confirmation-print">Bevestiging afdrukken</button>' : ''}<a href="mailto:klantenservice@seasondeals.nl">Neem contact op</a></div>`;
  }
  const api = {render};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeasonDealsConfirmationView = api;
})(typeof window === 'undefined' ? globalThis : window);
