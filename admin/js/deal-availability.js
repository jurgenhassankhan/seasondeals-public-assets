/* Production Nuitée availability is independent of editorial workflow. */
(() => {
 'use strict';
 const labels={available:'Beschikbaar',unavailable:'Niet beschikbaar',expired:'Verlopen',unknown:'Controle niet gelukt',unchecked:'Nog niet gecontroleerd',stale:'Nieuwe controle nodig',conditions_changed:'Voorwaarden gewijzigd',price_blocked:'Prijs opnieuw beoordelen',mapping_required:'Aanbodgegevens controleren'};
 function label(a){return labels[a?.status]||labels.unchecked;}
 function html(a){const core=window.AdminCore;return `<strong>${core.escapeHtml(label(a))}</strong><p>${a?.checked_at?'Laatste controle: '+core.escapeHtml(core.date(a.checked_at,true)):'Nog geen controle uitgevoerd.'}</p>`;}
 async function mount(deal,supplier){
  if(supplier?.provider!=='nuitee'||supplier.environment!=='production')return;
  const aside=document.querySelector('.detail-sidebar');if(!aside)return;
  const section=document.createElement('section');section.className='panel review-card';section.innerHTML='<h3>Beschikbaarheid</h3><div role="status">Beschikbaarheid controleren…</div><button type="button" class="secondary-button">Opnieuw controleren</button>';aside.prepend(section);
  const status=section.querySelector('[role=status]'),button=section.querySelector('button');
  async function check(){button.disabled=true;const approve=document.getElementById('approve-deal');if(approve)approve.disabled=true;
   try{const a=await window.AdminCore.request(`/supplier-deals/${encodeURIComponent(deal.id)}/availability-status`,{method:'POST',body:JSON.stringify({deal_id:Number(deal.id)})});status.innerHTML=html(a);if(approve)approve.disabled=a.available!==true;
    if(a.available&&approve)setTimeout(()=>{if(approve.isConnected)approve.disabled=true;},Math.max(0,Math.min(60000,a.valid_until-Date.now())));
   }catch{status.innerHTML=html({status:'unknown'});}finally{button.disabled=false;}
  }
  button.addEventListener('click',check);window.SeasonDealsOfferUpdate?.mount(deal,supplier);window.SeasonDealsStayPreview?.mount(deal,supplier);window.SeasonDealsStayPolicy?.mount(deal,supplier);await check();
 }
 window.SeasonDealsAvailability={label,html,mount};
})();
