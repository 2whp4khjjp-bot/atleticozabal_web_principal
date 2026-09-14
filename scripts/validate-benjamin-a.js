const fs = require('node:fs');
for (const path of ['calendario-benjamin-a.html', 'proximos-partidos.html']) {
  const html = fs.readFileSync(path, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error('Falta script en ' + path);
  new Function(script[1]);
  console.log('JavaScript válido: ' + path);
}
const json = JSON.parse(fs.readFileSync('data/benjamin-a-rfaf.json', 'utf8'));
if (json.matches.length !== 30) throw new Error('Faltan jornadas');
const ics = fs.readFileSync('calendario-benjamin-a.ics', 'utf8');
if ((ics.match(/BEGIN:VEVENT/g) || []).length !== 30 ||
    (ics.match(/END:VEVENT/g) || []).length !== 30 ||
    (ics.match(/UID:zabal-benjamin-a-/g) || []).length !== 30) {
  throw new Error('El ICS no contiene 30 eventos completos');
}
for (const line of ics.split('\r\n').filter(Boolean)) {
  if (Buffer.byteLength(line) > 75) throw new Error('Línea ICS sin plegar');
}
console.log('Calendario ICS válido: 30 partidos.');
