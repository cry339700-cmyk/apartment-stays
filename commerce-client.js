/* Fail closed when an API is configured but unavailable. Never fabricate paid or sent states. */
(()=>{'use strict';
const base=(window.APARTMENT_COMMERCE?.apiBase||'').replace(/\/$/,'');
const storageKey='apartment-demo-orders-v1';
const request=async(path,body)=>{const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw new Error(data.code||'REQUEST_FAILED');return data;};
const readDemo=()=>{try{return JSON.parse(sessionStorage.getItem(storageKey)||'[]');}catch{return [];}};
window.ApartmentService={
 live:Boolean(base),request,
 configuration:base?request('config').catch(()=>({enabled:false,methods:[]})):Promise.resolve({enabled:false,methods:[]}),
 demoOrders:readDemo,
 saveDemo:order=>{const list=readDemo().filter(o=>o.id!==order.id);list.unshift(order);try{sessionStorage.setItem(storageKey,JSON.stringify(list.slice(0,20)));return true;}catch{return false;}},
 clearDemo:()=>{try{sessionStorage.removeItem(storageKey);}catch{}},
 orderLink:(id,token='',locale='en')=>{const u=new URL('orders.html',location.href);u.searchParams.set('lang',locale);if(token)u.hash=new URLSearchParams({order:id,token}).toString();return u.href;},
 loadStripe:()=>new Promise((resolve,reject)=>{if(window.Stripe)return resolve(window.Stripe);const script=document.createElement('script');script.src='https://js.stripe.com/endive/stripe.js';script.onload=()=>resolve(window.Stripe);script.onerror=()=>reject(new Error('STRIPE_LOAD_FAILED'));document.head.append(script);})
};
})();
