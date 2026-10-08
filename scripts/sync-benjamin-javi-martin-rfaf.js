// Calendario del Benjamín · Javi Martín desde las vistas públicas de la RFAF.
const fs = require('node:fs');
const { chromium } = require('playwright');
const { mergeStoredScores } = require('./preserve-rfaf-scores');
const { attachRfafActas, enrichRfafSchedule } = require('./rfaf-actas');
const base='https://www.rfaf.es', competition='50073897', group='50075169', season='22';
const summary=base+'/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada='+season+'&codcompeticion='+competition+'&codgrupo='+group+'&CodJornada=1&cod_agrupacion=1';
const extended=base+'/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codgrupo='+group+'&codcompeticion='+competition+'&codtemporada='+season+'&CodJornada=1&CDetalle=1';
const outputPath='data/benjamin-javi-martin-rfaf.json';
const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const ownTeam='ATLETICOZABALB';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({locale:'es-ES',timezoneId:'Europe/Madrid'});
  for(const url of [summary,extended]){
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
   if(!response||!response.ok())throw new Error('RFAF HTTP no válido: '+url);
  }
  const extracted=await page.evaluate(()=>{
   const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
   const rows=[...document.querySelectorAll('div.row')].filter(row=>{
    const cells=[...row.querySelectorAll('table td')].slice(0,3).map(cell=>clean(cell.innerText));
    return cells.some(value=>/ATLETICO\s+ZABAL\s*[“"']?B[”"']?/i.test(value));
   });
   const matches=[...new Set(rows)].map(row=>{
    const heading=row.parentElement?.querySelector('h5');
    const roundInfo=(heading?.innerText||'').match(/Jornada\s+(\d+)/i);
    const cells=[...row.querySelectorAll('table td')].slice(0,3).map(cell=>clean(cell.innerText));
    const text=row.innerText||'';
    const date=text.match(/\b(\d{2})-(\d{2})-(\d{4})(?:\s*-\s*(\d{2}:\d{2}))?/);
    const score=(cells[1]||'').match(/^(\d{1,2})(?:\s+|\s*[-–:]\s*)(\d{1,2})$/);
    const lines=text.split(/\n+/).map(line=>line.trim()).filter(Boolean);
    return {round:roundInfo?Number(roundInfo[1]):null,
     date:date?date[3]+'-'+date[2]+'-'+date[1]:null,time:date?.[4]||null,
     home:cells[0]||null,away:cells[2]||null,
     ground:lines.find(line=>/\s-\s/.test(line))||null,
     score:score?[Number(score[1]),Number(score[2])]:null};
   });
   const rounds=[...document.querySelectorAll('h5')].map(heading=>{
    const text=clean(heading.innerText),round=text.match(/Jornada\s+(\d+)/i);
    const date=text.match(/\((\d{2})-(\d{2})-(\d{4})\)/);
    return round&&date?{round:Number(round[1]),date:date[3]+'-'+date[2]+'-'+date[1]}:null;
   }).filter(Boolean);
   return {matches,rounds};
  });
  const byRound=new Map();
  for(const match of extracted.matches){
   if(!match.round||!match.date||!match.home||!match.away)continue;
   if(![match.home,match.away].some(team=>normal(team)===ownTeam))continue;
   const old=byRound.get(match.round);
   if(!old||(!old.time&&match.time))byRound.set(match.round,match);
  }
  const matches=[...byRound.values()].sort((a,b)=>a.round-b.round)
   .filter(match=>!/^Descansa$/i.test(match.home)&&!/^Descansa$/i.test(match.away));
  if(matches.length!==28||extracted.rounds.length!==30)
   throw new Error('Calendario inesperado: '+matches.length+' partidos / '+extracted.rounds.length+
    ' jornadas; no se publica una extracción incompleta.');
  await enrichRfafSchedule(page,matches,{base,source:extended});
  await attachRfafActas(page,matches,{base,competition,group});
  mergeStoredScores(outputPath,matches);
  const data={source:summary,extendedSource:extended,updatedAt:new Date().toISOString(),
    rounds:extracted.rounds,matches};
  fs.mkdirSync('data',{recursive:true});
  fs.writeFileSync(outputPath,JSON.stringify(data,null,2)+'\n');
  console.log('Benjamín · Javi Martín: '+matches.length+' partidos en '+extracted.rounds.length+
   ' jornadas; '+matches.filter(match=>match.score).length+' marcadores.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1});
