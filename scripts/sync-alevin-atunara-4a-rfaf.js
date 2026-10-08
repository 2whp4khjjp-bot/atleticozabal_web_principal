// Sincroniza el calendario del Alevín Atunara A (4ª Andaluza, Grupo 4).
// Consulta resumen y extendido; la jornada se usa como respaldo para marcadores.
const fs=require('node:fs');
const {chromium}=require('playwright');
const {attachRfafActas,enrichRfafSchedule}=require('./rfaf-actas');
const base='https://www.rfaf.es';
const summarySource=base+'/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=22&codcompeticion=49608278&codgrupo=49789556&CodJornada=1&cod_agrupacion=1';
const source=base+'/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codgrupo=49789556&codcompeticion=49608278&codtemporada=22&CodJornada=1&CDetalle=1';
const official='ATUNARA ATLETICO C.D. "A"',key='alevin-atunara-4a';
const normal=s=>String(s||'').replace(/\\s+/g,' ').trim();
const oldPath='data/'+key+'-rfaf.json';
let oldMatches=[];
try{oldMatches=JSON.parse(fs.readFileSync(oldPath,'utf8')).matches||[]}catch{}
function hasScore(s){return Array.isArray(s)&&s.length===2&&s.every(Number.isFinite)}
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({locale:'es-ES',timezoneId:'Europe/Madrid'});
 const calendars=[];
 for(const url of [source,summarySource]){
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
   if(!response?.ok()||!page.url().includes('NFG_VisCalendario_Vis'))continue;
   const matches=await page.evaluate(name=>{
     const norm=v=>String(v||'').replace(/\\s+/g,' ').trim();
     const rows=[...document.querySelectorAll('div.row')].filter(row=>[...row.querySelectorAll('table td')].some(cell=>norm(cell.innerText)===name));
     return [...new Set(rows)].map(row=>{
       const heading=row.parentElement?.querySelector('h5');
       const h=(heading?.innerText||'').match(/Jornada\\s+(\\d+)\\s*\\((\\d{2})-(\\d{2})-(\\d{4})\\)/i);
       const cells=[...row.querySelectorAll('table td')].slice(0,3).map(cell=>norm(cell.innerText));
       const lines=(row.innerText||'').split(/\\n+/).map(x=>x.trim()).filter(Boolean);
       const dt=(row.innerText||'').match(/\\b(\\d{2})-(\\d{2})-(\\d{4})(?:\\s*-\\s*(\\d{2}:\\d{2}))?/);
       const sc=(cells[1]||'').match(/^(\\d{1,2})(?:\\s+|\\s*[-–:]\\s*)(\\d{1,2})$/);
       return {round:h?Number(h[1]):null,date:dt?dt[3]+'-'+dt[2]+'-'+dt[1]:h?h[4]+'-'+h[3]+'-'+h[2]:null,time:dt?.[4]||null,home:cells[0]||null,away:cells[2]||null,ground:lines.length>=3?lines[1]:null,score:sc?[Number(sc[1]),Number(sc[2])]:null};
     });
   },official);
   calendars.push(matches);
 }
 const extended=calendars[0]||[],summary=calendars[1]||[];
 const chosen=extended.length>=18?extended:summary;
 if(chosen.length<18)throw new Error('RFAF no ha devuelto las 18 jornadas en calendario resumido o extendido.');
 const byRound=new Map();
 for(const m of [...summary,...extended])if(m.round&&m.home&&m.away){
   const previous=byRound.get(m.round);
   byRound.set(m.round,{...(previous||{}),...m,date:m.date||previous?.date,time:m.time||previous?.time,ground:m.ground||previous?.ground,score:hasScore(m.score)?m.score:previous?.score||null});
 }
 const matches=[...byRound.values()].filter(m=>normal(m.home)===official||normal(m.away)===official).sort((a,b)=>a.round-b.round);
 if(matches.length!==18||matches.some(m=>!m.date||!m.home||!m.away))throw new Error('Calendario parcial o equipo no encontrado en las 18 jornadas.');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 for(const round of [...new Set(matches.filter(m=>m.date<=today&&!hasScore(m.score)).map(m=>m.round))]){
   const url=base+'/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22&CodGrupo=49789556&CodCompeticion=49608278&CodJornada='+round;
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
   if(!response?.ok()||!page.url().includes('NFG_CmpJornada'))continue;
   const roundMatches=matches.filter(m=>m.round===round);
   for(const m of roundMatches){
     const score=await page.evaluate(({home,away})=>{
       const norm=v=>String(v||'').replace(/\\s+/g,' ').trim().toUpperCase();
       const row=[...document.querySelectorAll('tr')].find(r=>{const c=[...r.children].filter(x=>x.tagName==='TD');return c.length===3&&norm(c[0].innerText)===norm(home)&&norm(c[2].innerText)===norm(away)});
       if(!row)return null;
       const spans=[...row.querySelectorAll('span.wid2_resultado_cerrada')];if(spans.length!==2)return null;
       const read=el=>{const visible=(el.innerText||'').match(/\\d+/);if(visible)return Number(visible[0]);const ds=[...el.querySelectorAll('[id]')].map(e=>{const c=[...e.classList].find(v=>/^fa-\\d$/.test(v));if(c)return c.slice(3);const s=(getComputedStyle(e,'::before').content||'').match(/\\d/);return s?s[0]:''}).join('');return /^\\d+$/.test(ds)?Number(ds):null};
       const s=spans.map(read);return s.every(Number.isFinite)?s:null;
     },{home:m.home,away:m.away});
     if(score){m.score=score;m.scoreSource='rfaf-round-results'}
   }
 }
 for(const m of matches){if(hasScore(m.score))continue;const prev=oldMatches.find(x=>Number(x.round)===Number(m.round)&&normal(x.home)===normal(m.home)&&normal(x.away)===normal(m.away));if(prev&&hasScore(prev.score)){m.score=prev.score;m.scoreSource=prev.scoreSource||'preserved-existing-score';if(!m.actaUrl&&prev.actaUrl)m.actaUrl=prev.actaUrl}}
 await enrichRfafSchedule(page,matches,{base,source});
 await attachRfafActas(page,matches,{base,competition:'49608278',group:'49789556'});
 fs.mkdirSync('data',{recursive:true});
 fs.writeFileSync(oldPath,JSON.stringify({source,summarySource,resultsSource:base+'/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22&CodGrupo=49789556&CodCompeticion=49608278&CodJornada=1',updatedAt:new Date().toISOString(),standing:null,matches},null,2)+'\\n');
 console.log('Alevín Atunara 4ª Andaluza: '+matches.length+' partidos, '+matches.filter(m=>hasScore(m.score)).length+' resultados.');
 }finally{await browser.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
