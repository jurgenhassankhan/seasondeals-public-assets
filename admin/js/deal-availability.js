/* Production Nuitée availability is independent of editorial workflow. */
(() => {
 'use strict';
 const labels={available:'Beschikbaar',unavailable:'Niet beschikbaar',expired:'Verlopen',unknown:'Controle niet gelukt',unchecked:'Nog niet gecontroleerd',stale:'Nieuwe controle nodig',conditions_changed:'Voorwaarden gewijzigd',price_blocked:'Prijs opnieuw beoordelen',mapping_required:'Aanbodgegevens controleren'};
 function label(a){return labels[a?.status]||labels.unchecked;}
 function html(a){const core=window.AdminCore;return `<strong>${core.escapeHtml(label(a))}</strong><p>${a?.checked_at?'Laatste controle: '+core.escapeHtml(core.date(a.checked_at,true)):'Nog geen controle uitgevoerd.'}</p>`;}
 async function mount(deal,supplier){
  if(supplier?.provider!=='nuitee'||supplier.environment!=='production')return;
  const aside=document.querySelector('.detail-sidebar');if(!aside)return;
  window.SeasonDealsAvailabilityOverview?.mount(deal,supplier);
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


/* Informational 45-day research. Never writes deal or supplier settings. */
(() => {
 'use strict';
 const DAYS=45, MAX_AGE=86400000;
 function today(now=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 }
 function addDays(day,n){return new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
 function dates(start,nights){return Array.from({length:DAYS},(_,i)=>({checkin:addDays(start,i),checkout:addDays(start,i+nights),status:'unchecked'}));}
 function summary(rows){
  const available=rows.filter(r=>r.status==='available').length;
  const unavailable=rows.filter(r=>r.status==='unavailable').length;
  const unknown=rows.length-available-unavailable;
  return {available,unavailable,unknown,low:unknown===0&&available<10};
 }
 function fingerprint(deal,supplier){
  // A change of room, occupancy, pricing or stay policy invalidates old observations.
  const m=supplier.supplier_mapping||{};
  const raw=JSON.stringify([deal.id,deal.price,deal.updated_at,supplier.provider,supplier.environment,supplier.supplier_hotel_id,supplier.pricing_config,m.hotel?.id,m.request,m.offer,m.stay_policy]);
  let h=2166136261;for(let i=0;i<raw.length;i++)h=Math.imul(h^raw.charCodeAt(i),16777619);
  return (h>>>0).toString(16);
 }
 function observation(p,row,dealId,guests,validPreview){
  if(!validPreview(p,dealId,row.checkin,row.checkout,guests))return {...row,status:'unknown',checked_at:Date.now()};
  // These are research prices with the backend's standard proposal, not a live selling-price quote.
  return {...row,status:['available','unavailable'].includes(p.status)?p.status:'unknown',checked_at:p.checked_at,
   proposal_price:p.status==='available'?Math.min(...p.options.map(o=>o.price)):null};
 }
 function restore(raw,start,nights,identity,now=Date.now()){
  try{
   const saved=JSON.parse(raw);
   if(saved?.version!==1||saved.start!==start||saved.nights!==nights||saved.identity!==identity||!Array.isArray(saved.rows)||saved.rows.length!==DAYS)return null;
   const expected=dates(start,nights);
   if(!saved.rows.every((r,i)=>r.checkin===expected[i].checkin&&r.checkout===expected[i].checkout&&['available','unavailable','unknown','unchecked'].includes(r.status)&&
    (r.status==='unchecked'||Number.isFinite(r.checked_at)&&r.checked_at<=now+5000&&now-r.checked_at<MAX_AGE)&&
    (r.status!=='available'||Number.isFinite(r.proposal_price)&&r.proposal_price>0)))return null;
   return saved.rows;
  }catch{return null;}
 }
 function mount(deal,supplier){
  const aside=document.querySelector('.detail-sidebar');
  if(!aside||document.getElementById('availability-overview')||supplier?.provider!=='nuitee'||supplier.environment!=='production')return;
  const core=window.AdminCore,esc=core.escapeHtml,guests=supplier.supplier_mapping?.request?.occupancies?.[0]?.adults;
  const identity=fingerprint(deal,supplier),storageKey='sd-availability-overview-v1-'+deal.id;
  const box=document.createElement('section');box.id='availability-overview';box.className='panel review-card';
  box.innerHTML='<h3>Beschikbaarheid komende 45 dagen</h3><p>Informatie voor jouw keuze tussen flexibel en vast verblijf. Je past de deal zelf aan.</p><label for="availability-overview-nights">Aantal nachten</label><select id="availability-overview-nights">'+Array.from({length:30},(_,i)=>`<option value="${i+1}">${i+1} ${i?'nachten':'nacht'}</option>`).join('')+'</select><p data-period></p><div data-summary role="status" aria-live="polite"></div><p data-progress></p><button type="button" class="secondary-button" data-start>Controleer 45 dagen</button> <button type="button" class="secondary-button" data-stop hidden>Stop controle</button><button type="button" class="secondary-button" data-reset hidden>Nieuwe volledige controle</button><p data-storage>Momentopname in deze browser, maximaal 24 uur bewaard. Geen automatische achtergrondcontrole. Beschikbaarheid kan wijzigen.</p><details><summary>Bekijk datums en prijsvoorstellen</summary><p>Voor dezelfde kamer en bezetting. Indicatieve totaalprijs per verblijf volgens het standaardprijsvoorstel van de controle; kan afwijken van je ingestelde verkoopprijs. Controleer de definitieve prijs en lokale kosten voordat je de deal aanpast.</p><div data-rows style="overflow:auto;max-height:420px"></div></details>';
  aside.prepend(box);
  const select=box.querySelector('select'),out=box.querySelector('[data-summary]'),progress=box.querySelector('[data-progress]'),list=box.querySelector('[data-rows]'),startButton=box.querySelector('[data-start]'),stopButton=box.querySelector('[data-stop]');
  let start=today(),nights=1,rows=dates(start,nights),running=false,stopped=false,errors=0,message='',storageOk=true;
  const controllers=new Set();
  function read(){
   start=today();rows=dates(start,nights);
   try{rows=restore(localStorage.getItem(storageKey),start,nights,identity)||rows;}catch{storageOk=false;}
  }
  function save(){try{localStorage.setItem(storageKey,JSON.stringify({version:1,start,nights,identity,rows}));}catch{storageOk=false;}}
  function render(){
   const s=summary(rows),checked=rows.filter(r=>r.checked_at).length;
   const times=rows.map(r=>r.checked_at).filter(Number.isFinite);
   box.querySelector('[data-period]').textContent=`Aankomst ${start} t/m ${addDays(start,44)} · ${nights} ${nights===1?'nacht':'nachten'} · ${guests||'?'} personen`;
   out.style.cssText=`padding:12px;border-radius:8px;background:${s.low?'#fff3df':'#f2f5f7'};color:${s.low?'#8a4600':'#243746'}`;
   out.innerHTML=`<strong>${s.available} van 45 aankomstdagen beschikbaar</strong><br>${s.unavailable} niet beschikbaar · ${s.unknown} onbekend/nog te controleren`+
    (s.low?'<p>Let op: minder dan 10 beschikbare aankomstdagen. Overweeg vaste datums.</p>':s.unknown?'<p>Controle nog onvolledig; het aanbod kan groter zijn.</p>':'<p>Er is aanbod op minstens 10 aankomstdagen.</p>')+
    (times.length?`<p>Gecontroleerd tussen ${esc(core.date(Math.min(...times),true))} en ${esc(core.date(Math.max(...times),true))}.</p>`:'');
   progress.textContent=running?`Nuitée controleren: ${checked}/45 datums. Dit kan enkele minuten duren. ${message}`:message||'Klik op Controleer 45 dagen om het aanbod op te halen.';
   startButton.disabled=running;select.disabled=running;stopButton.hidden=!running;
   startButton.textContent=checked&&s.unknown?'Controle hervatten':checked?'Opnieuw controleren':'Controleer 45 dagen';
   box.querySelector('[data-reset]').hidden=running||!checked;
   box.querySelector('[data-storage]').textContent=storageOk?'Momentopname in deze browser, maximaal 24 uur bewaard. Geen automatische achtergrondcontrole. Beschikbaarheid kan wijzigen.':'Opslaan in deze browser niet mogelijk. Resultaten blijven zichtbaar zolang deze pagina openstaat.';
   const labels={available:'Beschikbaar',unavailable:'Geen passend aanbod',unknown:'Controle niet gelukt',unchecked:'Nog niet gecontroleerd'};
   list.innerHTML='<table><thead><tr><th>Aankomst / vertrek</th><th>Uitkomst / voorstel</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${esc(r.checkin)}<br>${esc(r.checkout)}</td><td>${labels[r.status]}${r.status==='available'?'<br>'+esc(core.money(r.proposal_price)):''}</td></tr>`).join('')+'</tbody></table>';
  }
  function cancel(){stopped=true;for(const c of controllers)c.abort();}
  stopButton.addEventListener('click',()=>{message='Controle gestopt. Niet afgeronde datums blijven onbekend.';cancel();});
  select.addEventListener('change',()=>{nights=Number(select.value);read();message='';render();});
  window.addEventListener('pagehide',cancel,{once:true});
  box.querySelector('[data-reset]').addEventListener('click',()=>{if(running)return;start=today();rows=dates(start,nights);message='Klaar voor een nieuwe volledige controle.';save();render();});
  startButton.addEventListener('click',async()=>{
   if(running)return;
   const current=today();
   if(start!==current||!summary(rows).unknown||rows.some(r=>r.checked_at&&Date.now()-r.checked_at>=MAX_AGE)){start=current;rows=dates(start,nights);}
   running=true;stopped=false;errors=0;message='';save();render();
   // Finish unqueried dates first; already confirmed observations survive a paused scan.
   const pending=rows.map((r,i)=>({r,i})).filter(x=>['unchecked','unknown'].includes(x.r.status)).sort((a,b)=>(a.r.status==='unknown')-(b.r.status==='unknown')).map(x=>x.i);
   let cursor=0;
   async function worker(){
    while(!stopped&&box.isConnected&&cursor<pending.length){
     const index=pending[cursor++],row=rows[index],controller=new AbortController();controllers.add(controller);
     const timer=setTimeout(()=>controller.abort(),45000);
     try{
      const p=await core.request(`/supplier-deals/${encodeURIComponent(deal.id)}/stay-preview`,{method:'POST',body:JSON.stringify({deal_id:Number(deal.id),checkin:row.checkin,checkout:row.checkout}),signal:controller.signal});
      if(stopped)break;
      rows[index]=observation(p,row,Number(deal.id),guests,window.SeasonDealsStayPreview.validPreview);
      if(rows[index].status==='unknown')errors++;else errors=0;
     }catch(e){
      if(stopped)break;
      rows[index]={...row,status:'unknown',checked_at:Date.now()};errors++;
      if([401,403,429].includes(e.status))errors=3;
     }finally{clearTimeout(timer);controllers.delete(controller);}
     if(errors>=3){message='Controle gepauzeerd na meerdere mislukte aanvragen. Probeer later opnieuw; onbekend betekent niet uitverkocht.';cancel();}
     save();render();
    }
   }
   try{await Promise.all([worker(),worker()]);}finally{
    running=false;save();if(!message)message=summary(rows).unknown?'Controle afgerond met onbekende datums.':'Alle 45 aankomstdagen gecontroleerd.';render();
   }
  });
  read();render();
 }
 window.SeasonDealsAvailabilityOverview={mount,today,addDays,dates,summary,fingerprint,observation,restore};
})();
