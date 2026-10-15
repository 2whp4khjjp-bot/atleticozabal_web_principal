// Five independent federation groups, seven team feeds. Fail closed if a single-team group is ambiguous.
const fs=require('node:fs');
const {chromium}=require('playwright');
const {attachRfafActas,enrichRfafSchedule}=require('./rfaf-actas');
const {mergeStoredScores}=require('./preserve-rfaf-scores');
const base='https://www.rfaf.es';
const groups=[
 {key:'prebenjamin-polo',competition:'50209510',group:'50210111',team:'auto',kind:'ZABAL'},
 {key:'prebenjamin-c',competition:'50317849',group:'50318948',team:'auto',kind:'ZABAL'},
 {key:'prebenjamin-ab',competition:'50317849',group:'50319316',teams:[['prebenjamin-a','ATLETICO ZABAL "A"'],['prebenjamin-b','ATLETICO ZABAL "B"']]},
 {key:'alevin-atunara-mariano',competition:'49608278',group:'49789584',team:'auto',kind:'ATUNARA'},
 {key:'bebe-ab',competition:'50321366',group:'50423452',teams:[['bebe-a','ATLETICO ZABAL "A"'],['bebe-b','ATLETICO ZABAL "B"']],aggregation:'12934598',delegation:'3',game:'2'}
];
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const valid=s=>Array.isArray(s)&&s.length===2&&s.every(v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v)));
async function run(){
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({locale:'es-ES',timezoneId:'Europe/Madrid'});
  for(const cfg of groups){
   const source=base+'/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codgrupo='+cfg.group+'&codcompeticion='+cfg.competition+'&codtemporada=22&CodJornada=1&CDetalle=1'+(cfg.aggregation?'&cod_agrupacion='+cfg.aggregation:'');
   const groupUrl=base+'/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion='+cfg.competition+'&codgrupo='+cfg.group;
   const gr=await page.goto(groupUrl,{waitUntil:'domcontentloaded',timeout:45000});
   const response=await page.goto(source,{waitUntil:'domcontentloaded',timeout:45000});
   if(!response?.ok()||!page.url().includes('NFG_VisCalendario_Vis'))throw Error('Calendario no disponible: '+cfg.key);
   const all=await page.evaluate(()=>{
    const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
    const rows=[...new Set([...document.querySelectorAll('span.font_responsive')].map(el=>el.closest('div.row')).filter(Boolean))];
    return rows.map(row=>{
     const cells=[...row.querySelectorAll('table td')].slice(0,3).map(td=>clean(td.innerText));
     if(cells.length<3)return null;
     const text=row.innerText||'';
     const heading=row.parentElement?.querySelector('h5')?.innerText||'';
     const round=Number(heading.match(/Jornada\s+(\d+)/i)?.[1]);
     const dt=text.match(/\b(\d{2})[-/](\d{2})[-/](\d{4})(?:\s*-\s*(\d{1,2}:\d{2}))?/);
     const scoreText=cells[1].match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
     const strong=[...row.querySelectorAll('table td')][1]?.querySelectorAll('strong')||[];
     let score=scoreText?[+scoreText[1],+scoreText[2]]:null;
     if(!score&&strong.length===2){const vals=[...strong].map(el=>clean(el.innerText));if(vals.every(v=>/^\d{1,2}$/.test(v)))score=vals.map(Number)}
     return {round,date:dt?dt[3]+'-'+dt[2]+'-'+dt[1]:null,time:dt?.[4]||null,home:cells[0],away:cells[2],ground:row.querySelector('a[href*="NFG_VisCampos"]')?.innerText?.trim()||null,score};
    }).filter(Boolean);
   });
   if(!all.length)throw Error('No se encontraron filas: '+cfg.key);
   let teams=cfg.teams;
   if(!teams){
    const candidates=[...new Set(all.flatMap(m=>[m.home,m.away]).filter(n=>norm(n).includes('ATLETICO '+cfg.kind)))];
    if(candidates.length!==1)throw Error('Nombre federativo ambiguo ('+cfg.key+'): '+JSON.stringify(candidates));
    teams=[[cfg.key,candidates[0]]];
   }
   const nameSet=new Set(teams.map(t=>norm(t[1])));
   const selected=all.filter(m=>(nameSet.has(norm(m.home))||nameSet.has(norm(m.away)))&&!/descansa/i.test(m.home+' '+m.away));
   if(!selected.length||selected.some(m=>!m.date||!m.round||!m.home||!m.away))throw Error('Datos incompletos de '+cfg.key);
   const byMatch=new Map();
   for(const m of selected){const key=[m.round,norm(m.home),norm(m.away)].join('|');const old=byMatch.get(key);if(!old||(!old.time&&m.time))byMatch.set(key,m)}
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
   for(const [key,official] of teams){
    const list=matches.filter(m=>norm(m.home)===norm(official)||norm(m.away)===norm(official)).map(m=>({...m}));
    if(!list.length)throw Error('Sin partidos para '+key);
    const path='data/'+key+'-rfaf.json';mergeStoredScores(path,list);
    fs.mkdirSync('data',{recursive:true});
    fs.writeFileSync(path,JSON.stringify({source,updatedAt:new Date().toISOString(),officialTeam:official,competition:cfg.competition,group:cfg.group,standing:null,matches:list},null,2)+'\n');
    console.log(key+': '+list.length+' partidos, '+list.filter(m=>valid(m.score)).length+' marcadores');
   }
  }
 }finally{await browser.close()}
}
run().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
