(() => {
 'use strict';
 function validPreview(p,dealId,checkin,checkout,guests,now=Date.now()) {
  if(!p||p.deal_id!==dealId||p.checkin!==checkin||p.checkout!==checkout||p.guests!==guests||p.nights!==(Date.parse(checkout)-Date.parse(checkin))/86400000||p.currency!=='EUR'||p.can_book!==false||p.applied!==false||p.requires_owner_approval!==true)return false;
  if(!Number.isFinite(p.checked_at)||!Number.isFinite(p.valid_until)||p.checked_at>now+5000||p.valid_until<=now||p.valid_until<=p.checked_at||p.valid_until-p.checked_at>60000)return false;
  if(!['available','unavailable','unknown','price_review_required'].includes(p.status)||!Array.isArray(p.options)||p.options.length>6)return false;
  if(p.status!=='available')return p.options.length===0;
  return p.options.length>0&&Number.isFinite(p.current_price)&&p.current_price>0&&p.options.every(o=>o&&['room','board','cancellation'].every(k=>typeof o[k]==='string')&&['price','base','break_even'].every(k=>Number.isFinite(o[k])&&o[k]>0)&&['nuitee_cost','stripe_cost','estimated_margin'].every(k=>Number.isFinite(o[k])&&o[k]>=0)&&Math.abs(o.price-o.base-o.nuitee_cost-o.stripe_cost-o.estimated_margin)<0.011);
 }
 function mount(deal,supplier){
  if(supplier?.provider!=='nuitee'||supplier.environment!=='production')return;
  const aside=document.querySelector('.detail-sidebar');if(!aside)return;
  const core=window.AdminCore,esc=core.escapeHtml,money=v=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(v);
  const box=document.createElement('section');box.className='panel review-card';
  box.innerHTML='<h3>Andere verblijfsduur onderzoeken</h3><p>Controleer de actuele prijs voor dezelfde kamer en bezetting op andere datums. Dit wijzigt of publiceert de deal niet.</p><form><label>Aankomst<input name="checkin" type="date" required></label><label>Vertrek<input name="checkout" type="date" required></label><button class="secondary-button" type="submit">Prijsvoorstel ophalen</button></form><div role="status" aria-live="polite"></div>';
  aside.append(box);const form=box.querySelector('form'),button=form.querySelector('button'),out=box.querySelector('[role=status]');
  const dates=supplier.supplier_mapping?.request; if(dates){form.elements.checkin.value=dates.checkin||'';form.elements.checkout.value=dates.checkout||'';}
  let serial=0,timer;form.addEventListener('input',()=>{serial++;clearTimeout(timer);out.textContent='';button.disabled=false;});
  form.addEventListener('submit',async event=>{
   event.preventDefault();const checkin=form.elements.checkin.value,checkout=form.elements.checkout.value,nights=(Date.parse(checkout)-Date.parse(checkin))/86400000;
   if(!checkin||!checkout||!Number.isInteger(nights)||nights<1||nights>30){out.textContent='Kies een verblijf van 1–30 nachten.';return;}
   clearTimeout(timer);const id=++serial;button.disabled=true;out.textContent='Nuitée-aanbod controleren…';
   try {
    const p=await core.request(`/supplier-deals/${encodeURIComponent(deal.id)}/stay-preview`,{method:'POST',body:JSON.stringify({deal_id:Number(deal.id),checkin,checkout})});
    if(id!==serial)return;
    if(!validPreview(p,Number(deal.id),checkin,checkout,dates?.occupancies?.[0]?.adults))throw Error('Voorstel niet bevestigd of verlopen. Controleer opnieuw.');
    if(p.status!=='available'||!p.options?.length){out.textContent=p.message||'Geen bevestigd aanbod voor deze datums.';return;}
    out.innerHTML=`<p><strong>${nights} nachten · ${p.guests} personen</strong></p><p>Huidige vaste dealprijs: ${money(p.current_price)}. ${p.proposed_pricing?.calculation_basis==='base_markup_v1'?'Nieuwe prijs volgt de goedgekeurde standaard: het hoogste van €20 of 10% op inkoop, plus Nuitée- en Stripekosten.':'Dit voorstel gebruikt nog de bestaande prijsregel; de nieuwe standaard is nog niet aangesloten.'} Er is nog niets overgenomen.</p>`+p.options.map(o=>`<div class="panel"><p><strong>${esc(o.room)} · ${esc(o.board)}</strong></p><p>Voorstel: <strong>${money(o.price)}</strong><br>Inkoop: ${money(o.base)}<br>Nuitée: ${money(o.nuitee_cost)}<br>Stripe: ${money(o.stripe_cost)}<br>Verwachte marge: ${money(o.estimated_margin)}<br>Geschatte kostendekkende prijs: ${money(o.break_even)}</p><p>${esc(o.cancellation)}</p></div>`).join('')+'<p>Kosten zijn ramingen. Dit onderzoek verandert geen prijzen, periode of publicatiestatus.</p>';
    timer=setTimeout(()=>{if(id===serial)out.textContent='Voorstel verlopen. Haal opnieuw een actuele prijs op.';},Math.max(0,p.valid_until-Date.now()));
   } catch(e){if(id===serial)out.textContent=e.message||'Prijscontrole mislukt.';}
   finally{if(id===serial)button.disabled=false;}
  });
 }
 window.SeasonDealsStayPreview={mount,validPreview};
})();
