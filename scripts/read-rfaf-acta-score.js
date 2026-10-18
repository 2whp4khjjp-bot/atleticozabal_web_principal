// El marcador de cabecera puede estar en otra fila que los nombres de los equipos.
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const valid=score=>Array.isArray(score)&&score.length===2&&score.every(n=>Number.isInteger(n)&&n>=0&&n<=99);
function detailsFromSnapshot(snapshot,match){
 const round=snapshot.meta.match(/Jornada\s+(\d+)/i)?.[1];
 const date=snapshot.meta.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
 if(round&&Number(round)!==Number(match.round))return null;
 if(date&&match.date&&`${date[3]}-${date[2]}-${date[1]}`!==match.date)return null;
 const tables=snapshot.tables.filter(t=>t.rows.some(c=>c.length===3&&normalize(c[0])===normalize(match.home)&&normalize(c[2])===normalize(match.away)));
 const candidates=tables.flatMap(t=>t.scores).filter(valid);
 const unique=[...new Map(candidates.map(s=>[s.join('-'),s])).values()];
 if(unique.length!==1)return null;
 return {score:unique[0],ground:snapshot.ground||null};
}
function snapshotActa(){
 const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
 const readScore=element=>{
  // Leer los dígitos ya resueltos por RFAF, no el texto señuelo de sus scripts.
  const rendered=node=>{
   if(node.nodeType===3)return node.textContent||'';
   if(['SCRIPT','STYLE'].includes(node.tagName))return '';
   if(node.tagName==='I'&&node.id){const digit=[...node.classList].map(c=>c.match(/^fa-(\d{1,2})$/)?.[1]).find(v=>v!==undefined);if(digit!==undefined)return digit;}
   return [...node.childNodes].map(rendered).join('');
  };
  const found=clean(rendered(element)).match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);return found?[+found[1],+found[2]]:null;
 };
 return {meta:[...document.querySelectorAll('h4,h5')].map(e=>clean(e.innerText)).join(' '),ground:document.querySelector('a[href*="NFG_VisCampos"]')?.innerText?.trim()||null,
 tables:[...document.querySelectorAll('table')].map(table=>({rows:[...table.rows].filter(row=>row.closest('table')===table).map(row=>[...row.cells].map(c=>clean(c.innerText))),scores:[...table.querySelectorAll('h2,h3,.resultado,.marcador,.score,.result')].filter(e=>e.closest('table')===table).map(readScore).filter(Boolean)}))};
}
async function readActaDetails(page,match){
 if(!match.actaUrl)return null;
 try{
  const response=await page.goto(match.actaUrl,{waitUntil:'domcontentloaded',timeout:45000});
  if(!response?.ok())return null;
  const details=detailsFromSnapshot(await page.evaluate(snapshotActa),match);
  if(!details)console.warn('Acta sin marcador de cabecera verificable: '+match.actaUrl);
  return details;
 }catch(e){console.warn('Acta sin marcador verificable: '+match.actaUrl+' '+e.message);return null;}
}
async function readActaScore(page,match){return (await readActaDetails(page,match))?.score||null;}
module.exports={readActaScore,readActaDetails,detailsFromSnapshot,snapshotActa};
