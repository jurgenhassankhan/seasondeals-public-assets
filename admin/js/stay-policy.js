(() => {
 'use strict';
 function validView(v,id) {
  const policy=p=>p===null||(p&&['fixed','flexible'].includes(p.mode)&&typeof p.start==='string'&&typeof p.end==='string'&&typeof p.public_enabled==='boolean'&&(p.mode==='fixed'||Number.isInteger(p.min_nights)&&Number.isInteger(p.max_nights)&&p.min_nights>=1&&p.max_nights>=p.min_nights&&p.max_nights<=30));
  return !!v&&v.deal_id===id&&Number.isInteger(v.revision)&&v.revision>=0&&v.can_book===false&&typeof v.activation_available==='boolean'&&policy(v.draft)&&policy(v.confirmed)&&typeof v.room==='string'&&typeof v.board==='string';
 }
 async function mount(deal,supplier) {
  if(supplier?.provider!=='nuitee'||supplier.environment!=='production')return;
  const aside=document.querySelector('.detail-sidebar');if(!aside)return;
  const core=window.AdminCore,esc=core.escapeHtml,id=Number(deal.id);
  const box=document.createElement('section');box.className='panel review-card';
  box.innerHTML='<h3>Verblijfsperiode beheren</h3><p>Bewaar en bevestig een vaste of flexibele periode. Hotel, kamer, verzorging, bezetting en bestaande vaste prijs blijven behouden. Bevestigen publiceert de deal niet. Activeren toont uitsluitend een datumkeuze; boeken blijft gesloten.</p><form><label>Type verblijf<select name="mode"><option value="fixed">Vast arrangement</option><option value="flexible">Flexibele verblijfsduur</option></select></label><fieldset><legend>Flexibele periode</legend><label>Eerste aankomst<input type="date" name="start" required></label><label>Laatste vertrek<input type="date" name="end" required></label><label>Minimum nachten<input type="number" name="min_nights" min="1" max="30" required></label><label>Maximum nachten<input type="number" name="max_nights" min="1" max="30" required></label></fieldset><p>Nieuwe flexibele prijzen: MAX(€20, 10% van inkoop) marge, plus €2,30 Nuitée en 3,15% + €0,25 Stripe. Kosten zijn ramingen.</p><button type="submit" class="secondary-button" disabled>Periode opslaan als concept</button></form><div class="policy-summary"></div><button type="button" class="secondary-button" data-confirm disabled>Opgeslagen periode bevestigen</button><button type="button" class="secondary-button" data-activate disabled>Datumkeuze activeren</button><button type="button" class="secondary-button" data-deactivate disabled>Datumkeuze uitschakelen</button><button type="button" class="secondary-button" data-reload>Opnieuw laden</button><div role="status" aria-live="polite"></div>';
  aside.append(box);
  const form=box.querySelector('form'),fields=form.querySelector('fieldset'),save=form.querySelector('button'),confirm=box.querySelector('[data-confirm]'),reload=box.querySelector('[data-reload]'),status=box.querySelector('[role=status]'),summary=box.querySelector('.policy-summary');
  const activate=box.querySelector('[data-activate]'),deactivate=box.querySelector('[data-deactivate]');
  let view=null,busy=false,dirty=false;
  const describe=p=>p?`${p.mode==='fixed'?'Vast arrangement':'Flexibel'}: ${esc(p.start)} t/m ${esc(p.end)}${p.mode==='flexible'?` · ${p.min_nights}–${p.max_nights} nachten`:''}`:'Niet ingesteld';
  const buttons=()=>{save.disabled=busy||!view;confirm.disabled=busy||dirty||!view?.draft;activate.disabled=busy||dirty||!view?.activation_available||view?.confirmed?.public_enabled;deactivate.disabled=busy||!view?.confirmed?.public_enabled;reload.disabled=busy;fields.disabled=busy||form.elements.mode.value==='fixed';form.elements.mode.disabled=busy;};
  function render(v){view=v;dirty=false;const p=v.draft||v.confirmed;form.elements.mode.value=p?.mode||'fixed';form.elements.start.value=p?.start||supplier.supplier_mapping?.request?.checkin||'';form.elements.end.value=p?.end||supplier.supplier_mapping?.request?.checkout||'';form.elements.min_nights.value=p?.min_nights||1;form.elements.max_nights.value=p?.max_nights||3;summary.innerHTML=`<p>${esc(v.room)} · ${esc(v.board)} · ${esc(String(v.guests))} personen</p><p>Opgeslagen concept: ${describe(v.draft)}</p><p>Bevestigd: ${describe(v.confirmed)}</p><p>Publieke datumkeuze: ${v.confirmed?.public_enabled?'ingeschakeld':'uitgeschakeld'}. Boeken blijft gesloten.</p>`;buttons();}
  async function request(action){busy=true;buttons();status.textContent='Verblijfsperiode verwerken…';try{
   const body={deal_id:id,action};if(action!=='read')body.revision=view.revision;
   if(action==='save')body.policy={mode:form.elements.mode.value,start:form.elements.start.value,end:form.elements.end.value,min_nights:Number(form.elements.min_nights.value),max_nights:Number(form.elements.max_nights.value)};
   const value=await core.request(`/supplier-deals/${encodeURIComponent(id)}/stay-policy`,{method:'POST',body:JSON.stringify(body)});
   if(!validView(value,id))throw Error('Periode kon niet veilig worden bevestigd. Laad opnieuw.');render(value);status.textContent=action==='activate'?'Datumkeuze geactiveerd. Boeken blijft gesloten.':action==='deactivate'?'Datumkeuze uitgeschakeld.':action==='confirm'?'Periode bevestigd. Nog niet publiek geactiveerd.':action==='save'?'Concept opgeslagen. Controleer de periode en bevestig.':'Periode geladen.';
  }catch(e){view=null;status.textContent=(e.message||'Periodebeheer niet bereikbaar.')+' Gebruik Opnieuw laden voordat je verdergaat.';}finally{busy=false;buttons();}}
  form.addEventListener('input',()=>{dirty=true;buttons();});form.addEventListener('change',()=>{dirty=true;buttons();});
  form.addEventListener('submit',e=>{e.preventDefault();if(!busy&&view)request('save');});confirm.addEventListener('click',()=>{if(!busy&&!dirty&&view?.draft)request('confirm');});reload.addEventListener('click',()=>request('read'));
  activate.addEventListener('click',()=>{if(!activate.disabled)request('activate');});deactivate.addEventListener('click',()=>{if(!deactivate.disabled)request('deactivate');});
  await request('read');
 }
 window.SeasonDealsStayPolicy={mount,validView};
})();
