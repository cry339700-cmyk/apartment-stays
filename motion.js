/* Native, finite UI transitions. No animation loop, pointer tracking or dependency. */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const easing = 'cubic-bezier(.22,1,.36,1)';
  const active = new WeakMap();
  const run = (node,frames,options={}) => {
    if(!node || reduced.matches || !node.animate)return null;
    active.get(node)?.cancel();
    const animation=node.animate(frames,{duration:420,easing,...options});
    active.set(node,animation);
    animation.finished.catch(()=>{});
    return animation;
  };
  const pulse = (target,event) => {
    if(reduced.matches || target.matches(':disabled'))return;
    // Pressing an interactive element acknowledges the action without delaying it.
    run(target,[{transform:'scale(1)'},{transform:'scale(.965)',offset:.32},{transform:'scale(1)'}],{duration:430});
    if(target.matches('.button,.icon-button,.close-button,.unit-option')){
      const bounds=target.getBoundingClientRect();
      const size=Math.max(bounds.width,bounds.height)*1.7;
      const ripple=document.createElement('span');ripple.className='click-ripple';ripple.setAttribute('aria-hidden','true');
      const x=event?.clientX ? event.clientX-bounds.left : bounds.width/2;
      const y=event?.clientY ? event.clientY-bounds.top : bounds.height/2;
      Object.assign(ripple.style,{width:size+'px',height:size+'px',left:(x-size/2)+'px',top:(y-size/2)+'px'});
      target.append(ripple);
      const wave=ripple.animate([{transform:'scale(.1)',opacity:.2},{transform:'scale(1)',opacity:0}],{duration:580,easing:'ease-out'});
      wave.finished.then(()=>ripple.remove()).catch(()=>ripple.remove());
    }
  };
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const target=event.target.closest('button,a.text-link,summary');if(target)pulse(target,event);
  });
  document.addEventListener('click',event=>{
    if(event.detail===0){const target=event.target.closest('button,a.text-link,summary');if(target)pulse(target);}
  });
  let observer;
  const show = node => {node.classList.add('is-visible');observer?.unobserve(node);};
  const reveal = () => {
    const targets=document.querySelectorAll('[data-reveal],.apartment-card,.faq-list details');
    if(reduced.matches || !('IntersectionObserver' in window)) {
      observer?.disconnect();
      document.documentElement.classList.remove('motion-ready');
      targets.forEach(show);
      return;
    }
    try {
      observer ??= new IntersectionObserver(entries=>{
        for(const entry of entries)if(entry.isIntersecting)show(entry.target);
      },{threshold:.12,rootMargin:'0px 0px -48px 0px'});
      document.documentElement.classList.add('motion-ready');
      for(const node of targets){
        if(node.classList.contains('reveal'))continue;
        node.classList.add('reveal');
        const siblings=[...node.parentElement.children];
        const order=node.matches('.apartment-card')?siblings.indexOf(node)%3:node.matches('.faq-list details,.journey-steps li')?siblings.indexOf(node)%3:0;
        node.style.setProperty('--reveal-delay',`${Number(node.dataset.revealDelay)||order*110}ms`);
        observer.observe(node);
      }
    } catch {
      // Content remains available if a browser does not support observation.
      document.documentElement.classList.remove('motion-ready');
      targets.forEach(show);
    }
  };
  reduced.addEventListener('change',reveal);
  document.addEventListener('focusin',event=>{
    const target=event.target.closest('.reveal');if(target)show(target);
  });
  const openDialog = dialog => run(dialog,[{opacity:0,transform:'translateY(20px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:460});
  const closeDialog = (dialog,done) => {
    if(dialog.classList.contains('is-closing'))return;
    dialog.classList.add('is-closing');
    const animation=run(dialog,[{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(12px) scale(.99)'}],{duration:190,easing:'ease-in'});
    const finish=()=>{dialog.classList.remove('is-closing');done();};
    if(animation)animation.finished.then(finish).catch(finish);else finish();
  };
  window.ApartmentMotion={
    refresh:reveal,
    openDialog,closeDialog,
    step:(node,back=false)=>run(node,[{opacity:.2,transform:`translateX(${back?-12:12}px)`},{opacity:1,transform:'translateX(0)'}],{duration:350}),
    selection:node=>run(node,[{transform:'scale(.97)'},{transform:'scale(1.025)',offset:.55},{transform:'scale(1)'}],{duration:400}),
    error:node=>run(node,[{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:240}),
    pulse,
    gallery:async(image,next,source)=>{
      if(reduced.matches){image.src=source;return;}
      next.src=source;
      try{await next.decode();}catch{}
      next.classList.add('is-transitioning');
      const incoming=run(next,[{opacity:0,transform:'scale(1.025)'},{opacity:1,transform:'scale(1)'}],{duration:650,fill:'forwards'});
      const outgoing=run(image,[{transform:'scale(1)'},{transform:'scale(1.018)'}],{duration:650});
      try{if(incoming)await incoming.finished;}catch{}
      image.src=source;
      try{await image.decode();}catch{}
      incoming?.cancel();outgoing?.cancel();next.classList.remove('is-transitioning');
    }
  };
})();
