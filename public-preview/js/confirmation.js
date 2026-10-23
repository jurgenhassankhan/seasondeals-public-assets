(() => {
  'use strict';
  const container = document.getElementById('booking-confirmation');
  if (!container || !window.SeasonDealsConfirmationView) return;
  const config = window.SEASONDEALS_CONFIRMATION_CONFIG || {};
  const fragment = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const incoming = fragment.get('session_id') || query.get('session_id');
  const interrupted = fragment.get('cancelled') === '1';
  // Remove the capability before loading any optional assets or sending requests.
  if (location.hash || location.search) history.replaceState(null, '', location.pathname);
  let session = incoming;
  try {
    if (interrupted) sessionStorage.removeItem('sd-confirmation-session');
    if (incoming) sessionStorage.setItem('sd-confirmation-session', incoming);
    else if (!interrupted) session = sessionStorage.getItem('sd-confirmation-session');
  } catch (_) { /* Memory-only fallback when browser storage is disabled. */ }
  let timer, controller, sequence = 0, attempts = 0;
  function show(data) {
    container.innerHTML = window.SeasonDealsConfirmationView.render(data);
    document.getElementById('confirmation-print')?.addEventListener('click', () => window.print());
    document.getElementById('confirmation-retry')?.addEventListener('click', () => { attempts = 0; load(); });
    const target = document.getElementById('confirmation-qr');
    if (target && data.voucher?.code && typeof window.qrcode === 'function') {
      try { const qr = window.qrcode(0, 'M'); qr.addData(data.voucher.code); qr.make(); target.innerHTML = qr.createSvgTag({cellSize:4,margin:16,scalable:true}); }
      catch (_) { target.textContent = 'Gebruik de vouchercode hierboven.'; }
    }
  }
  async function load() {
    clearTimeout(timer); controller?.abort();
    const request = ++sequence;
    if (!/^cs_test_[A-Za-z0-9]{32,240}$/.test(session || '') || !config.endpoint) return show({state:interrupted ? 'interrupted' : 'unavailable'});
    let endpoint;
    try { endpoint = new URL(config.endpoint); } catch (_) { return show({state:'unavailable'}); }
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'xgrq-dkge-tace.n7e.xano.io' || !endpoint.pathname.endsWith('/supplier/confirmation-status')) return show({state:'unavailable'});
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint.href, {method:'POST',mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({session_id:session})});
      if (request !== sequence) return;
      if ([400,401,403,404].includes(response.status)) return show({state:'unavailable'});
      if (!response.ok) throw new Error('Status unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || data.environment !== 'sandbox') return show({state:'unavailable'});
      show(data);
      const wait = ['pending_payment','processing'].includes(data.state) || (data.state === 'confirmed' && (!data.voucher || data.mail_status !== 'sent'));
      if (wait && ++attempts < 24) timer = setTimeout(load, 5000);
      else if (wait && data.state !== 'confirmed') show({state:'timeout'});
    } catch (_) { if (request === sequence) show({state:'network'}); }
    finally { clearTimeout(timeout); }
  }
  window.addEventListener('pagehide', () => { clearTimeout(timer); sequence++; controller?.abort(); });
  show({state:'loading'});
  load();
})();
