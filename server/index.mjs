import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import Stripe from 'stripe';
import {openStore,configureInventory,transaction} from './store.mjs';
import {createCore,ApiError,sha} from './core.mjs';
export function readConfig(env=process.env){
 const inventoryPath=resolve(env.INVENTORY_PATH||'inventory.json');
 const inventory=existsSync(inventoryPath)?JSON.parse(readFileSync(inventoryPath,'utf8')):null;
 const enabled=env.ENABLE_PAYMENTS==='true';
 const config={enabled,inventory,siteUrl:env.SITE_URL,tokenSecret:env.TOKEN_SECRET||'',methods:(env.PAYMENT_METHODS||'').split(',').filter(Boolean),timeZone:env.PROPERTY_TIMEZONE,liveMode:(env.STRIPE_SECRET_KEY||'').startsWith('sk_live_'),publishableKey:env.STRIPE_PUBLISHABLE_KEY,webhookSecret:env.STRIPE_WEBHOOK_SECRET,mailFrom:env.MAIL_FROM,mailReady:Boolean(env.RESEND_API_KEY&&env.MAIL_FROM)};
 if(enabled){
  if(!config.siteUrl||new URL(config.siteUrl).protocol!=='https:'||config.tokenSecret.length<32||!config.timeZone||!config.inventory?.units?.length||!env.STRIPE_SECRET_KEY||!config.publishableKey||!config.webhookSecret||!config.mailReady||!config.methods.length||config.methods.some(m=>!['card','alipay','wechat_pay','paypal'].includes(m)))throw Error('Production setup incomplete; see .env.example and inventory.example.json.');
  if(config.liveMode!==config.publishableKey.startsWith('pk_live_'))throw Error('Stripe key modes do not match.');
  new Intl.DateTimeFormat('en',{timeZone:config.timeZone});
 }
 return config;
}
export function makeApi({db,config,stripe,sendMail}){
 const core=createCore({db,config,stripe,sendMail});let workerBusy=false;
 const flush=async()=>{if(workerBusy)return;workerBusy=true;try{await core.flushMail();}finally{workerBusy=false;}};
 const allowOrigin=config.siteUrl?new URL(config.siteUrl).origin:'';
 const limited=(key,max=120)=>transaction(db,()=>{const now=Date.now();let row=db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);if(!row||row.expires<now){db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,expires=excluded.expires').run(key,now+60000);return;}if(row.count>=max)throw new ApiError('TRY_LATER',429);db.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').run(key);});
 const body=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>(req.url==='/api/webhooks/stripe'?1048576:16384))throw new ApiError('BODY_TOO_LARGE',413);chunks.push(chunk);}return Buffer.concat(chunks);};
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const origin=req.headers.origin;
  if(origin===allowOrigin){res.setHeader('Access-Control-Allow-Origin',allowOrigin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json;charset=utf-8'});res.end(JSON.stringify(data));};
  try{
   if(origin&&origin!==allowOrigin)throw new ApiError('ORIGIN_NOT_ALLOWED',403);
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const path=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&path==='/api/config'){json(200,{enabled:core.canPay(),methods:core.canPay()?config.methods:[],publishableKey:core.canPay()?config.publishableKey:''});return;}
   if(req.method==='POST'&&path==='/api/webhooks/stripe'){
    if(!config.enabled||!stripe||!config.webhookSecret)throw new ApiError('SETUP_PENDING',503);
    let event;try{event=stripe.webhooks.constructEvent(await body(req),req.headers['stripe-signature'],config.webhookSecret);}catch{throw new ApiError('INVALID_SIGNATURE',400);}
    core.applyPaymentEvent(event);json(200,{received:true});flush().catch(()=>{});return;
   }
   if(req.method!=='POST')throw new ApiError('NOT_FOUND',404);
   const ip=sha((req.socket.remoteAddress||'unknown')+config.tokenSecret);limited('ip/'+ip);if(path==='/api/access/request')limited('access/'+ip,10);if(path==='/api/checkout')limited('checkout/'+ip,15);
   let input;try{input=JSON.parse((await body(req)).toString('utf8'));if(!input||typeof input!=='object'||Array.isArray(input))throw Error();}catch(error){if(error instanceof ApiError)throw error;throw new ApiError('INVALID_JSON');}
   let result;
   if(path==='/api/quote')result=core.quote(input);
   else if(path==='/api/checkout')result=await core.createCheckout(input);
   else if(path==='/api/orders/read')result=core.readOrder(input);
   else if(path==='/api/access/request')result=await core.requestAccess(input);
   else if(path==='/api/access/verify'){result=core.verifyAccess(input);if(result.invalid)throw new ApiError('INVALID_CODE');}
   else if(path==='/api/orders/list')result=core.listOrders(input);
   else throw new ApiError('NOT_FOUND',404);
   json(200,result);
  }catch(error){json(error instanceof ApiError?error.status:500,{code:error instanceof ApiError?error.code:'SERVICE_ERROR'});}
 });
 server.requestTimeout=30000;server.headersTimeout=35000;
 const timer=setInterval(()=>{flush().catch(()=>{});},15000);timer.unref();
 const reconcile=setInterval(()=>{if(config.enabled)core.reconcile().catch(()=>{});db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('DELETE FROM challenges WHERE expires<?').run(Date.now()-3600000);db.prepare('DELETE FROM rate_limits WHERE expires<?').run(Date.now());},60000);reconcile.unref();
 server.on('close',()=>{clearInterval(timer);clearInterval(reconcile);});
 return {server,core,flush};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const config=readConfig();const db=openStore(resolve(process.env.DB_PATH||'data/orders.sqlite'));
 if(config.inventory?.currency)configureInventory(db,config.inventory);
 const stripe=process.env.STRIPE_SECRET_KEY?new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:20000}):null;
 const sendMail=async email=>{if(!config.mailReady)throw Error('MAIL_SETUP_PENDING');const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':email.idempotencyKey},body:JSON.stringify({from:config.mailFrom,to:[email.to],subject:email.subject,html:email.html,text:email.text}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('MAIL_PROVIDER_ERROR');return response.json();};
 const {server}=makeApi({db,config,stripe,sendMail});server.listen(Number(process.env.PORT||4242),process.env.HOST||'127.0.0.1',()=>console.log('Booking API listening; payments '+(config.enabled?'enabled':'setup pending')));
}
