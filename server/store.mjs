import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, chmodSync} from 'node:fs';
import {dirname} from 'node:path';
export function openStore(path){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path);if(path!==':memory:')chmodSync(path,0o600);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS units(id TEXT PRIMARY KEY,name TEXT NOT NULL,capacity INTEGER NOT NULL,cleaning INTEGER NOT NULL,taxes INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS inventory(unit TEXT NOT NULL REFERENCES units(id),day TEXT NOT NULL,rate INTEGER NOT NULL CHECK(rate>0),available INTEGER NOT NULL,PRIMARY KEY(unit,day));
 CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,unit TEXT NOT NULL,arrival TEXT NOT NULL,departure TEXT NOT NULL,guests INTEGER NOT NULL,subtotal INTEGER NOT NULL,cleaning INTEGER NOT NULL,taxes INTEGER NOT NULL,total INTEGER NOT NULL,currency TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,payload_hash TEXT NOT NULL,quote_id TEXT NOT NULL REFERENCES quotes(id),unit TEXT NOT NULL,unit_name TEXT NOT NULL,arrival TEXT NOT NULL,departure TEXT NOT NULL,guests INTEGER NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,method TEXT NOT NULL,locale TEXT NOT NULL,total INTEGER NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL,session_id TEXT UNIQUE,created INTEGER NOT NULL,paid INTEGER);
 CREATE TABLE IF NOT EXISTS occupied(unit TEXT NOT NULL,day TEXT NOT NULL,order_id TEXT NOT NULL REFERENCES orders(id),PRIMARY KEY(unit,day));
 CREATE INDEX IF NOT EXISTS orders_email ON orders(email);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS outbox(order_id TEXT PRIMARY KEY REFERENCES orders(id),status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL,created INTEGER NOT NULL,provider_id TEXT);
 CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS challenges_email ON challenges(email,created);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 return db;
}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
export function configureInventory(db,config){
 if(!config)return;
 if(!/^(eur|usd|gbp|cny|cad|aud|chf|hkd|sgd|nzd|brl)$/i.test(config.currency||''))throw Error('Set a supported two-decimal currency.');
 const integer=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
 for(const unit of config.units){if(!/^\d{1,2}$/.test(unit.id)||!unit.name||!integer(unit.capacity,1)||!integer(unit.cleaning)||!integer(unit.taxes))throw Error('Invalid inventory unit configuration.');}
 for(const night of config.nights){if(!config.units.some(u=>u.id===night.unit)||!/^\d{4}-\d{2}-\d{2}$/.test(night.day)||!integer(night.rate,1)||typeof night.available!=='boolean')throw Error('Invalid nightly price configuration.');}
 transaction(db,()=>{
  for(const unit of config.units)db.prepare('INSERT INTO units VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,capacity=excluded.capacity,cleaning=excluded.cleaning,taxes=excluded.taxes').run(unit.id,unit.name,unit.capacity,unit.cleaning,unit.taxes);
  // Re-importing a complete calendar never removes an existing reservation.
  db.prepare('UPDATE inventory SET available=0').run();
  for(const n of config.nights)db.prepare('INSERT INTO inventory VALUES(?,?,?,?) ON CONFLICT(unit,day) DO UPDATE SET rate=excluded.rate,available=excluded.available').run(n.unit,n.day,n.rate,n.available?1:0);
 });
}
