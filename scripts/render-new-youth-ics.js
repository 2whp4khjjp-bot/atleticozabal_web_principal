const fs=require('node:fs');
const keys=['prebenjamin-polo','prebenjamin-c','prebenjamin-a','prebenjamin-b','alevin-atunara-mariano','bebe-a','bebe-b'];
const esc=s=>String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
const dt=s=>String(s||'').replace(/-/g,'');
for(const key of keys){
 const file='data/'+key+'-rfaf.json';if(!fs.existsSync(file))continue;
 const d=JSON.parse(fs.readFileSync(file,'utf8'));const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Atletico Zabal//Calendarios 2026-27//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Atlético Zabal · '+key];
 for(const m of d.matches||[]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(m.date||''))continue;
  const hasTime=/^\d{1,2}:\d{2}$/.test(m.time||'');
  const start=dt(m.date)+(hasTime?'T'+m.time.replace(':','')+'00':'');
  const end=new Date(m.date+'T12:00:00');end.setDate(end.getDate()+1);
  lines.push('BEGIN:VEVENT','UID:zabal-'+key+'-'+m.round+'@atleticozabal.com','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),
    (hasTime?'DTSTART;TZID=Europe/Madrid:':'DTSTART;VALUE=DATE:')+start,
    ...(hasTime?['DURATION:PT2H']:['DTEND;VALUE=DATE:'+dt(end.toISOString().slice(0,10))]),
    'SUMMARY:'+esc(m.home+' – '+m.away+(Array.isArray(m.score)?' ('+m.score.join('-')+')':'')),
    'DESCRIPTION:'+esc('Jornada '+m.round+(m.actaUrl?' | Acta: '+m.actaUrl:'')),
    'LOCATION:'+esc(m.ground||'Campo pendiente'),'END:VEVENT');
 }
 lines.push('END:VCALENDAR');fs.writeFileSync('calendario-'+key+'.ics',lines.join('\r\n')+'\r\n');console.log('ICS generado:',key);
}
