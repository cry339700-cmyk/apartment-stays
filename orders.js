(()=>{'use strict';
if(document.body.dataset.page!=='orders')return;
const service=window.ApartmentService;const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let lang=document.documentElement.lang.startsWith('zh')?'zh':document.documentElement.lang;let orders=[];let challengeId='';let accessToken='';let receipt=null;
const c=k=>window.ApartmentCommerceCopy.text(lang,k);
const status=order=>order.demo?c('demoPaid'):c(order.status==='paid'?'paid':order.status==='paid_review'?'paidReview':order.status==='pending'?'paymentPending':'paymentFailed');
const message=text=>{$('#order-message').textContent=text;};
const render=()=>{
 $('#request-order-code').textContent=service.live?c('sendCode'):c('orders');$('#order-hint').textContent=service.live?c('emailHint'):c('demoNote');$('#clear-demo-orders').hidden=service.live;
 $('#order-results').innerHTML=orders.length?orders.map((order,index)=>{
  const money=new Intl.NumberFormat(lang,{style:'currency',currency:order.currency.toUpperCase()}).format(order.total/100);
  return `<article class="order-card"><header><div><span class="order-status">${esc(status(order))}</span><h2>${esc(order.id)}</h2></div><span class="order-total">${esc(money)}</span></header><dl>${[['unit',order.unitName||order.unit],['arrival',order.arrival],['departure',order.departure],['guest',order.name],['method',window.ApartmentMail.method(order.method,lang)],['emailStatus',c(order.mailStatus==='sent'?'mailQueued':order.mailStatus==='attention'?'mailFailed':'notSent')]].map(([key,value])=>`<div><dt>${esc(c(key))}</dt><dd dir="auto">${esc(value)}</dd></div>`).join('')}</dl>${order.demo?`<p class="order-hint">${esc(c('demoNote'))}</p><button class="button button-outline" data-order-preview="${index}">${esc(c('preview'))}</button>`:`<button class="button button-outline" data-refresh-order>${esc(c('refresh'))}</button>`}</article>`;
 }).join(''):`<p class="orders-empty">${esc(c('empty'))}</p>`;
};
const busy=async(button,action)=>{button.disabled=true;const old=button.textContent;button.textContent=c('loading');try{await action();}catch{message(c('loadingError'));}finally{button.disabled=false;button.textContent=old;}};
async function readReceipt(){if(!receipt)return;const result=await service.request('orders/read',receipt);orders=[result.order];render();message(result.order.status==='paid'?c('paid'):c('paymentPending'));}
$('#order-lookup').addEventListener('submit',event=>{
 event.preventDefault();const email=$('#order-email').value.trim().toLowerCase();
 if(!$('#order-email').validity.valid)return;
 busy($('#request-order-code'),async()=>{
  if(!service.live){orders=service.demoOrders().filter(o=>o.email?.toLowerCase()===email);render();message(orders.length?c('demoSaved'):c('empty'));return;}
  const result=await service.request('access/request',{email,locale:lang});challengeId=result.challengeId;$('#order-verify').hidden=false;message(c('requestSent'));$('#order-code').focus();
 });
});
$('#order-verify').addEventListener('submit',event=>{
 event.preventDefault();busy($('#order-verify button'),async()=>{
  try{const result=await service.request('access/verify',{challengeId,code:$('#order-code').value});accessToken=result.accessToken;orders=(await service.request('orders/list',{accessToken})).orders;$('#order-verify').hidden=true;$('#order-code').value='';message('');render();}
  catch{message(c('invalid'));}
 });
});
$('#order-results').addEventListener('click',event=>{
 const preview=event.target.closest('[data-order-preview]');if(preview){window.ApartmentOpenMail(orders[Number(preview.dataset.orderPreview)],true);return;}
 const refresh=event.target.closest('[data-refresh-order]');if(refresh)busy(refresh,async()=>{if(receipt)await readReceipt();else{orders=(await service.request('orders/list',{accessToken})).orders;render();}});
});
$('#clear-demo-orders').addEventListener('click',()=>{service.clearDemo();orders=[];render();message(c('empty'));});
document.addEventListener('apartment:locale',event=>{lang=event.detail.lang;render();});
render();
if(service.live){
 const fragment=new URLSearchParams(location.hash.slice(1));const id=fragment.get('order')||new URL(location.href).searchParams.get('order');let token=fragment.get('token');if(id&&!token){try{token=sessionStorage.getItem('apartment-receipt-'+id);}catch{}}
 if(id&&token){receipt={orderId:id,token};try{sessionStorage.setItem('apartment-receipt-'+id,token);}catch{}const cleanUrl=new URL(location.href);cleanUrl.hash='';cleanUrl.searchParams.set('order',id);history.replaceState(null,'',cleanUrl);readReceipt().catch(()=>message(c('expired')));}
}
})();
