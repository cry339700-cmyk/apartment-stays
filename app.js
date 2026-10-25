'use strict';
/* Preview architecture: in-memory demo state only. This is NOT a reservation
   backend. A production provider must replace quote, hold, payment and confirm. */
(() => {
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="assets/icons.svg#${name}"></use></svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const locales = Object.keys(window.COPY);
  const url = new URL(location.href);
  const localeParameter = url.searchParams.get('lang');
  const requested = /^zh(?:-cn|-hans)?$/i.test(localeParameter || '') ? 'zh' : localeParameter;
  let stored = null;
  try { stored = localStorage.getItem('apartment-preview-language'); } catch {}
  let lang = locales.includes(requested) ? requested : locales.includes(stored) ? stored : 'en';
  let expanded = false;
  let imageIndex = 0;
  let step = 0;
  let lastTrigger = null;
  let toastTimer;
  let galleryBusy = false;
  let previousStep = 0;
  const motion = window.ApartmentMotion;
  const images = ['hero', 'bedroom', 'detail'];
  const state = {unit:'',arrival:'',departure:'',guests:'2',quote:null,reference:null,person:{first:'',last:'',email:'',ack:false},draft:{rate:'',currency:'',availability:'',cleaning:'',taxes:''}};
  const personName = () => lang==='zh' ? state.person.last+state.person.first : state.person.first+' '+state.person.last;
  const t = (group, index) => window.COPY[lang][group][index];
  const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const dateNumber = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const n = Date.parse(value+'T00:00:00Z');
    return Number.isFinite(n) && new Date(n).toISOString().slice(0,10)===value ? n : NaN;
  };
  const nights = () => Math.round((dateNumber(state.departure)-dateNumber(state.arrival))/86400000);
  const prettyDate = value => {
    const n=dateNumber(value);
    return Number.isFinite(n) ? new Intl.DateTimeFormat(lang,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(n) : '';
  };
  const unitLabel = unit => `${t('rooms',2)} ${String(unit).padStart(2,'0')}`;
  const imageFor = unit => images[(Number(unit)-1)%images.length];
  const amount = cents => {
    const currency=state.quote?.currency || state.draft.currency;
    try {return new Intl.NumberFormat(lang,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);}
    catch {return `${(cents/100).toFixed(2)} ${currency}`;}
  };
  const setStay = next => {
    if (['unit','arrival','departure','guests'].some(k => k in next && String(next[k])!==state[k])) {
      state.quote=null; state.reference=null;
    }
    Object.assign(state,next);
  };
  const error = message => {
    const target=$('#form-error');
    if(target){target.textContent=message;target.focus();motion?.error(target);}
    else toast(message);
  };
  const toast = message => {
    clearTimeout(toastTimer);
    $('#toast').textContent=message;$('#toast').classList.add('visible');
    toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);
  };
  const validStay = () => {
    if (!state.unit || !Number.isInteger(Number(state.unit)) || Number(state.unit)<1 || Number(state.unit)>12) return t('booking',6);
    if (!Number.isFinite(dateNumber(state.arrival)) || !Number.isFinite(dateNumber(state.departure)) || nights()<1) return t('dates',1);
    if (state.arrival<today()) return t('dates',2);
    if (!/^\d+$/.test(state.guests) || !Number.isSafeInteger(Number(state.guests)) || Number(state.guests)<1) return t('dates',3);
    return '';
  };
  const finderState = () => ({unit:$('#finder-unit').value,arrival:$('#finder-arrival').value,departure:$('#finder-departure').value,guests:$('#finder-guests').value});
  const syncFinder = () => {
    $('#finder-unit').innerHTML=`<option value="">${escape(t('finder',1))}</option>`+Array.from({length:12},(_,i)=>`<option value="${i+1}">${escape(unitLabel(i+1))}</option>`).join('');
    $('#finder-unit').value=state.unit;
    $('#finder-arrival').value=state.arrival;$('#finder-departure').value=state.departure;$('#finder-guests').value=state.guests;
    $('#finder-arrival').min=today();$('#finder-departure').min=state.arrival || today();
    for(const [id,index] of [['finder-unit',0],['finder-arrival',2],['finder-departure',3],['finder-guests',4]]) $('#'+id).setAttribute('aria-label',t('finder',index));
  };
  const renderRooms = () => {
    $('#apartment-grid').innerHTML=Array.from({length:expanded?12:3},(_,i)=>{
      const unit=i+1;
      return `<article class="apartment-card"><a href="#reserve-${unit}" class="apartment-photo" data-unit="${unit}" aria-label="${escape(unitLabel(unit)+' / '+t('rooms',3))}"><img src="assets/${imageFor(unit)}.webp" loading="lazy" width="1536" height="1024" alt="${escape(t('hero',3))}"></a><div class="room-heading"><h3>${escape(unitLabel(unit))}</h3><span class="room-index" dir="ltr">${String(unit).padStart(2,'0')} / 12</span></div><p class="room-meta">${escape(t('rooms',6))}</p><div class="room-bottom"><span class="room-price">${escape(t('rooms',7))}</span><button class="room-button" data-unit="${unit}"><span>${escape(t('rooms',3))}</span><span class="arrow">${icon('arrow-up-right')}</span></button></div></article>`;
    }).join('');
    $('#show-all').textContent=t('rooms',expanded?5:4);
    $('#show-all').setAttribute('aria-expanded',String(expanded));
    $('#show-all').setAttribute('aria-controls','apartment-grid');
    motion?.refresh();
  };
  const renderFaq = () => {
    $('#faq-list').innerHTML=[1,3,5,7].map(i=>`<details><summary>${escape(t('faq',i))}</summary><p>${escape(t('faq',i+1))}</p></details>`).join('');
  };
  const notice = () => `<p class="notice">${escape(t('booking',2))}</p>`;
  const actions = (continueText=t('booking',4),disabled=false,back=true) => `<div id="form-error" class="form-error" role="alert" tabindex="-1"></div><div class="booking-actions">${back?`<button type="button" class="back-button" data-flow="back">${escape(t('booking',3))}</button>`:'<span></span>'}<button class="button" type="submit" ${disabled?'disabled':''}>${escape(continueText)} <span class="arrow">${icon('arrow-up-right')}</span></button></div>`;
  const summary = () => `<div class="booking-summary"><img src="assets/${imageFor(state.unit)}.webp" alt="${escape(t('hero',3))}"><div><h3>${escape(unitLabel(state.unit))}</h3><p>${escape(prettyDate(state.arrival))} → ${escape(prettyDate(state.departure))}<br>${lang==='zh'?`${escape(nights())} 晚 / ${escape(state.guests)} 位住客`:`${escape(nights())} ${escape(t('quote',17))} / ${escape(state.guests)} ${escape(t('finder',4))}`}</p></div></div>`;
  const lines = () => {
    const q=state.quote;
    return `<div class="quote-lines"><div class="quote-line"><span>${escape(t('quote',2))} × ${nights()}</span><span>${q?escape(amount(q.rate*nights())):escape(t('quote',1))}</span></div><div class="quote-line"><span>${escape(t('quote',3))}</span><span>${q?escape(amount(q.cleaning)):escape(t('quote',1))}</span></div><div class="quote-line"><span>${escape(t('quote',4))}</span><span>${q?escape(amount(q.taxes)):escape(t('quote',1))}</span></div><div class="quote-line total"><span>${escape(t('quote',5))}</span><span>${q?escape(amount(q.total)):escape(t('quote',1))}</span></div></div>`;
  };
  const field = (label,name,value,type='text',extra='') => `<label class="field"><span>${escape(label)}</span><input name="${name}" id="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
  const nameFields = () => (lang==='zh'?['last','first']:['first','last']).map(name=>field(t('pay',name==='first'?0:1),name,state.person[name],'text','required maxlength="80" autocomplete="off" dir="auto"')).join('');
  const renderBooking = () => {
    const body=$('#booking-body');
    $('#booking-steps').innerHTML=window.COPY[lang].steps.map((s,i)=>`<li class="${i===step?'current':i<step?'done':''}" ${i===step?'aria-current="step"':''}>${escape(s)}</li>`).join('');
    if(step===0){
      body.innerHTML=`${notice()}<form id="unit-form"><p class="quote-state" style="margin-bottom:15px">${escape(t('booking',7))}</p><div class="unit-picker">${Array.from({length:12},(_,i)=>`<button type="button" class="unit-option ${state.unit===String(i+1)?'selected':''}" data-select-unit="${i+1}" aria-pressed="${state.unit===String(i+1)}"><span class="selection-check">${icon('check')}</span><strong>${escape(unitLabel(i+1))}</strong><span>${escape(t('rooms',7))}</span></button>`).join('')}</div>${actions(t('booking',4),!state.unit,false)}</form>`;
    } else if(step===1){
      body.innerHTML=`${notice()}<form id="dates-form"><div class="booking-summary"><img src="assets/${imageFor(state.unit)}.webp" alt="${escape(t('hero',3))}"><div><h3>${escape(unitLabel(state.unit))}</h3><p>${escape(t('rooms',6))}</p></div></div><div class="form-grid">${field(t('finder',2),'arrival',state.arrival,'date',`required min="${today()}"`)}${field(t('finder',3),'departure',state.departure,'date',`required min="${state.arrival||today()}"`)}${field(t('finder',4),'guests',state.guests,'number','required min="1" step="1"')}</div>${actions()}</form>`;
    } else if(step===2){
      body.innerHTML=`${notice()}${summary()}<p class="quote-state">${escape(state.quote?t('quote',19):t('quote',0))}</p>${lines()}<details class="demo-config" ${state.quote?'':'open'}><summary>${escape(t('quote',6))}</summary><p>${escape(t('quote',7))}</p><form id="quote-form"><div class="form-grid">${field(t('quote',8),'rate',state.draft.rate,'number','required min="0.01" max="1000000" step="0.01" inputmode="decimal"')}${field(t('quote',9),'currency',state.draft.currency,'text','required pattern="[A-Za-z]{3}" maxlength="3" dir="ltr" autocomplete="off"')}${field(t('quote',3)+' / '+t('quote',20),'cleaning',state.draft.cleaning,'number','min="0" max="1000000" step="0.01" inputmode="decimal"')}${field(t('quote',4)+' / '+t('quote',20),'taxes',state.draft.taxes,'number','min="0" max="1000000" step="0.01" inputmode="decimal"')}<label class="field wide"><span>${escape(t('quote',10))}</span><select name="availability" id="availability" required><option value="">${escape(t('quote',11))}</option><option value="yes" ${state.draft.availability==='yes'?'selected':''}>${escape(t('quote',12))}</option><option value="no" ${state.draft.availability==='no'?'selected':''}>${escape(t('quote',13))}</option></select></label></div><button class="button button-outline" type="submit">${escape(t('quote',14))}</button></form></details>${state.quote?.availability==='no'?`<p class="form-error">${escape(t('quote',16))}</p>`:''}<form id="quote-next">${actions(t('booking',4),!state.quote || state.quote.availability!=='yes')}</form>`;
    } else if(step===3){
      body.innerHTML=`${notice()}${summary()}<form id="payment-form"><div class="form-grid">${nameFields()}<div class="wide">${field(t('pay',2),'email',state.person.email,'email','required maxlength="160" autocomplete="off" dir="ltr"')}</div></div><div class="payment-placeholder">${escape(t('pay',5))}<br>${escape(t('pay',4))}</div>${lines()}<label class="check-label"><input id="ack" name="ack" type="checkbox" required ${state.person.ack?'checked':''}><span>${escape(t('pay',3))}</span></label>${actions(t('pay',6))}</form>`;
    } else if(step===4){
      body.innerHTML=`<div class="confirmation"><span class="success-symbol">${icon('check')}</span><h3>${escape(t('confirm',0))}</h3><p>${escape(t('confirm',1))}</p><div class="receipt"><div class="quote-line"><span>${escape(t('confirm',2))}</span><b dir="ltr">${escape(state.reference)}</b></div><div class="quote-line"><span>${escape(t('rooms',2))}</span><span>${escape(unitLabel(state.unit))}</span></div><div class="quote-line"><span>${escape(t('finder',2))}</span><span>${escape(prettyDate(state.arrival))}</span></div><div class="quote-line"><span>${escape(t('finder',3))}</span><span>${escape(prettyDate(state.departure))}</span></div><div class="quote-line"><span>${escape(t('finder',4))}</span><span>${escape(state.guests)}</span></div><div class="quote-line"><span>${escape(t('confirm',3))}</span><span dir="auto">${escape(personName())}</span></div>${lines()}<p class="quote-state">${escape(t('quote',19))}</p></div><div class="booking-actions"><button class="button button-outline" data-flow="download">${escape(t('confirm',4))}</button><button class="button" data-flow="restart">${escape(t('confirm',5))}</button></div></div>`;
    }
    motion?.step(body,step<previousStep);previousStep=step;
  };
  const captureDrafts = () => {
    if(step===1 && $('#dates-form')) setStay({arrival:$('#arrival').value,departure:$('#departure').value,guests:$('#guests').value});
    if(step===2 && $('#quote-form')) for(const k of Object.keys(state.draft)) state.draft[k]=$('#'+k).value;
    if(step===3 && $('#payment-form')) {
      for(const k of ['first','last','email']) state.person[k]=$('#'+k).value;
      state.person.ack=$('#ack').checked;
    }
  };
  const translate = () => {
    document.documentElement.lang=lang==='zh'?'zh-CN':lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
    for(const el of $$('[data-text]')){const [group,index]=el.dataset.text.split('.');el.textContent=t(group,Number(index));}
    $('#language').value=lang;
    for(const brand of $$('[data-brand]'))brand.textContent=lang==='zh'?'公寓旅居':'the apartments';
    $('.site-header .brand').setAttribute('aria-label',lang==='zh'?'公寓旅居，返回首页':'The Apartments, home');
    $('.desktop-nav').setAttribute('aria-label',lang==='zh'?'主导航':'Main navigation');
    $('#language').setAttribute('aria-label',lang==='zh'?'界面语言':'Language');
    updateThemeLabel();
    $('#close-booking').setAttribute('aria-label',t('booking',5));$('#close-policy').setAttribute('aria-label',t('booking',5));
    $('#hero-image').alt=t('hero',3);$('.about-media img').alt=t('hero',3);
    $('#previous-image').setAttribute('aria-label',t('booking',3));$('#next-image').setAttribute('aria-label',t('booking',4));
    document.title=lang==='zh'?'公寓旅居｜中文界面预览':`${t('rooms',2)} | ${t('footer',3)}`;
    syncFinder();renderRooms();renderFaq();if($('#booking-dialog').open)renderBooking();
    motion?.refresh();
  };
  const openBooking = (unit='',targetStep=0) => {
    lastTrigger=document.activeElement;
    if(unit)setStay({unit:String(unit)});
    step=targetStep;renderBooking();
    $('#booking-dialog').showModal();
    motion?.openDialog($('#booking-dialog'));
  };
  const closeBooking = () => {captureDrafts();syncFinder();const finish=()=>{$('#booking-dialog').close();lastTrigger?.focus();};if(motion)motion.closeDialog($('#booking-dialog'),finish);else finish();};
  const go = target => {step=target;renderBooking();$('#booking-dialog').scrollTop=0;};
  const appearanceLabels={zh:['切换为暗色外观','切换为浅色外观'],en:['Switch to dark appearance','Switch to light appearance'],pt:['Ativar tema escuro','Ativar tema claro'],fr:['Activer le thème sombre','Activer le thème clair'],es:['Activar tema oscuro','Activar tema claro'],ru:['Включить тёмную тему','Включить светлую тему'],ar:['تفعيل المظهر الداكن','تفعيل المظهر الفاتح']};
  function updateThemeLabel(){const dark=document.documentElement.dataset.theme==='dark';$('#theme-toggle').setAttribute('aria-label',appearanceLabels[lang][dark?1:0]);$('#theme-toggle').setAttribute('aria-pressed',String(dark));$('meta[name="theme-color"]').content=dark?'#1d1c1a':'#f6f5f2';}
  $('#theme-toggle').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('apartment-preview-theme',next);}catch{}updateThemeLabel();});
  $('#language').addEventListener('change',event=>{
    if($('#booking-dialog').open)captureDrafts();else setStay(finderState());
    lang=event.target.value;
    try{localStorage.setItem('apartment-preview-language',lang);}catch{}
    const next=new URL(location.href);next.searchParams.set('lang',lang);history.replaceState(null,'',next);
    translate();
  });
  $('#finder-arrival').addEventListener('change',()=>{$('#finder-departure').min=$('#finder-arrival').value||today();});
  $('#finder').addEventListener('submit',event=>{
    event.preventDefault();setStay(finderState());
    const message=validStay();if(message){toast(message);return;}
    openBooking('',2);
  });
  document.addEventListener('click',event=>{
    const unit=event.target.closest('[data-unit]');
    if(unit){event.preventDefault();setStay(finderState());openBooking(unit.dataset.unit,1);return;}
    if(event.target.closest('[data-action="book"]')){setStay(finderState());openBooking('',0);}
  });
  $('#show-all').addEventListener('click',()=>{expanded=!expanded;renderRooms();});
  const cycle = async delta => {if(galleryBusy)return;galleryBusy=true;imageIndex=(imageIndex+delta+images.length)%images.length;$('#image-index').textContent=`0${imageIndex+1} / 03`;try{if(motion)await motion.gallery($('#hero-image'),$('#hero-image-next'),`assets/${images[imageIndex]}.webp`);else $('#hero-image').src=`assets/${images[imageIndex]}.webp`;}finally{galleryBusy=false;}};
  $('#previous-image').addEventListener('click',()=>cycle(-1));$('#next-image').addEventListener('click',()=>cycle(1));
  $('#close-booking').addEventListener('click',closeBooking);
  $('#booking-dialog').addEventListener('cancel',event=>{event.preventDefault();closeBooking();});
  $('#booking-dialog').addEventListener('click',event=>{
    if(event.target===$('#booking-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeBooking();}
  });
  $('#booking-body').addEventListener('click',event=>{
    const select=event.target.closest('[data-select-unit]');
    if(select){setStay({unit:select.dataset.selectUnit});for(const option of $$('.unit-option')){const selected=option===select;option.classList.toggle('selected',selected);option.setAttribute('aria-pressed',String(selected));}$('#unit-form button[type="submit"]').disabled=false;motion?.selection(select);return;}
    const action=event.target.closest('[data-flow]')?.dataset.flow;
    if(action==='back'){captureDrafts();go(Math.max(step-1,0));}
    if(action==='restart'){
      Object.assign(state,{unit:'',arrival:'',departure:'',guests:'2',quote:null,reference:null,person:{first:'',last:'',email:'',ack:false},draft:{rate:'',currency:'',availability:'',cleaning:'',taxes:''}});
      syncFinder();go(0);
    }
    if(action==='download'){
      const text=[t('confirm',0),t('confirm',1),'',`${t('confirm',2)}: ${state.reference}`,unitLabel(state.unit),`${t('finder',2)}: ${state.arrival}`,`${t('finder',3)}: ${state.departure}`,`${t('finder',4)}: ${state.guests}`,`${t('confirm',3)}: ${personName()}`,`${t('quote',5)}: ${amount(state.quote.total)}`,t('quote',19)].join('\n');
      const object=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
      const a=document.createElement('a');a.href=object;a.download=`${state.reference}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(object),1000);
    }
  });
  $('#booking-body').addEventListener('change',event=>{
    if(event.target.id==='arrival' && $('#departure'))$('#departure').min=event.target.value||today();
  });
  $('#booking-body').addEventListener('input',event=>{
    if(event.target.closest('#quote-form') && state.quote){
      captureDrafts();state.quote=null;
      const next=$('#quote-next button[type="submit"]');if(next)next.disabled=true;
      const currentLines=$('#booking-body .quote-lines');if(currentLines)currentLines.outerHTML=lines();
      const status=$('#booking-body>.quote-state');if(status)status.textContent=t('quote',0);
    }
  });
  $('#booking-body').addEventListener('submit',event=>{
    event.preventDefault();
    if(event.target.id==='unit-form'){if(!state.unit){error(t('booking',6));return;}go(1);}
    if(event.target.id==='dates-form'){
      captureDrafts();const message=validStay();if(message){error(message);return;}syncFinder();go(2);
    }
    if(event.target.id==='quote-form'){
      captureDrafts();const d=state.draft;const currency=d.currency.trim().toUpperCase();
      const numbers=[d.rate,d.cleaning||'0',d.taxes||'0'].map(Number);
      if(!/^[A-Z]{3}$/.test(currency)||!['yes','no'].includes(d.availability)||numbers.some(n=>!Number.isFinite(n)||n<0||n>1000000)||numbers[0]<=0){error(t('quote',15));return;}
      if(validStay()){error(validStay());return;}
      const [rate,cleaning,taxes]=numbers.map(n=>Math.round(n*100));
      state.draft.currency=currency;state.quote={rate,cleaning,taxes,currency,availability:d.availability,total:rate*nights()+cleaning+taxes};
      renderBooking();
    }
    if(event.target.id==='quote-next'){
      if(!state.quote||state.quote.availability!=='yes'||validStay())return;
      go(3);
    }
    if(event.target.id==='payment-form'){
      captureDrafts();
      if(!state.person.first.trim()||!state.person.last.trim()||!$('#email').validity.valid||!state.person.ack){error(t('pay',7));return;}
      if(!state.quote||state.quote.availability!=='yes'||validStay()){go(2);return;}
      const bytes=crypto.getRandomValues(new Uint8Array(4));
      state.reference='DEMO-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
      go(4);
    }
  });
  $('#policy-link').addEventListener('click',()=>{$('#policy-dialog').showModal();motion?.openDialog($('#policy-dialog'));});
  $('#close-policy').addEventListener('click',()=>{if(motion)motion.closeDialog($('#policy-dialog'),()=>$('#policy-dialog').close());else $('#policy-dialog').close();});
  translate();
})();
