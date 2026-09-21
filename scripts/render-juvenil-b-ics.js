const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync('data/juvenil-b-rfaf.json', 'utf8'));
if (!Array.isArray(data.matches) || data.matches.length !== 26) {
  throw new Error('No se genera ICS sin las 26 jornadas oficiales');
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
const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0',
  'PRODID:-//Atletico Zabal Linense//Juvenil B 2026-27//ES',
  'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  'X-WR-CALNAME:Atlético Zabal · Juvenil B',
  'X-WR-TIMEZONE:Europe/Madrid'];
for (const match of data.matches) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(match.date) || !match.home || !match.away) {
    throw new Error('Partido inválido, jornada ' + match.round);
  }
  const date = match.date.replace(/-/g, '');
  lines.push('BEGIN:VEVENT', 'UID:zabal-juvenil-b-' + match.round + '@atleticozabal.com',
    'DTSTAMP:' + stamp);
  if (match.time) {
    const start = date + 'T' + match.time.replace(':', '') + '00';
    const end = new Date(match.date + 'T' + match.time + ':00Z');
    end.setUTCHours(end.getUTCHours() + 2);
    lines.push('DTSTART;TZID=Europe/Madrid:' + start,
      'DTEND;TZID=Europe/Madrid:' + end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, ''));
  } else {
    const end = new Date(match.date + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate() + 1);
    lines.push('DTSTART;VALUE=DATE:' + date,
      'DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  const result = Array.isArray(match.score) ? match.score.join('–') : null;
  const title = (result ? 'FINAL · ' : 'J' + match.round + ' · ') + match.home +
    ' – ' + match.away + (result ? ' ' + result : '');
  const notes = ['Juvenil B · Cuarta Andaluza Cádiz · Grupo 4', 'Jornada ' + match.round,
    match.time ? 'Hora: ' + match.time : 'Hora pendiente',
    match.ground ? 'Campo: ' + match.ground : 'Campo pendiente'];
  if (result) notes.push('Resultado: ' + match.home + ' ' + result + ' ' + match.away);
  if (match.actaUrl) notes.push('Acta oficial: ' + match.actaUrl);
  notes.push('', 'Creado por Raúl Cote');
  lines.push('SUMMARY:' + escape(title), 'DESCRIPTION:' + escape(notes.join('\n')));
  if (match.ground) lines.push('LOCATION:' + escape(match.ground));
  lines.push('URL:' + (match.actaUrl || 'https://www.atleticozabal.com/calendario-juvenil-b.html'), 'END:VEVENT');
}
lines.push('END:VCALENDAR');
fs.writeFileSync('calendario-juvenil-b.ics', lines.map(fold).join('\r\n') + '\r\n');
console.log('ICS Juvenil B generado: ' + data.matches.length + ' partidos.');
