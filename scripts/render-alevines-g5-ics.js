const fs = require('node:fs');
const teams = [
  { key: 'alevin-zabal-c', name: 'Alevín · David', page: 'calendario-alevin-zabal-c.html' },
  { key: 'alevin-atunara-b', name: 'Alevín Atunara B · Adrián', page: 'calendario-alevin-atunara-b.html' }
];
const escape = value => String(value).replace(/\u00a0/g, ' ').replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
function fold(line) {
  let result = '', width = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (width + size > 75) { result += '\r\n '; width = 1; }
    result += char; width += size;
  }
  return result;
}
for (const team of teams) {
  const data = JSON.parse(fs.readFileSync('data/' + team.key + '-rfaf.json', 'utf8'));
  if (!Array.isArray(data.matches) || data.matches.length < 2) {
    throw new Error('No se genera ICS de ' + team.name + ' sin jornadas verificadas');
  }
  const stamp = new Date(data.updatedAt).toISOString().replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Atletico Zabal Linense//' + team.name + ' 2026-27//ES',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + team.name, 'X-WR-TIMEZONE:Europe/Madrid'];
  for (const match of data.matches) {
    const date = match.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', 'UID:zabal-' + team.key + '-' + match.round + '@atleticozabal.com',
      'DTSTAMP:' + stamp);
    if (match.time) {
      const start = date + 'T' + match.time.replace(':', '') + '00';
      const end = new Date(match.date + 'T' + match.time + ':00Z');
      end.setUTCHours(end.getUTCHours() + 1);
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
    const notes = [team.name, 'Tercera Andaluza Alevín Cádiz · Grupo 5',
      'Jornada ' + match.round, match.time ? 'Hora: ' + match.time : 'Hora pendiente',
      match.ground ? 'Campo: ' + match.ground : 'Campo pendiente'];
    if (result) notes.push('Resultado: ' + match.home + ' ' + result + ' ' + match.away);
    notes.push('', 'Creado por Raúl Cote');
    lines.push('SUMMARY:' + escape(title), 'DESCRIPTION:' + escape(notes.join('\n')));
    if (match.ground) lines.push('LOCATION:' + escape(match.ground));
    lines.push('URL:https://www.atleticozabal.com/' + team.page, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  fs.writeFileSync('calendario-' + team.key + '.ics', lines.map(fold).join('\r\n') + '\r\n');
  console.log('ICS generado: ' + team.name + ' · ' + data.matches.length + ' partidos.');
}
