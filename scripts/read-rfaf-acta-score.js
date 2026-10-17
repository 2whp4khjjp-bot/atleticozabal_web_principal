// Fallback conservador: extrae marcadores únicamente del encabezado del acta oficial.
const valid=s=>Array.isArray(s)&&s.length===2&&s.every(n=>Number.isInteger(n)&&n>=0&&n<=99);
async function readActaScore(page,match){
 if(!match.actaUrl)return null;
 try{
  const response=await page.goto(match.actaUrl,{waitUntil:'domcontentloaded',timeout:45000});
  if(!response?.ok())return null;
  const score=await page.evaluate(({home,away})=>{
   const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
   const h=norm(home),a=norm(away);
   // Solo un mismo encabezado con los dos equipos y un único marcador inequívoco.
   const targets=[document.title,...[...document.querySelectorAll('h1,h2,h3,h4,.resultado,.marcador,.score,.result')].map(e=>e.innerText||'')];
   const candidates=[];
   for(const text of targets){const n=norm(text);if(!n.includes(h)||!n.includes(a))continue;
    const found=[...text.matchAll(/(\d{1,2})\s*[-–:]\s*(\d{1,2})/g)];
    if(found.length===1)candidates.push([Number(found[0][1]),Number(found[0][2])]);
   }
   const unique=[...new Map(candidates.map(v=>[v.join('-'),v])).values()];
   return unique.length===1?unique[0]:null;
  },{home:match.home,away:match.away});
  return valid(score)?score:null;
 }catch(e){console.warn('Acta sin marcador verificable: '+match.actaUrl+' '+e.message);return null}
}
module.exports={readActaScore};
