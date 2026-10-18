// Five independent federation groups, seven team feeds. Fail closed if a single-team group is ambiguous.
const fs=require('node:fs');
const {chromium}=require('playwright');
const {attachRfafActas,enrichRfafSchedule}=require('./rfaf-actas');
const {mergeStoredScores}=require('./preserve-rfaf-scores');
const {readActaDetails}=require('./read-rfaf-acta-score');
const base='https://www.rfaf.es';
const groups=[
 {key:'prebenjamin-polo',competition:'50209510',group:'50210111',team:'auto',kind:'ZABAL'},
 {key:'prebenjamin-c',competition:'50317849',group:'50318948',team:'auto',kind:'ZABAL'},
 {key:'prebenjamin-ab',competition:'50317849',group:'50319316',teams:[['prebenjamin-a','ATLETICO ZABAL "A"'],['prebenjamin-b','ATLETICO ZABAL "B"']]},
 {key:'alevin-atunara-mariano',competition:'49608278',group:'49789584',teams:[['alevin-atunara-mariano','ATUNARA ATLETICO C.D. "B"']],category:'Alevín',division:'4.ª Andaluza',groupName:'Grupo 5',competitionName:'4ª ANDALUZA ALEVIN (CADIZ)',competitionLabel:'Alevín Atunara · Mariano · 4.ª Andaluza · Grupo 5'},
 {key:'bebe-ab',competition:'50321366',group:'50423452',teams:[['bebe-a','ATLETICO ZABAL "A"'],['bebe-b','ATLETICO ZABAL "B"']],aggregation:'12934598',delegation:'3',game:'2'}
];
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[“”«»]/g,'"').replace(/\s+/g,' ').trim().toUpperCase();
const valid=s=>Array.isArray(s)&&s.length===2&&s.every(v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v)));
async function run(){
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({locale:'es-ES',timezoneId:'Europe/Madrid'});
  let succeeded=0; const failures=[];
  for(const cfg of groups.filter(cfg=>!process.env.RFAF_GROUP || cfg.key===process.env.RFAF_GROUP)){
   try {
   const source=base+'/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codgrupo='+cfg.group+'&codcompeticion='+cfg.competition+'&codtemporada=22&CodJornada=1&CDetalle=1'+(cfg.aggregation?'&cod_agrupacion='+cfg.aggregation:'');
   const groupUrl=base+'/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion='+cfg.competition+'&codgrupo='+cfg.group;
   const gr=await page.goto(groupUrl,{waitUntil:'domcontentloaded',timeout:45000});
   const response=await page.goto(source,{waitUntil:'domcontentloaded',timeout:45000});
   if(!response?.ok()||!page.url().includes('NFG_VisCalendario_Vis'))throw Error('Calendario no disponible: '+cfg.key);
   if(cfg.competitionName){const heading=await page.locator('h4').allTextContents();if(!heading.some(t=>/4.*ANDALUZA.*ALEVIN.*CADIZ.*Grupo\s+5/i.test(norm(t))))throw Error('La competición oficial ya no coincide con 4ª Andaluza Alevín Cádiz, grupo 5');}
   const all=await page.evaluate(()=>{
    const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
    const rows=[...new Set([...document.querySelectorAll('span.font_responsive')].map(el=>el.closest('div.row')).filter(Boolean))];
    return rows.map(row=>{
     const cells=[...row.querySelectorAll('table td')].slice(0,3).map(td=>clean(td.innerText));
     if(cells.length<3)return null;
     const text=row.innerText||'';
     const heading=row.parentElement?.querySelector('h5')?.innerText||'';
     const round=Number(heading.match(/Jornada\s+(\d+)/i)?.[1] || row.closest('[class*=jornada]')?.innerText?.match(/Jornada\s+(\d+)/i)?.[1]);
     const dt=text.match(/\b(\d{2})[-/](\d{2})[-/](\d{4})(?:\s*-\s*(\d{1,2}:\d{2}))?/);
     const scoreText=cells[1].match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
     const strong=[...row.querySelectorAll('table td')][1]?.querySelectorAll('strong')||[];
     let score=scoreText?[+scoreText[1],+scoreText[2]]:null;
     if(!score&&strong.length===2){const vals=[...strong].map(el=>{const encoded=[...el.querySelectorAll('i[id]')].map(i=>[...i.classList].map(c=>c.match(/^fa-(\d{1,2})$/)?.[1]).find(v=>v!==undefined));return encoded.length&&encoded.every(v=>v!==undefined)?encoded.join(''):clean(el.innerText)});if(vals.every(v=>/^\d{1,2}$/.test(v)))score=vals.map(Number)}
     const status=/\bsuspendid[oa]\b/i.test(text)||/\bsuspendid[oa]\b/i.test(cells[1])?'suspended':/\baplazad[oa]\b/i.test(text)||/\baplazad[oa]\b/i.test(cells[1])?'postponed':null;
     return {status,statusSource:status?'rfaf-calendar':null,round,date:dt?dt[3]+'-'+dt[2]+'-'+dt[1]:null,time:dt?.[4]||null,home:cells[0],away:cells[2],ground:row.querySelector('a[href*="NFG_VisCampos"]')?.innerText?.trim()||null,score};
    }).filter(Boolean);
   });
   if(!all.length)throw Error('No se encontraron filas: '+cfg.key);
   if(cfg.key==='bebe-ab') console.log('Diagnóstico Bebé: filas='+all.length+'; muestra='+JSON.stringify(all.slice(0,5).map(m=>({round:m.round,date:m.date,home:m.home,away:m.away}))));
   // La RFAF puede usar comillas tipográficas o espacios diferentes en los nombres.

   let teams=cfg.teams;
   if(!teams){
    const candidates=[...new Set(all.flatMap(m=>[m.home,m.away]).filter(n=>(cfg.kind==='ATUNARA'?/ATUNARA/.test(norm(n)):/ATLETICO ZABAL/.test(norm(n)))))];
    if(candidates.length!==1)throw Error('Nombre federativo no identificado ('+cfg.key+'): '+JSON.stringify(candidates)+'; muestra='+JSON.stringify(all.slice(0,5).map(m=>[m.home,m.away])));
    teams=[[cfg.key,candidates[0]]];
   }
   const nameSet=new Set(teams.map(t=>norm(t[1])));
   const selected=all.filter(m=>(nameSet.has(norm(m.home))||nameSet.has(norm(m.away)))&&!/descansa/i.test(m.home+' '+m.away));
   if(!selected.length||selected.some(m=>!m.round||!m.home||!m.away))throw Error('Datos estructurales incompletos de '+cfg.key+': '+JSON.stringify(selected.filter(m=>!m.round||!m.home||!m.away).slice(0,6)));
   const undated=selected.filter(m=>!m.date);
   if(undated.length)console.warn(cfg.key+': '+undated.length+' partidos pendientes de fecha oficial; se conservarán en el calendario del equipo y no se mostrarán en la agenda semanal hasta que la RFAF confirme fecha: '+JSON.stringify(undated.map(m=>({round:m.round,home:m.home,away:m.away}))));
   const byMatch=new Map();
   // Los partidos sin fecha aún no pueden representarse en las páginas ni en ICS.
   // Se recuperan automáticamente cuando la RFAF les asigne fecha.
   for(const m of selected.filter(match=>!!match.date)){const key=[m.round,norm(m.home),norm(m.away)].join('|');const old=byMatch.get(key);if(!old||(!old.time&&m.time))byMatch.set(key,m)}
   const matches=[...byMatch.values()];
   await enrichRfafSchedule(page,matches,{base,source});
   await attachRfafActas(page,matches,{base,competition:cfg.competition,group:cfg.group,season:'22'});
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
   const rounds=[...new Set(matches.filter(m=>m.date<=today&&!valid(m.score)).map(m=>m.round))].sort((a,b)=>a-b);
   for(const round of rounds){
    const u=base+'/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion='+cfg.competition+'&CodGrupo='+cfg.group+'&CodTemporada=22&CodJornada='+round+(cfg.aggregation?'&cod_agrupacion='+cfg.aggregation+'&Sch_Codigo_Delegacion='+cfg.delegation+'&Sch_Tipo_Juego='+cfg.game:'');
    const response=await page.goto(u,{waitUntil:'domcontentloaded',timeout:45000});
    if(!response?.ok())continue;
    for(const m of matches.filter(x=>x.round===round&&!valid(x.score))){
     const found=await page.evaluate(({home,away})=>{
      const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
      const row=[...document.querySelectorAll('tr')].find(r=>{const c=[...r.children].filter(n=>n.tagName==='TD');return c.length>=3&&norm(c[0].innerText)===norm(home)&&norm(c[2].innerText)===norm(away)});
      if(!row)return null;const middle=[...row.children].filter(n=>n.tagName==='TD')[1];const value=(middle.innerText||'').replace(/\s+/g,' ').trim().match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);return value?[+value[1],+value[2]]:null;
     },{home:m.home,away:m.away});
     if(valid(found)){m.score=found;m.scoreSource='rfaf-round-results'}
    }
   }
   for(const m of matches.filter(x=>x.date<=today&&!valid(x.score)&&x.actaUrl)){
    const details=await readActaDetails(page,m);const found=details?.score;
    if(details?.ground&&!m.ground)m.ground=details.ground;
    if(valid(found)){m.score=found;m.scoreSource='acta: '+m.actaUrl;console.log('Marcador del acta '+m.round+': '+found.join('-'))}
   }
   // Conserva avisos del club mientras la RFAF no publique una nueva fecha ni un estado concluyente.
   for(const [key,official] of teams){
    const list=matches.filter(m=>norm(m.home)===norm(official)||norm(m.away)===norm(official)).map(m=>({...m}));
    if(!list.length)throw Error('Sin partidos para '+key);
    const path='data/'+key+'-rfaf.json';mergeStoredScores(path,list);
    if(fs.existsSync(path)){const prev=JSON.parse(fs.readFileSync(path,'utf8'));for(const m of list){const old=(prev.matches||[]).find(x=>Number(x.round)===Number(m.round)&&norm(x.home)===norm(m.home)&&norm(x.away)===norm(m.away));if(old?.status==='suspended'&&old.statusSource==='club-report'&&!m.status&&!valid(m.score)&&old.date===m.date){m.status=old.status;m.statusSource=old.statusSource;m.statusNote=old.statusNote;}}}
    fs.mkdirSync('data',{recursive:true});
    fs.writeFileSync(path,JSON.stringify({source,updatedAt:new Date().toISOString(),officialTeam:official,competition:cfg.competition,group:cfg.group,...(cfg.competitionName?{category:cfg.category,division:cfg.division,groupName:cfg.groupName,competitionName:cfg.competitionName,competitionLabel:cfg.competitionLabel}:{}),standing:null,matches:list},null,2)+'\n');
    console.log(key+': '+list.length+' partidos, '+list.filter(m=>valid(m.score)).length+' marcadores');
   }
   succeeded++;
   } catch(error) { failures.push(cfg.key+': '+error.message); console.error('Grupo no sincronizado: '+cfg.key+': '+error.message); }
  }
  console.log('Grupos completados: '+succeeded+'/'+groups.length);
  if(failures.length)console.warn('Grupos pendientes: '+failures.join(' | '));
  if(!succeeded)throw Error('Ningún grupo se ha podido actualizar');
 }finally{await browser.close()}
}
run().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
