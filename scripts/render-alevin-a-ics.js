// Genera un ICS estable a partir del JSON oficial previamente validado.
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync('data/alevin-a-rfaf.json', 'utf8'));
if (!Array.isArray(data.matches) || data.matches.length < 2) {
  throw new Error('No se genera ICS sin las jornadas verificadas');
}
const stamp = new Date(data.updatedAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const escape = value => String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
  .replace(/,/g, '\\,').replace(/;/g, '\\;');
function fold(line) {
  let result = '', width = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (width + size > 75) { result += '\r\n '; width = 1; }
    result += char;
    width += size;
  }
  return result;
}
const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0',
  'PRODID:-//Atletico Zabal Linense//Alevin A 2026-27//ES',
  'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  'X-WR-CALNAME:Atlético Zabal · Alevín A',
  'X-WR-TIMEZONE:Europe/Madrid'];
for (const match of data.matches) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(match.date) || !match.home || !match.away) {
    throw new Error('Partido inválido, jornada ' + match.round);
  }
  const date = match.date.replace(/-/g, '');
  lines.push('BEGIN:VEVENT', 'UID:zabal-alevin-a-' + match.round + '@atleticozabal.com',
    'DTSTAMP:' + stamp);
  if (match.time) {
    if (!/^\d{2}:\d{2}$/.test(match.time)) throw new Error('Hora inválida, jornada ' + match.round);
    const start = date + 'T' + match.time.replace(':', '') + '00';
    const end = new Date(match.date + 'T' + match.time + ':00Z');
    end.setUTCHours(end.getUTCHours() + 1);
    const until = end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
    lines.push('DTSTART;TZID=Europe/Madrid:' + start, 'DTEND;TZID=Europe/Madrid:' + until);
  } else {
    const until = new Date(match.date + 'T12:00:00Z');
    until.setUTCDate(until.getUTCDate() + 1);
    lines.push('DTSTART;VALUE=DATE:' + date,
      'DTEND;VALUE=DATE:' + until.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  const result = Array.isArray(match.score) && match.score.length === 2
    ? match.score[0] + '–' + match.score[1] : null;
  const title = (result ? 'FINAL · ' : 'J' + match.round + ' · ') + match.home +
    ' – ' + match.away + (result ? ' ' + result : '');
  const notes = ['Alevín A · Competición RFAF',
    'Jornada ' + match.round,
    match.time ? 'Hora: ' + match.time : 'Hora pendiente',
    match.ground ? 'Campo: ' + match.ground : 'Campo pendiente'];
  if (result) notes.push('Resultado: ' + match.home + ' ' + result + ' ' + match.away);
  notes.push('', 'Creado por Raúl Cote');
  lines.push('SUMMARY:' + escape(title), 'DESCRIPTION:' + escape(notes.join('\n')));
  if (match.ground) lines.push('LOCATION:' + escape(match.ground));
  lines.push('URL:https://www.atleticozabal.com/calendario-alevin-a.html', 'END:VEVENT');
}
lines.push('END:VCALENDAR');
fs.writeFileSync('calendario-alevin-a.ics', lines.map(fold).join('\r\n') + '\r\n');
console.log('ICS generado: ' + data.matches.length + ' partidos.');
