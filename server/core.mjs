import {randomUUID,randomBytes,randomInt,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {transaction} from './store.mjs';
import mail from '../mail-template.js';
import copy from '../commerce-copy.js';
export class ApiError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
export const sha=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a));const y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const locale=lang=>copy.copy[lang]?lang:'en';
const emailValue=email=>{if(typeof email!=='string'||email.length>160||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new ApiError('INVALID_INPUT');return email.trim().toLowerCase();};
export function stayDays(arrival,departure){
 const parse=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw new ApiError('INVALID_DATES');const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw new ApiError('INVALID_DATES');return time;};
 const start=parse(arrival),end=parse(departure),count=(end-start)/86400000;
 if(count<1||count>365)throw new ApiError('INVALID_DATES');return Array.from({length:count},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
}
export function createCore({db,stripe,config,sendMail,now=()=>Date.now()}){
 const token=orderId=>createHmac('sha256',config.tokenSecret).update('receipt/'+orderId).digest('base64url');
 const receiptUrl=order=>{const url=new URL('orders.html',config.siteUrl);url.searchParams.set('lang',order.locale);url.hash=new URLSearchParams({order:order.id,token:token(order.id)}).toString();return url.href;};
 const canPay=()=>Boolean(config.enabled&&stripe&&config.tokenSecret?.length>=32&&config.methods.length&&config.inventory?.currency&&config.timeZone&&config.mailFrom&&config.mailReady);
 const rowById=id=>db.prepare('SELECT * FROM orders WHERE id=?').get(id);
 const output=row=>({id:row.id,unit:row.unit,unitName:row.unit_name,arrival:row.arrival,departure:row.departure,guests:row.guests,email:row.email,name:row.name,method:row.method,locale:row.locale,total:row.total,currency:row.currency,status:row.status,createdAt:new Date(row.created).toISOString(),mailStatus:db.prepare('SELECT status FROM outbox WHERE order_id=?').get(row.id)?.status||'not_sent'});
 const gate=()=>{if(!canPay())throw new ApiError('SETUP_PENDING',503);};
 const quote=input=>{
  gate();const days=stayDays(input.arrival,input.departure);const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:config.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now()));const parts=Object.fromEntries(dateParts.map(p=>[p.type,p.value]));
  if(input.arrival<`${parts.year}-${parts.month}-${parts.day}`)throw new ApiError('INVALID_DATES');
  const unit=db.prepare('SELECT * FROM units WHERE id=?').get(String(input.unit));
  if(!unit||!Number.isSafeInteger(input.guests)||input.guests<1||input.guests>unit.capacity)throw new ApiError('INVALID_UNIT');
  let subtotal=0;
  for(const day of days){const n=db.prepare('SELECT * FROM inventory WHERE unit=? AND day=?').get(unit.id,day);if(!n?.available||db.prepare('SELECT 1 FROM occupied WHERE unit=? AND day=?').get(unit.id,day))throw new ApiError('UNAVAILABLE',409);subtotal+=n.rate;}
  const q={quoteId:randomUUID(),subtotal,cleaning:unit.cleaning,taxes:unit.taxes,total:subtotal+unit.cleaning+unit.taxes,currency:config.inventory.currency.toLowerCase()};
  if(!Number.isSafeInteger(q.total)||q.total>100000000)throw new ApiError('INVALID_TOTAL');
  db.prepare('INSERT INTO quotes VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(q.quoteId,unit.id,input.arrival,input.departure,input.guests,q.subtotal,q.cleaning,q.taxes,q.total,q.currency,now()+600000);
  return q;
 };
 const createCheckout=async input=>{
  gate();const email=emailValue(input.email);if(!config.methods.includes(input.method))throw new ApiError('METHOD_UNAVAILABLE');
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId||'')||![input.first,input.last].every(n=>typeof n==='string'&&n.trim().length>0&&n.length<=80))throw new ApiError('INVALID_INPUT');
  const payloadHash=sha(JSON.stringify([input.quoteId,email,input.first,input.last,input.method]));
  let order=transaction(db,()=>{
   const existing=db.prepare('SELECT * FROM orders WHERE request_id=?').get(input.requestId);
   if(existing){if(existing.payload_hash!==payloadHash)throw new ApiError('REQUEST_CONFLICT',409);if(existing.status!=='pending')throw new ApiError('ORDER_CLOSED',409);return existing;}
   const q=db.prepare('SELECT * FROM quotes WHERE id=?').get(input.quoteId);if(!q||q.expires<now())throw new ApiError('QUOTE_EXPIRED',409);
   const unit=db.prepare('SELECT * FROM units WHERE id=?').get(q.unit);if(!unit||q.guests>unit.capacity)throw new ApiError('INVALID_UNIT');const id='APT-'+randomBytes(9).toString('hex').toUpperCase();const name=input.locale==='zh'?input.last.trim()+input.first.trim():input.first.trim()+' '+input.last.trim();
   for(const day of stayDays(q.arrival,q.departure)){const n=db.prepare('SELECT available FROM inventory WHERE unit=? AND day=?').get(q.unit,day);if(!n?.available||db.prepare('SELECT 1 FROM occupied WHERE unit=? AND day=?').get(q.unit,day))throw new ApiError('UNAVAILABLE',409);}
   db.prepare('INSERT INTO orders(id,request_id,payload_hash,quote_id,unit,unit_name,arrival,departure,guests,email,name,method,locale,total,currency,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,\'pending\',?)').run(id,input.requestId,payloadHash,q.id,q.unit,unit.name,q.arrival,q.departure,q.guests,email,name,input.method,locale(input.locale),q.total,q.currency,now());
   for(const day of stayDays(q.arrival,q.departure))db.prepare('INSERT INTO occupied VALUES(?,?,?)').run(q.unit,day,id);
   return rowById(id);
  });
  // Reusing the provider key recovers an ambiguous network failure without charging twice.
  const session=order.session_id?await stripe.checkout.sessions.retrieve(order.session_id):await stripe.checkout.sessions.create({ui_mode:'embedded_page',mode:'payment',customer_email:email,payment_method_types:[order.method],...(order.method==='wechat_pay'?{payment_method_options:{wechat_pay:{client:'web'}}}:{}),line_items:[{price_data:{currency:order.currency,unit_amount:order.total,product_data:{name:order.unit_name+' · '+order.arrival+' / '+order.departure}},quantity:1}],client_reference_id:order.id,metadata:{order_id:order.id},return_url:receiptUrl(order),redirect_on_completion:'if_required',expires_at:Math.floor(order.created/1000)+1800,submit_type:'book'},{idempotencyKey:'checkout-'+order.id});
  if(session.status==='expired')throw new ApiError('ORDER_CLOSED',409);
  db.prepare('UPDATE orders SET session_id=? WHERE id=? AND session_id IS NULL').run(session.id,order.id);
  return {orderId:order.id,clientSecret:session.client_secret,readToken:token(order.id)};
 };
 const applyPaymentEvent=event=>{
  const supported=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'];if(!supported.includes(event.type))return;
  transaction(db,()=>{
   if(db.prepare('SELECT 1 FROM events WHERE id=?').get(event.id))return;
   const session=event.data.object;const order=rowById(session.metadata?.order_id);
   if(!order)return;
   if(session.client_reference_id!==order.id||(order.session_id&&order.session_id!==session.id)||session.livemode!==config.liveMode)throw new ApiError('EVENT_MISMATCH');
   if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&session.payment_status==='paid'){
    if(session.amount_total!==order.total||session.currency!==order.currency)throw new ApiError('AMOUNT_MISMATCH');
    const reserved=stayDays(order.arrival,order.departure).every(day=>db.prepare('SELECT order_id FROM occupied WHERE unit=? AND day=?').get(order.unit,day)?.order_id===order.id);
    db.prepare('UPDATE orders SET status=?,paid=COALESCE(paid,?),session_id=? WHERE id=?').run(reserved?'paid':'paid_review',now(),session.id,order.id);
    if(reserved)db.prepare('INSERT OR IGNORE INTO outbox(order_id,next_attempt,created) VALUES(?,?,?)').run(order.id,now(),now());
   }else if(['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type)&&order.status==='pending'){
    db.prepare('UPDATE orders SET status=? WHERE id=?').run(event.type.endsWith('expired')?'expired':'failed',order.id);db.prepare('DELETE FROM occupied WHERE order_id=?').run(order.id);
   }
   db.prepare('INSERT INTO events VALUES(?,?)').run(event.id,now());
  });
 };
 const flushMail=async()=>{
  for(const item of db.prepare("SELECT * FROM outbox WHERE status='pending' AND next_attempt<=? LIMIT 10").all(now())){
   const order=rowById(item.order_id);if(order.status!=='paid')continue;
   if(now()-item.created>23*3600000){db.prepare("UPDATE outbox SET status='attention' WHERE order_id=?").run(order.id);continue;}
   try{const email=mail.render(output(order),{orderUrl:receiptUrl(order)});const result=await sendMail({to:order.email,...email,idempotencyKey:'paid-'+order.id});if(!result.id)throw Error('MAIL_NOT_ACCEPTED');db.prepare("UPDATE outbox SET status='sent',provider_id=? WHERE order_id=?").run(result.id,order.id);}
   catch{db.prepare("UPDATE outbox SET attempts=attempts+1,next_attempt=? WHERE order_id=?").run(now()+Math.min(3600000,30000*2**Math.min(item.attempts,7)),order.id);}
  }
 };
 const readOrder=({orderId,token:provided})=>{if(typeof orderId!=='string'||typeof provided!=='string')throw new ApiError('NOT_FOUND',404);const order=rowById(orderId);if(!order||!equal(token(orderId),provided)||now()-order.created>30*86400000)throw new ApiError('NOT_FOUND',404);return {order:output(order)};};
 const requestAccess=async input=>{
  if(!config.mailReady||!config.tokenSecret)throw new ApiError('SETUP_PENDING',503);
  const email=emailValue(input.email);const id=randomUUID();const recent=db.prepare('SELECT COUNT(*) n,MAX(created) last FROM challenges WHERE email=? AND created>?').get(email,now()-3600000);
  if(recent.n>=5||recent.last>now()-60000)throw new ApiError('TRY_LATER',429);
  const code=String(randomInt(100000,1000000));db.prepare('INSERT INTO challenges(id,email,code_hash,expires,created) VALUES(?,?,?,?,?)').run(id,email,sha(id+code+config.tokenSecret),now()+600000,now());
  if(db.prepare('SELECT 1 FROM orders WHERE email=?').get(email)){
   const lang=locale(input.locale);const t=k=>copy.text(lang,k);void sendMail({to:email,subject:t('codeSubject'),text:t('codeIntro')+'\n\n'+code,html:`<div dir="${lang==='ar'?'rtl':'ltr'}" style="font-family:Arial,sans-serif;padding:30px;background:#f6f5f2;color:#242320"><h1 style="font-size:24px">${t('codeSubject')}</h1><p>${t('codeIntro')}</p><p style="font-size:32px;letter-spacing:8px" dir="ltr">${code}</p></div>`,idempotencyKey:'access-'+id}).catch(()=>{});
  }
  return {challengeId:id};
 };
 const verifyAccess=({challengeId,code})=>transaction(db,()=>{
  const challenge=db.prepare('SELECT * FROM challenges WHERE id=?').get(challengeId);
  if(!challenge||challenge.expires<now()||challenge.attempts>=5||!/^\d{6}$/.test(code||''))throw new ApiError('INVALID_CODE');
  // Failed attempt counters must commit too; caller throws after the transaction.
  if(!equal(challenge.code_hash,sha(challengeId+code+config.tokenSecret))){db.prepare('UPDATE challenges SET attempts=attempts+1 WHERE id=?').run(challengeId);return {invalid:true};}
  const accessToken=randomBytes(32).toString('base64url');db.prepare('DELETE FROM challenges WHERE id=?').run(challengeId);db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(accessToken),challenge.email,now()+3600000);return {accessToken};
 });
 const listOrders=({accessToken})=>{if(typeof accessToken!=='string'||accessToken.length>100)throw new ApiError('INVALID_ACCESS',401);const session=db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(sha(accessToken),now());if(!session)throw new ApiError('INVALID_ACCESS',401);return {orders:db.prepare('SELECT * FROM orders WHERE email=? ORDER BY created DESC LIMIT 50').all(session.email).map(output)};};
 const reconcile=async()=>{
  for(const order of db.prepare("SELECT * FROM orders WHERE status='pending' AND created<? LIMIT 20").all(now()-1800000)){
   // Never release a room merely because the browser closed or a local timer elapsed.
   if(!order.session_id)continue;
   const session=await stripe.checkout.sessions.retrieve(order.session_id);
   if(session.status==='expired')applyPaymentEvent({id:'reconcile-'+session.id,type:'checkout.session.expired',data:{object:session}});
  }
 };
 return {quote,createCheckout,applyPaymentEvent,flushMail,readOrder,requestAccess,verifyAccess,listOrders,reconcile,canPay};
}
