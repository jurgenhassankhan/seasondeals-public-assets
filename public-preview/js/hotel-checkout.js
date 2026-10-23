(function(root){
  'use strict';
  const BASE='https://xgrq-dkge-tace.n7e.xano.io';
  const endpoints=Object.freeze({preview:BASE+'/api:seasondeals-public/supplier/production/booking-preview',checkout:BASE+'/api:seasondeals-public/supplier/production/guest-checkout'});
  function validQuote(q,input,now=Date.now()){
    return !!(q&&q.environment==='production'&&q.status==='available'&&q.available===true&&q.can_pay===true&&q.currency==='EUR'&&Number.isFinite(q.customer_price)&&q.customer_price>0&&q.deal_id===input.deal_id&&q.checkin===input.checkin&&q.checkout===input.checkout&&q.guest_count===input.guests&&Number.isFinite(q.checked_at)&&Number.isFinite(q.valid_until)&&q.checked_at<=now+10000&&q.valid_until>now&&q.valid_until-q.checked_at<=60000&&q.valid_until>q.checked_at&&Array.isArray(q.local_fees)&&q.local_fees.every(f=>f.currency==='EUR'&&Number.isFinite(f.amount)&&f.amount>=0)&&q.cancellation_policies?.refundableTag==='NRFN');
  }
  function stripeUrl(data){
    if(data?.environment!=='production'||data.currency!=='EUR')throw Error('De betaalpagina kon niet veilig worden gecontroleerd. Neem contact met ons op.');
    const u=new URL(data.checkout_url);
    if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com'||u.port||u.username||u.password||!/^\/(?:c\/)?pay\/cs_live_[A-Za-z0-9]+/.test(u.pathname))throw Error('De betaalpagina kon niet veilig worden gecontroleerd. Neem contact met ons op.');
    return u.href;
  }
  function createClient({fetch,crypto,storage}){
    let busy=false;
    async function post(url,body){
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),25000);
      try{
        const r=await fetch(url,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:abort.signal,headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await r.json();
        if(!r.ok){const e=Error(data?.message==='PRODUCTION_NOT_RELEASED'?'Online boeken is binnenkort beschikbaar.':'Deze aanvraag kon niet worden afgerond. Controleer je gegevens of neem contact met ons op.');e.status=r.status;throw e;}
        return data;
      }finally{clearTimeout(timer);}
    }
    return {
      preview:input=>post(endpoints.preview,input),
      async checkout(input,q){
        if(busy)throw Error('Je aanvraag wordt al verwerkt.');
        if(!validQuote(q,{deal_id:input.deal_id,checkin:input.checkin,checkout:input.checkout,guests:input.guest_count}))throw Error('Controleer eerst opnieuw de beschikbaarheid en voorwaarden.');
        busy=true;
        try{
          // Whitelist payload: never trust browser amounts or customer IDs.
          const body={deal_id:input.deal_id,checkin:input.checkin,checkout:input.checkout,guest_count:input.guest_count,holder:input.holder,guests:input.guests};
          const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body))))).map(x=>x.toString(16).padStart(2,'0')).join('');
          const previous=JSON.parse(storage.getItem('sd-hotel-checkout-attempt')||'null');
          if(previous&&previous.digest!==digest)throw Error('Er staat al een betaalverzoek klaar of in behandeling. Controleer je bevestigingsmail of neem contact op voordat je opnieuw boekt.');
          const attempt=previous||{digest,key:Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('')};
          storage.setItem('sd-hotel-checkout-attempt',JSON.stringify(attempt));
          // Keep this key even on timeout/reload; never silently start a second attempt.
          const result=await post(endpoints.checkout,{...body,request_key:attempt.key});
          if(result.selling_price!==q.customer_price)throw Error('De betaalprijs wijkt af. Neem contact op voordat je betaalt.');
          return stripeUrl(result);
        }finally{busy=false;}
      }
    };
  }
  function mount(){
    const host=document.getElementById('hotel-checkout');if(!host)return;
    const $=id=>document.getElementById(id),p=new URLSearchParams(location.search);
    const dealId=Number(p.get('id'));let quote=null,generation=0,expiry;
    const client=createClient({fetch:root.fetch.bind(root),crypto:root.crypto,storage:root.sessionStorage});
    const dates=$('hotel-dates'),guestForm=$('hotel-guests'),pay=$('hotel-pay'),notice=$('hotel-notice');
    const say=message=>{notice.textContent=message;};
    const money=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n);
    const values=()=>({deal_id:dealId,checkin:$('hotel-checkin').value,checkout:$('hotel-checkout').value,guests:Number($('hotel-count').value)});
    function invalidate(){generation++;quote=null;clearTimeout(expiry);pay.disabled=true;$('hotel-accept').checked=false;$('hotel-quote').hidden=true;}
    function guests(){const count=Number($('hotel-count').value);$('hotel-guest-fields').replaceChildren();for(let i=0;i<count;i++){const field=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent=i===0?'Hoofdgast':'Gast '+(i+1);field.append(legend);for(const [key,label,type] of [['firstName','Voornaam','text'],['lastName','Achternaam','text'],['email','E-mailadres','email']]){const l=document.createElement('label');l.textContent=label;const inp=document.createElement('input');inp.name=key+'-'+i;inp.type=type;inp.required=true;inp.maxLength=160;l.append(inp);field.append(l);}$('hotel-guest-fields').append(field);}}
    async function check(initial=false){
      const current=++generation;quote=null;pay.disabled=true;clearTimeout(expiry);
      say('We controleren de beschikbaarheid…');
      try{const input=values(),q=await client.preview(input);if(current!==generation)return;
        if(q.environment!=='production')throw Error('De beschikbaarheid kon niet worden gecontroleerd.');
        if(q.status==='closed'){dates.hidden=true;guestForm.hidden=true;say('Online boeken is binnenkort beschikbaar. We leggen de laatste hand aan ons hotelaanbod.');return;}
        dates.hidden=false;
        if(!validQuote(q,input)){say(q.available?'Deze annuleringsvoorwaarden kunnen nog niet veilig online worden geboekt. Neem contact met ons op.':q.message||'Kies je verblijfsdata en controleer de beschikbaarheid.');return;}
        quote=q;$('hotel-title').textContent=q.title||'Jouw hotelverblijf';$('hotel-price').textContent=money(q.customer_price);$('hotel-room').textContent=[q.room_name,q.board_name].filter(Boolean).join(' · ');
        $('hotel-local-fees').replaceChildren();for(const f of q.local_fees){const row=document.createElement('p');row.textContent=(f.description||'Lokale kosten')+': '+money(f.amount)+' te betalen bij het hotel.';$('hotel-local-fees').append(row);}
        $('hotel-quote').hidden=false;guestForm.hidden=false;pay.disabled=false;say('Je verblijf is beschikbaar. Controleer je gegevens en de voorwaarden.');expiry=setTimeout(()=>{invalidate();say('De prijscontrole is verlopen. Controleer de beschikbaarheid opnieuw.');},q.valid_until-Date.now());
      }catch(e){say(initial?'Online boeken is tijdelijk niet beschikbaar. Probeer het later opnieuw.':e.message);}
    }
    dates.addEventListener('input',()=>{invalidate();say('Controleer de beschikbaarheid voor je nieuwe keuze.');});
    $('hotel-count').addEventListener('change',guests);
    dates.addEventListener('submit',e=>{e.preventDefault();if(dates.reportValidity())check();});
    guestForm.addEventListener('submit',async e=>{e.preventDefault();if(!guestForm.reportValidity())return;pay.disabled=true;try{const v=values(),list=Array.from({length:v.guests},(_,i)=>({firstName:guestForm.elements['firstName-'+i].value.trim(),lastName:guestForm.elements['lastName-'+i].value.trim(),email:guestForm.elements['email-'+i].value.trim(),occupancyNumber:1}));say('We maken je beveiligde betaalpagina klaar. Sluit deze pagina nog niet.');const url=await client.checkout({deal_id:v.deal_id,checkin:v.checkin,checkout:v.checkout,guest_count:v.guests,holder:{firstName:list[0].firstName,lastName:list[0].lastName,email:list[0].email},guests:list},quote);location.assign(url);}catch(err){say(err.message);}finally{pay.disabled=!validQuote(quote,values());}});
    root.addEventListener('pagehide',()=>{clearTimeout(expiry);});
    if(!Number.isSafeInteger(dealId)||dealId<=0){say('Kies eerst een hoteldeal om je verblijf samen te stellen.');return;}
    $('hotel-checkin').value=p.get('checkin')||'';$('hotel-checkout').value=p.get('checkout')||'';
    const count=Number(p.get('guests'));if(Number.isInteger(count)&&count>=1&&count<=6)$('hotel-count').value=String(count);
    guests();
    if(!$('hotel-checkin').value||!$('hotel-checkout').value){dates.hidden=false;say('Kies je verblijfsdata en controleer de beschikbaarheid.');return;}
    check(true);
  }
  const api={endpoints,validQuote,stripeUrl,createClient};
  if(typeof module==='object'&&module.exports)module.exports=api;else{root.SeasonDealsHotelCheckout=api;mount();}
})(typeof window==='undefined'?globalThis:window);
