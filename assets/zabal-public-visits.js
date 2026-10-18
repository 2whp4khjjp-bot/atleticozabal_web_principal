(()=>{'use strict';
const endpoint='https://zabal-visitas.raulcote7.chatgpt.site/api/visits';
const key='zabal-public-visits-session-v1';let busy=false,recorded=false;
const output=document.getElementById('public-visit-count');
const consent=()=>{try{return localStorage.getItem('zabal-analytics-consent-v1')==='accepted'}catch{return false}};
async function refresh(){if(busy)return;busy=true;try{
 let options={credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)};
 if(consent()&&!recorded){let session;try{session=sessionStorage.getItem(key);if(!session){session=crypto.randomUUID();sessionStorage.setItem(key,session)}}catch{} 
 if(session)options={...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session})};}
 const res=await fetch(endpoint,options);if(!res.ok)throw Error('unavailable');const data=await res.json();if(!Number.isSafeInteger(data.total)||data.total<0)throw Error('invalid');
 output.textContent=new Intl.NumberFormat('es-ES').format(data.total);if(options.method==='POST')recorded=true;
 }catch{if(output.textContent==='…')output.textContent='—';output.title='Estadísticas temporalmente no disponibles';}finally{busy=false}}
 refresh();document.addEventListener('click',()=>setTimeout(()=>{if(consent()&&!recorded)refresh()},0));window.addEventListener('storage',()=>{if(consent()&&!recorded)refresh()});document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(()=>{if(!document.hidden)refresh()},60000);
})();