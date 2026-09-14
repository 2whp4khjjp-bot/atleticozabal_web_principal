// Genera el calendario suscribible del Juvenil a partir de la fuente RFEF validada.
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync('data/juvenil-dh-rfef.json', 'utf8'));
if (!Array.isArray(data.matches) || data.matches.length !== 34) {
  throw new Error('No se genera ICS sin las 34 jornadas verificadas');
}
const stamp = new Date(data.updatedAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const escape = value => String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
  .replace(/,/g, '\\,').replace(/;/g, '\\;');
function fold(line) {
  let result = '', width = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (width + size > 75) { result += '\r\n '; width = 1; }
    result += char; width += size;
  }
  return result;
}
const lines = ['BEGIN:VCALENDAR','VERSION:2.0',
  'PRODID:-//Atletico Zabal Linense//Juvenil Division de Honor 2026-27//ES',
  'CALSCALE:GREGORIAN','METHOD:PUBLISH',
  'X-WR-CALNAME:Atlético Zabal · Juvenil División de Honor',
  'X-WR-TIMEZONE:Europe/Madrid'];
for (const match of data.matches) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(match.date) || !match.home || !match.away) {
    throw new Error('Partido inválido, jornada ' + match.round);
  }
  const date = match.date.replace(/-/g, '');
  lines.push('BEGIN:VEVENT','UID:zabal-juvenil-dh-' + match.round + '@atleticozabal.com','DTSTAMP:' + stamp);
  if (match.time) {
    const start = date + 'T' + match.time.replace(':','') + '00';
    const end = new Date(match.date + 'T' + match.time + ':00Z');
    end.setUTCHours(end.getUTCHours() + 1);
    const until = end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
    lines.push('DTSTART;TZID=Europe/Madrid:' + start,'DTEND;TZID=Europe/Madrid:' + until);
  } else {
    const end = new Date(match.date + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate()+1);
    lines.push('DTSTART;VALUE=DATE:' + date,'DTEND;VALUE=DATE:' + end.toISOString().slice(0,10).replace(/-/g,''));
  }
  const result = Array.isArray(match.score) ? match.score.join('–') : null;
  const notes = ['División de Honor Juvenil · Grupo 4','Jornada ' + match.round,
    match.time ? 'Hora: ' + match.time : 'Hora pendiente',
    match.ground ? 'Campo: ' + match.ground : 'Campo pendiente'];
  if (result) notes.push('Resultado: ' + match.home + ' ' + result + ' ' + match.away);
  notes.push('', 'Creado por Raúl Cote');
  lines.push('SUMMARY:' + escape((result ? 'FINAL · ' : 'J' + match.round + ' · ') + match.home + ' – ' + match.away + (result ? ' ' + result : '')),
    'DESCRIPTION:' + escape(notes.join('\n')));
  if (match.ground) lines.push('LOCATION:' + escape(match.ground));
  if (match.actaUrl) lines.push('URL:' + match.actaUrl);
  else lines.push('URL:https://www.atleticozabal.com/calendario-division-honor.html');
  lines.push('END:VEVENT');
}
lines.push('END:VCALENDAR');
fs.writeFileSync('calendario-division-honor.ics', lines.map(fold).join('\r\n') + '\r\n');
console.log('ICS Juvenil generado: ' + data.matches.length + ' partidos.');
