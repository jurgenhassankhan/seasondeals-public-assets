(function(root){
  'use strict';
  function visible(deal,snapshot,now=Date.now()) {
    return deal?.status==='active' && !!deal.approved_at && !deal.deleted_at && snapshot?.deal_id===deal.id && snapshot.environment==='sandbox' && snapshot.status==='available' && snapshot.available===true && snapshot.can_pay===false && Number.isFinite(snapshot.checked_at) && Number.isFinite(snapshot.valid_until) && snapshot.checked_at<=now+10000 && snapshot.checked_at<=now && snapshot.valid_until>now && snapshot.valid_until-snapshot.checked_at<=90000 && snapshot.valid_until>snapshot.checked_at && snapshot.customer_price===Number(deal.price) && snapshot.currency==='EUR';
  }
  function createCatalog({request,render,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}) {
    let rows=[],snapshots=new Map(),generation=0,timer=null,disposed=false;
    const show=()=>render(rows.filter(d=>visible(d,snapshots.get(d.id),now())),rows.map(d=>({id:d.id,status:snapshots.get(d.id)?.status==='available' && !visible(d,snapshots.get(d.id),now())?'unknown':(snapshots.get(d.id)?.status || 'checking'),checked_at:snapshots.get(d.id)?.checked_at})));
    async function refresh(next=rows) {
      if(disposed)return;
      rows=next.filter(d=>d.status==='active' && d.approved_at && !d.deleted_at);for(const id of snapshots.keys())if(!rows.some(d=>d.id===id))snapshots.delete(id);clearTimer(timer);const run=++generation;show();
      let index=0;
      async function worker(){while(index<rows.length){const deal=rows[index++];let result;try{result=await request(deal);}catch{result={status:'unknown'};}if(disposed || run!==generation)return;snapshots.set(deal.id,result);show();}}
      await Promise.all([worker(),worker()]);
      if(disposed || run!==generation)return;
      timer=setTimer(()=>refresh(),45000);
    }
    return {refresh,expire:show,dispose(){disposed=true;generation++;clearTimer(timer);snapshots.clear();}};
  }
  if(typeof module!=='undefined')module.exports={visible,createCatalog};else root.SeasonDealsAvailabilityCatalog={visible,createCatalog};
})(typeof window!=='undefined'?window:globalThis);
