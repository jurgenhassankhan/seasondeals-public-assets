(() => {
  'use strict';
  const core=window.AdminCore,table=document.getElementById('availability-rows'),summary=document.getElementById('availability-summary');
  const search=document.getElementById('availability-search'),filter=document.getElementById('availability-filter'),pager=document.getElementById('availability-pagination');
  const websiteGrid=document.getElementById('availability-website-grid');
  let catalog,rows=[],states=[],availableIds=new Set(),expiryTimer,page=1;
  const name=d=>d.supplier.supplier_content?.hotel?.name||d.title||'Hotel';
  function status(d){const s=states.find(s=>s.id===d.id);if(availableIds.has(d.id))return ['available','Beschikbaar'];if(s?.status==='checking')return ['checking','Wordt gecontroleerd'];if(s?.status==='unavailable')return ['unavailable','Niet beschikbaar'];return ['unknown','Niet bevestigd'];}
  function render(){
    if(websiteGrid){
      const q=search.value.trim().toLocaleLowerCase('nl');const list=rows.filter(d=>availableIds.has(d.id)&&name(d).toLocaleLowerCase('nl').includes(q));const pages=Math.max(1,Math.ceil(list.length/20));page=Math.min(page,pages);websiteGrid.replaceChildren();
      for(const d of list.slice((page-1)*20,page*20)){const card=document.createElement('article');card.className='deal-card';const image=core.imageUrl(d.images)||core.imageUrl(d.external_image_urls);if(image){const box=document.createElement('div');box.className='deal-image';const img=document.createElement('img');img.src=image;img.alt=name(d);img.loading='lazy';box.append(img);card.append(box);}const body=document.createElement('div');body.className='deal-card-body';const title=document.createElement('h2');title.textContent=name(d);const price=document.createElement('strong');price.textContent=core.money(d.price);const info=document.createElement('p');info.textContent='Beschikbaar voor de opgeslagen verblijfsdata. Controleer je eigen data bij de deal.';const a=document.createElement('a');a.href='../nuitee-availability-preview.html?portal=admin&id='+encodeURIComponent(d.id);a.textContent='Bekijk deal en kies data →';body.append(title,price,info,a);card.append(body);websiteGrid.append(card);}
      if(!list.length){const p=document.createElement('p');p.textContent='Geen vers bevestigd aanbod voor deze selectie.';websiteGrid.append(p);}
      document.getElementById('availability-page').textContent=`Pagina ${page} van ${pages} · ${list.length} deals`;document.getElementById('availability-prev').disabled=page===1;document.getElementById('availability-next').disabled=page===pages;pager.hidden=!list.length;return;
    }
    const q=search.value.trim().toLocaleLowerCase('nl'),selected=filter.value;
    const filtered=rows.filter(d=>name(d).toLocaleLowerCase('nl').includes(q)&&(!selected||status(d)[0]===selected));
    const pages=Math.max(1,Math.ceil(filtered.length/20));page=Math.min(page,pages);
    table.replaceChildren();
    for(const d of filtered.slice((page-1)*20,page*20)){
      const tr=document.createElement('tr'),hotel=document.createElement('td'),wrap=document.createElement('div');wrap.className='availability-hotel';
      const image=core.imageUrl(d.images)||core.imageUrl(d.external_image_urls);
      if(image){const img=document.createElement('img');img.src=image;img.alt='';img.loading='lazy';wrap.append(img);}
      const title=document.createElement('strong');title.textContent=name(d);wrap.append(title);hotel.append(wrap);tr.append(hotel);
      const s=states.find(s=>s.id===d.id),values=[core.money(d.price),status(d)[1],s?.checked_at?new Date(s.checked_at).toLocaleString('nl-NL'):'Nog geen bevestigde controle'];
      for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}
      const action=document.createElement('td'),a=document.createElement('a');a.href='../nuitee-availability-preview.html?portal=admin&id='+encodeURIComponent(d.id);a.textContent='Verblijf controleren';action.append(a);tr.append(action);table.append(tr);
    }
    if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent=rows.length?'Geen deals gevonden met deze filters.':'Geen goedgekeurde Nuitée-sandboxdeals.';tr.append(td);table.append(tr);}
    document.getElementById('availability-page').textContent=`Pagina ${page} van ${pages} · ${filtered.length} deals`;
    document.getElementById('availability-prev').disabled=page===1;document.getElementById('availability-next').disabled=page===pages;
    pager.hidden=!rows.length;
  }
  async function init(){
    const admin=await core.requireAuth();if(!admin)return;
    if(!websiteGrid)core.mountShell({active:'suppliers',title:'Nuitée-beschikbaarheid',subtitle:'Alle goedgekeurde sandboxdeals, met hun actuele beschikbaarheidsstatus.'},admin);
    if(!['superadmin','platform_admin'].includes(admin.role))throw Error('Je rol mag deze test niet uitvoeren.');
    const deals=(await window.AdminOfferData.all('/deals')).filter(d=>d.source==='provider_sync'&&d.status==='active'&&d.approved_at&&!d.deleted_at);
    let index=0;await Promise.all([0,1,2,3].map(async()=>{while(index<deals.length){const deal=deals[index++],detail=await core.request('/supplier-deals/'+encodeURIComponent(deal.id),{cache:'no-store'});if(detail.supplier_deal?.provider==='nuitee'&&detail.supplier_deal.environment==='sandbox')rows.push({...deal,supplier:detail.supplier_deal});}}));
    rows.sort((a,b)=>name(a).localeCompare(name(b),'nl')||a.id-b.id);
    catalog=window.SeasonDealsAvailabilityCatalog.createCatalog({request:async deal=>{const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),20000);try{return await core.request('/supplier-deals/'+encodeURIComponent(deal.id)+'/availability-snapshot',{signal:abort.signal,cache:'no-store'});}finally{clearTimeout(timeout);}},render:(available,nextStates)=>{availableIds=new Set(available.map(d=>d.id));states=nextStates;summary.textContent=websiteGrid?`${available.length} beschikbare sandboxdeals voor de opgeslagen verblijfsdata. Kies je eigen data bij de deal. Boeken en betalen zijn uitgeschakeld.`:`${available.length} van ${rows.length} goedgekeurde sandboxdeals beschikbaar voor de opgeslagen verblijfsdata. Servercontrole iedere minuut. Alle deals blijven in dit overzicht; boeken en betalen zijn uitgeschakeld.`;render();}});
    for(const el of [search,filter])el.addEventListener(el===search?'input':'change',()=>{page=1;render();});
    document.getElementById('availability-prev').addEventListener('click',()=>{page--;render();});document.getElementById('availability-next').addEventListener('click',()=>{page++;render();});
    document.getElementById('availability-refresh').addEventListener('click',()=>catalog.refresh(rows));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)catalog.refresh(rows);});expiryTimer=setInterval(()=>catalog.expire(),1000);
    window.addEventListener('pagehide',()=>{catalog.dispose();clearInterval(expiryTimer);},{once:true});await catalog.refresh(rows);
  }
  init().catch(e=>{summary.textContent=e.message;});
})();
