(() => {
 'use strict';
 function mount(deal,supplier){
  if(supplier?.provider!=='nuitee'||supplier.environment!=='production')return;
  const aside=document.querySelector('.detail-sidebar');if(!aside)return;
  const core=window.AdminCore,esc=core.escapeHtml;
  const box=document.createElement('section');box.className='panel review-card';
  box.innerHTML='<h3>Aanbod bijwerken</h3><p>Haal het actuele aanbod voor dezelfde kamer en verblijfsdatums op. Bekijk eerst de verschillen voordat je ze overneemt.</p><button type="button" class="secondary-button">Aanbod bijwerken</button><p role="status" aria-live="polite"></p>';
  if(aside.firstElementChild)aside.firstElementChild.after(box);else aside.append(box);
  const open=box.querySelector('button'),status=box.querySelector('[role=status]');
  const money=v=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(v);
  function value(v,label){
   if(v==null||v==='')return 'Niet opgegeven';
   if(typeof v==='number')return /prijs|kosten|marge/i.test(label)?money(v):String(v);
   if(typeof v==='boolean')return v?'Ja':'Nee';
   if(Array.isArray(v))return v.length?v.map(x=>value(x,label)).join('\n'):'Geen';
   if(typeof v==='object'){
    if(v.cancelPolicyInfos)return [v.refundableTag==='RFN'?'Annuleerbaar volgens onderstaande voorwaarden':'Niet volledig restitueerbaar',...v.cancelPolicyInfos.map(x=>`${x.cancelTime} (${x.timezone}): ${money(x.amount)}`),...(v.hotelRemarks||[])].join('\n');
    if(v.currency&&typeof v.amount==='number')return `${v.description||v.name||'Heffing'}: ${money(v.amount)}${v.included===true?' (inbegrepen)':v.included===false?' (niet inbegrepen)':''}`;
    if(v.label)return [v.label,v.detail].filter(Boolean).join(' · ');
    return Object.entries(v).map(([k,x])=>`${k}: ${value(x,k)}`).join('\n');
   }
   return String(v);
  }
  async function request(action,token){return core.request(`/supplier-deals/${encodeURIComponent(deal.id)}/offer-update`,{method:'POST',body:JSON.stringify({deal_id:Number(deal.id),action,token:token||null})});}
  open.addEventListener('click',async()=>{
   open.disabled=true;status.textContent='Actueel aanbod en hotelfoto’s controleren…';
   try{
    const p=await request('preview');status.textContent='Voorstel opgehaald. Er is nog niets overgenomen.';
    const dialog=document.createElement('dialog');dialog.style.cssText='width:min(960px,94vw);max-height:90vh;border:0;border-radius:16px;padding:24px;color:#042821;box-shadow:0 20px 80px #0004';
    dialog.innerHTML=`<h2>Aanbod bijwerken — ${esc(p.hotel)}</h2><p>${esc(p.checkin)} t/m ${esc(p.checkout)} · ${esc(String(p.adults))} volwassenen · dezelfde kamer</p><p>Controleer de verschillen. Na overnemen ${p.next_status==='draft'?'blijft deze deal een concept':'gaat deze deal terug naar beoordeling en verdwijnt hij uit het aanbod'}.</p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>Onderdeel</th><th>Huidig</th><th>Nieuw</th></tr></thead><tbody>${p.rows.map(r=>`<tr style="background:${r.changed?'#fff1e6':'transparent'}"><th style="text-align:left;padding:12px;border-bottom:1px solid #ddd">${esc(r.label)}${r.changed?' · gewijzigd':''}</th><td style="white-space:pre-wrap;padding:12px;border-bottom:1px solid #ddd">${esc(value(r.before,r.label))}</td><td style="white-space:pre-wrap;padding:12px;border-bottom:1px solid #ddd">${esc(value(r.after,r.label))}</td></tr>`).join('')}</tbody></table></div><p>Nuitée kosten: ${money(p.nuitee_cost)} · Stripe kosten: ${money(p.stripe_cost)} · Verwacht overhouden: <strong>${money(p.estimated_margin)}</strong>${p.costs_estimated?' (kostenraming)':''}.</p><h3>Huidige hotelfoto’s</h3><div style="display:flex;gap:8px;flex-wrap:wrap">${p.previous_photos.map(url=>`<img src="${esc(url)}" alt="Huidige hotelfoto" style="width:150px;height:105px;object-fit:cover;border-radius:8px">`).join('')}</div><h3>Nieuwe gecontroleerde hotelfoto’s</h3><div style="display:flex;gap:8px;flex-wrap:wrap">${p.photos.map(url=>`<img src="${esc(url)}" alt="Gecontroleerde foto van dit hotel" style="width:150px;height:105px;object-fit:cover;border-radius:8px">`).join('')}</div><p>Dit voorstel is maximaal vijf minuten geldig. Bij bevestigen controleren we het aanbod opnieuw.</p><p role="status" aria-live="polite"></p><div style="display:flex;gap:12px"><button type="button" data-cancel class="secondary-button">Annuleren</button><button type="button" data-apply class="primary-button">Wijzigingen overnemen</button></div>`;
    document.body.append(dialog);dialog.showModal();
    dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('[data-cancel]').addEventListener('click',()=>dialog.close());
    const accept=dialog.querySelector('[data-apply]'),feedback=dialog.querySelector('[role=status]');
    accept.addEventListener('click',async()=>{
     accept.disabled=true;feedback.textContent='Aanbod opnieuw controleren en wijzigingen opslaan…';
     try{await request('apply',p.token);feedback.textContent='Bijgewerkt. De deal wordt opnieuw geladen.';window.location.reload();}
     catch(e){feedback.textContent=e.message||'Bijwerken is niet gelukt. Haal een nieuw voorstel op.';}
    });
   }catch(e){status.textContent=e.message||'Geen voorstel beschikbaar. De deal is ongewijzigd.';}
   finally{open.disabled=false;}
  });
 }
 window.SeasonDealsOfferUpdate={mount};
})();
