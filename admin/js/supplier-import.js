(() => {
 'use strict';
 const core=window.AdminCore,$=id=>document.getElementById(id),form=$('import-search');
 let busy=false,stop=false,rows=[],jobs=[],messages=[],selected=new Set(),page=0,plan=null,presetKey='',report=[],facilityChoices=[];
 const esc=core.escapeHtml,money=core.money;
 const field=name=>form.elements.namedItem(name);
 const split=value=>[...new Set(value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean))];
 const rowKey=x=>JSON.stringify([x.hotel_id,x.checkin,x.checkout,x.signature]);
 function period(checkin='',checkout=''){
  if($('import-periods').children.length>=10)throw Error('Maximaal 10 periodes per zoekopdracht.');
  const div=document.createElement('div');div.className='period-row';
  div.innerHTML='<label>Inchecken<input type="date" name="checkin" required></label><label>Uitchecken<input type="date" name="checkout" required></label><button type="button" class="secondary-button">Verwijderen</button>';
  div.querySelector('[name=checkin]').value=checkin;div.querySelector('[name=checkout]').value=checkout;
  div.querySelector('button').onclick=()=>{if($('import-periods').children.length>1)div.remove();};$('import-periods').append(div);
 }
 function read(){
  if(!form.reportValidity())throw Error('Vul de zoekvelden volledig in.');
  const cities=split(field('cities').value),periods=[...$('import-periods').children].map(x=>({checkin:x.querySelector('[name=checkin]').value,checkout:x.querySelector('[name=checkout]').value}));
  if(!cities.length||cities.length>20)throw Error('Kies 1–20 plaatsen.');
  const data={country:field('country').value.toUpperCase(),cities,periods,adults:Number(field('adults').value),rooms:1,children:[],hotel_name:field('hotel_name').value.trim(),board:field('board').value,cancellation:field('cancellation').value,stars:[...field('stars').selectedOptions].map(x=>Number(x.value)),facilities:[...field('facilities').selectedOptions].map(x=>Number(x.value)),excluded:split(field('excluded').value),pricing:{},target:Number(field('target').value),per_city:Number(field('per_city').value),unique_hotels:field('unique_hotels').checked};
  for(const k of ['min_rating','min_reviews','max_base','max_price'])data[k]=Number(field(k).value||0);
  for(const k of ['markup_percentage','min_margin_amount','processing_fee','stripe_fee_percentage','stripe_fee_fixed'])data.pricing[k]=Number(field(k).value);
  for(const p of periods){const a=Date.parse(p.checkin+'T00:00:00Z'),b=Date.parse(p.checkout+'T00:00:00Z');if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>30*86400000)throw Error('Kies periodes van 1–30 nachten.');}
  return data;
 }
 function apply(p){
  for(const k of ['country','adults','hotel_name','board','cancellation','min_rating','min_reviews','max_base','max_price','target','per_city'])if(p[k]!=null)field(k).value=p[k];
  field('cities').value=(p.cities||[]).join(', ');field('excluded').value=(p.excluded||[]).join('\n');field('unique_hotels').checked=p.unique_hotels!==false;
  $('facility-search').value='';renderFacilities();
  for(const k of ['stars','facilities'])for(const o of field(k).options)o.selected=(p[k]||[]).includes(Number(o.value));
  for(const [k,v] of Object.entries(p.pricing||{}))if(field(k))field(k).value=v;
  $('import-periods').replaceChildren();for(const p1 of (p.periods||[]).slice(0,10))period(p1.checkin,p1.checkout);if(!$('import-periods').children.length)period();
 }
 function status(text,error=false){$('import-message').textContent=text;$('import-message').classList.toggle('import-error',error);}
 function setBusy(v){busy=v;$('search-fields').disabled=v;$('stop-import').hidden=!v;for(const id of ['more-results','suggest-selection','clear-selection','commit-selection'])$(id).disabled=v;render();}
 async function request(path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),125000);try{return await core.request(path,{method:'POST',body:JSON.stringify(body),signal:controller.signal});}finally{clearTimeout(timer);}}
 function render(){
  $('results-panel').hidden=!plan;$('selected-count').textContent=selected.size+' geselecteerd';
  $('result-summary').textContent=`${rows.length} tariefopties gevonden. Doel: ${plan?.target||0} deals, maximaal ${plan?.per_city||0} per plaats. Dezelfde kamer kan meerdere tarieven hebben.`;
  const max=Math.max(1,Math.ceil(rows.length/30));page=Math.min(page,max-1);$('results-page').textContent=`Pagina ${page+1} van ${max}`;$('prev-results').disabled=page===0;$('next-results').disabled=page>=max-1;
  $('import-results').innerHTML=rows.slice(page*30,(page+1)*30).map((r,i)=>{
   const idx=page*30+i,exists=r.existing_deal_id;
   return `<article class="import-offer${exists?' existing':''}"><input type="checkbox" aria-label="${esc(r.hotel_name+' '+r.room)}" data-index="${idx}" ${selected.has(rowKey(r))?'checked':''} ${busy||exists?'disabled':''}><div><h3>${esc(r.hotel_name)}</h3><p>${esc(r.city)} · ${esc(r.checkin)} – ${esc(r.checkout)} · ${r.adults} volwassenen</p><p>${esc(r.room)} · ${esc(r.board_label)}</p><details><summary>Annuleringsvoorwaarden</summary><p>${esc(r.cancellation)}</p></details>${exists?`<p><a href="deal-detail.html?id=${Number(exists)}">Al geïmporteerd: deal ${Number(exists)} →</a></p>`:''}<p class="costs">Kamerfoto’s worden vóór opslag gecontroleerd. Geen boeking bij import.</p></div><div class="offer-price"><div class="price">${money(r.price)}</div><div class="costs">Voorgestelde verkoopprijs voor het verblijf<br>Inkoopprijs (Nuitée): ${money(r.base)}<br>Nuitée kosten: ${money(r.filters.pricing.processing_fee)}<br>Stripe kosten: ${money(r.stripe_cost)}<br>Geschat overhouden: ${money(r.estimated_margin)}</div></div></article>`;
  }).join('')||'<p>Geen passend aanbod op de opgehaalde zoekpagina’s. Bekijk de meldingen of zoek verder.</p>';
  $('search-skipped').replaceChildren();for(const m of messages.slice(-150)){const li=document.createElement('li');li.textContent=m;$('search-skipped').append(li);}
 }
 function suggest(){
  selected.clear();const counts=new Map(),hotels=new Set();
  for(const r of [...rows].sort((a,b)=>a.price-b.price)){
   if(selected.size>=plan.target)break;const city=r.filters.city;
   if(r.existing_deal_id||(counts.get(city)||0)>=plan.per_city||plan.unique_hotels&&hotels.has(r.hotel_id))continue;
   selected.add(rowKey(r));counts.set(city,(counts.get(city)||0)+1);hotels.add(r.hotel_id);
  }
  render();status(`${selected.size} deals voorgesteld. Controleer de selectie en klik daarna op importeren. Er is nog niets opgeslagen.`);
 }
 async function search(more=false){
  if(busy)return;
  try{
   if(!more){plan=read();rows=[];selected.clear();page=0;messages=[];jobs=plan.cities.flatMap(city=>plan.periods.map(p=>({filters:{...plan,...p,city,offset:0},done:false})));}
   stop=false;setBusy(true);let completed=0;
   for(const j of jobs){
    if(stop)break;if(j.done)continue;
    status(`Aanbod zoeken: ${j.filters.city}, ${j.filters.checkin} – ${j.filters.checkout}. ${completed}/${jobs.length} zoekdelen verwerkt.`);
    try{
     const data=await request('/supplier-import/search',{filters:j.filters});
     if(!Array.isArray(data.items))throw Error('Onverwacht zoekantwoord.');
     for(const item of data.items){const key=rowKey(item);if(!rows.some(r=>rowKey(r)===key))rows.push({...item,filters:data.filters||{...j.filters}});}
     for(const m of data.skipped||[])messages.push(`${j.filters.city} · ${m.hotel_id}: ${m.reason}`);
     j.filters.session_id=data.filters?.session_id;j.filters.offset=data.next_offset;j.done=j.filters.offset>5000;
     // Empty availability is not proof the hotel catalog has ended; paging remains explicit.
    }catch(e){messages.push(`${j.filters.city} · zoeken mislukt: ${e.message}`);if([401,403,429].includes(e.status)){stop=true;}}
    completed++;render();
   }
   status(`${stop?'Gestopt na de huidige aanvraag. ':''}${rows.length} tariefopties gevonden. Maak een selectievoorstel of kies zelf.`);
  }catch(e){status(e.message,true);}finally{setBusy(false);}
 }
 function renderReport(){
  $('report-panel').hidden=!report.length;$('import-report').replaceChildren();
  for(const r of report){const li=document.createElement('li');li.textContent=`${r.hotel}: ${r.message}`;if(r.deal_id){const a=document.createElement('a');a.href='deal-detail.html?id='+Number(r.deal_id);a.textContent=' Open deal '+Number(r.deal_id)+' →';li.append(a);}$('import-report').append(li);}
  try{sessionStorage.setItem(presetKey+'-report',JSON.stringify(report.slice(-200)));}catch{}
 }
 async function commit(){
  if(busy)return;const chosen=rows.filter(r=>selected.has(rowKey(r))&&!r.existing_deal_id);
  if(!chosen.length){status('Selecteer eerst aanbod.');return;}
  if(chosen.length>plan.target){status('Je selectie is groter dan het gekozen aantal deals. Verklein de selectie.',true);return;}
  const counts={};for(const r of chosen){counts[r.filters.city]=(counts[r.filters.city]||0)+1;if(counts[r.filters.city]>plan.per_city){status('Je selectie overschrijdt het maximum per plaats.',true);return;}}
  if(plan.unique_hotels&&new Set(chosen.map(r=>r.hotel_id)).size!==chosen.length){status('Selecteer maximaal één deal per hotel, of wijzig je zoekinstellingen.',true);return;}
  stop=false;setBusy(true);let processed=0;
  try{for(const r of chosen){
   if(stop)break;status(`Concept importeren ${processed+1}/${chosen.length}: ${r.hotel_name}. Prijs, voorwaarden en kamerfoto’s worden gecontroleerd.`);
   try{
    const result=await request('/supplier-import/commit',{filters:r.filters,selection:{hotel_id:r.hotel_id,signature:r.signature}});
    if(!result.deal_id)throw Error('Geen bevestiging ontvangen. Controleer de conceptlijst voordat je opnieuw probeert.');
    r.existing_deal_id=result.deal_id;selected.delete(rowKey(r));report.push({hotel:r.hotel_name,deal_id:result.deal_id,message:result.created?`Concept aangemaakt met ${result.photo_count} gecontroleerde foto’s.`:'Bestond al; niets overschreven.'});
   }catch(e){report.push({hotel:r.hotel_name,message:e.status?e.message:'Uitkomst niet bevestigd. Controleer de conceptlijst; een herhaalde import controleert opnieuw op bestaande deals.'});if([401,403,429].includes(e.status)||!e.status)stop=true;}
   processed++;renderReport();render();
  }status(`${processed} geselecteerde aanbiedingen verwerkt. Bekijk hieronder wat is gelukt. Geen deal is goedgekeurd of gepubliceerd.`);}finally{setBusy(false);}
 }
 function renderFacilities(){const el=$('import-facilities'),keep=new Set([...el.selectedOptions].map(x=>Number(x.value))),q=$('facility-search').value.trim().toLocaleLowerCase('nl');el.replaceChildren();for(const f of facilityChoices)if(keep.has(f.id)||!q||f.name.toLocaleLowerCase('nl').includes(q))el.add(new Option(f.name,String(f.id),false,keep.has(f.id)));}
 function presets(){try{const p=JSON.parse(localStorage.getItem(presetKey)||'[]');return Array.isArray(p)?p.slice(0,30):[];}catch{return [];}}
 function renderPresets(){const el=$('saved-searches');el.replaceChildren(new Option('Kies een zoekopdracht',''));presets().forEach((p,i)=>el.add(new Option(p.name,String(i))));}
 async function init(){
  const admin=await core.requireAuth();if(!admin)return;
  core.mountShell({active:'suppliers',title:'Nuitée importeren',subtitle:'Zoeken, vergelijken en gecontroleerd binnenhalen als concept.'},admin);
  if(!['superadmin','platform_admin'].includes(admin.role)){field('country').disabled=true;$('search-fields').disabled=true;throw Error('Je rol mag geen aanbod importeren.');}
  presetKey='sd-import-presets-v1-'+admin.id;period();renderPresets();
  try{report=JSON.parse(sessionStorage.getItem(presetKey+'-report')||'[]');if(!Array.isArray(report))report=[];renderReport();}catch{report=[];}
  form.onsubmit=e=>{e.preventDefault();search();};$('add-period').onclick=()=>{try{period();}catch(e){status(e.message,true);}};
  $('load-first-batch').onclick=()=>apply({country:'NL',cities:['Amsterdam','Den Haag','Rotterdam','Almere','Zaandam'],periods:[{checkin:'2026-11-27',checkout:'2026-11-29'}],adults:2,target:15,per_city:3,board:'',cancellation:'all',unique_hotels:true});
  $('stop-import').onclick=()=>{stop=true;status('De lopende aanvraag wordt afgerond; daarna stopt de verwerking.');};
  $('more-results').onclick=()=>search(true);$('suggest-selection').onclick=suggest;$('clear-selection').onclick=()=>{selected.clear();render();};$('commit-selection').onclick=commit;
  $('prev-results').onclick=()=>{page--;render();};$('next-results').onclick=()=>{page++;render();};
  $('import-results').onchange=e=>{const i=e.target.dataset.index;if(i===undefined)return;const k=rowKey(rows[Number(i)]);e.target.checked?selected.add(k):selected.delete(k);$('selected-count').textContent=selected.size+' geselecteerd';};
  $('save-search').onclick=()=>{try{const data=read(),name=window.prompt('Naam voor deze zoekopdracht');if(!name?.trim())return;const p=presets().filter(x=>x.name!==name.trim());if(p.length>=30)throw Error('Verwijder eerst een opgeslagen zoekopdracht.');p.push({name:name.trim().slice(0,100),data});localStorage.setItem(presetKey,JSON.stringify(p));renderPresets();status('Zoekopdracht opgeslagen op dit apparaat.');}catch(e){status(e.message,true);}};
  $('load-search').onclick=()=>{const i=$('saved-searches').value;if(i!==''){apply(presets()[Number(i)].data);status('Instellingen geladen. Klik op Aanbod zoeken voor actuele prijzen.');}};
  $('remove-search').onclick=()=>{const i=$('saved-searches').value;if(i==='')return;const p=presets();p.splice(Number(i),1);localStorage.setItem(presetKey,JSON.stringify(p));renderPresets();};
  try{const data=await request('/supplier-import/options',{});facilityChoices=data.facilities||[];renderFacilities();$('facility-search').oninput=renderFacilities;$('import-facilities').disabled=!data.facilities?.length;$('facilities-status').textContent='Kies eventueel meerdere voorzieningen. Aanwezig betekent niet automatisch inbegrepen.';}catch{$('facilities-status').textContent='Voorzieningen konden niet worden geladen. Overige zoekfilters blijven beschikbaar.';}
 }
 init().catch(e=>status(e.message,true));
})();
