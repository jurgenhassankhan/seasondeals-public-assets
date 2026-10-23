(function (root) {
  "use strict";
  function createController({request,render,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}) {
    let generation=0,timer=null,inputs=null,disposed=false;
    function invalidate() {generation++;clearTimer(timer);timer=null;render({status:'unchecked',available:false,message:'Beschikbaarheid nog niet gecontroleerd voor deze keuze.'});}
    async function check(value) {
      if(disposed)return;
      inputs={...value};const current=++generation;clearTimer(timer);
      render({status:'checking',available:false,message:'Actuele beschikbaarheid en prijs controleren…'});
      try {
        const result=await request(inputs);
        if(disposed || current!==generation)return;
        if(!result || !['available','unavailable','unknown','blocked','price_blocked','conditions_changed','mapping_required'].includes(result.status) || result.environment!=='sandbox' || result.can_pay!==false)throw Error('Ongeldig beschikbaarheidsantwoord.');
        if(result.status==='available' && (result.available!==true || !Number.isFinite(result.checked_at) || !Number.isFinite(result.valid_until) || result.valid_until<=now() || result.checked_at>now()+10000 || result.valid_until-result.checked_at>60000))throw Error('De beschikbaarheidscontrole is verlopen.');
        render(result);
        timer=setTimer(()=>{render({status:'expired',available:false,message:'Controle vernieuwen…'});check(inputs);},result.status==='available'?Math.min(45000,result.valid_until-now()):45000);
      } catch(error) {
        if(disposed || current!==generation)return;
        render({status:'unknown',available:false,message:error.message || 'Beschikbaarheid kon niet worden bevestigd.'});
      }
    }
    return {check,invalidate,dispose(){disposed=true;generation++;clearTimer(timer);}};
  }
  function mount({form,endpoint,tokenKey,branch,defaults}) {
    const checkin=form.querySelector('[name="checkin"]'),checkout=form.querySelector('[name="checkout"]'),guests=form.querySelector('[name="guests"]');
    const button=form.querySelector('[type="submit"]'),message=form.querySelector('[role="alert"]');
    const output=document.createElement('div');output.className='policy-card';output.setAttribute('aria-live','polite');form.append(output);
    if(defaults){checkin.value=defaults.checkin || '';checkout.value=defaults.checkout || '';guests.value=String(defaults.occupancies?.[0]?.adults || 2);}
    function values(){return {checkin:checkin.value,checkout:checkout.value,guests:Number(guests.value)};}
    const money=value=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(value);
    const controller=createController({
      request:async input=>{
        if(!input.checkin || !input.checkout)throw Error('Kies eerst je verblijfsdata.');
        const token=sessionStorage.getItem(tokenKey);if(!token)throw Error('Log opnieuw in om de sandboxcontrole te gebruiken.');
        const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),20000);
        try {
          const response=await fetch(endpoint+'?'+new URLSearchParams(input),{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',signal:abort.signal,headers:{Accept:'application/json',Authorization:'Bearer '+token,'X-Branch':branch}});
          const data=await response.json();if(!response.ok)throw Error(data?.message || 'Beschikbaarheidservice niet bereikbaar.');return data;
        } finally {clearTimeout(timeout);}
      },
      render:result=>{
        button.disabled=result.status==='checking';button.textContent='Controleer actuele beschikbaarheid';
        message.textContent=result.message;message.className='booking-message is-visible '+(result.available?'is-info':'is-error');
        output.replaceChildren();
        if(result.status==='available') {
          const price=document.createElement('p');price.textContent='Goedgekeurde verkoopprijs: '+money(result.customer_price);output.append(price);
          const stock=document.createElement('p');stock.textContent='Beschikbaar voor dit verblijf. Exact kameraantal niet geleverd door Nuitée.';output.append(stock);
          const timestamp=document.createElement('p');timestamp.textContent='Gecontroleerd om '+new Date(result.checked_at).toLocaleTimeString('nl-NL')+'. Dit is geen reservering.';output.append(timestamp);
        }
        if(Array.isArray(result.local_fees)) for(const fee of result.local_fees){const p=document.createElement('p');p.textContent=(fee.description || 'Lokale kosten')+': '+money(fee.amount)+' te betalen bij de accommodatie.';output.append(p);}
        const warning=document.createElement('p');warning.textContent='Sandboxpreview — boeken en betalen blijven uitgeschakeld.';output.append(warning);
      }
    });
    [checkin,checkout,guests].forEach(input=>input.addEventListener('change',()=>{controller.invalidate();if(checkin.value && checkout.value)controller.check(values());}));
    form.addEventListener('submit',event=>{event.preventDefault();controller.check(values());});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)controller.invalidate();else if(checkin.value && checkout.value)controller.check(values());});
    window.addEventListener('pagehide',()=>controller.dispose(),{once:true});
    controller.check(values());return controller;
  }
  if(typeof module!=='undefined')module.exports={createController};
  else root.SeasonDealsSupplierAvailability={mount};
})(typeof window!=='undefined'?window:globalThis);
