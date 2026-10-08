const fs=require('node:fs');
const escape=s=>String(s??'').replace(/\\u00a0/g,' ').replace(/\\\\/g,'\\\\\\\\').replace(/\\n/g,'\\\\n').replace(/,/g,'\\\\,').replace(/;/g,'\\\\;');
function fold(line){let out='',width=0;for(const char of line){const size=Buffer.byteLength(char);if(width+size>75){out+='\\r\\n ';width=1}out+=char;width+=size}return out}
const data=JSON.parse(fs.readFileSync('data/alevin-atunara-4a-rfaf.json','utf8'));
if(!Array.isArray(data.matches)||data.matches.length!==18)throw Error('Calendario incompleto');
const name='Alevín Atunara A · 4ª Andaluza',stamp=new Date(data.updatedAt).toISOString().replace(/[-:]/g,'').replace(/\\.\\d{3}Z$/,'Z');
const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Atletico Zabal Linense//'+name+' 2026-27//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+name,'X-WR-TIMEZONE:Europe/Madrid'];
for(const m of data.matches){const date=m.date.replace(/-/g,'');lines.push('BEGIN:VEVENT','UID:zabal-alevin-atunara-4a-'+m.round+'@atleticozabal.com','DTSTAMP:'+stamp);if(m.time){const start=date+'T'+m.time.replace(':','')+'00';const end=new Date(m.date+'T'+m.time+':00Z');end.setUTCHours(end.getUTCHours()+1);lines.push('DTSTART;TZID=Europe/Madrid:'+start,'DTEND;TZID=Europe/Madrid:'+end.toISOString().replace(/[-:]/g,'').replace(/\\.\\d{3}Z$/,''))}else{const end=new Date(m.date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);lines.push('DTSTART;VALUE=DATE:'+date,'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replace(/-/g,''))}
const result=Array.isArray(m.score)?m.score.join('–'):null;
lines.push('SUMMARY:'+escape((result?'FINAL · ':'J'+m.round+' · ')+m.home+' – '+m.away+(result?' '+result:'')),'DESCRIPTION:'+escape([name,'4ª Andaluza Alevín Cádiz · Grupo 4','Jornada '+m.round,m.time?'Hora: '+m.time:'Hora pendiente',m.ground?'Campo: '+m.ground:'Campo pendiente',result?'Resultado: '+m.home+' '+result+' '+m.away:''].filter(Boolean).join('\\n')));if(m.ground)lines.push('LOCATION:'+escape(m.ground));lines.push('URL:https://www.atleticozabal.com/calendario-alevin-atunara-4a.html','END:VEVENT')}
lines.push('END:VCALENDAR');fs.writeFileSync('calendario-alevin-atunara-4a.ics',lines.map(fold).join('\\r\\n')+'\\r\\n');
console.log('iCal actualizado con '+data.matches.length+' partidos.');
