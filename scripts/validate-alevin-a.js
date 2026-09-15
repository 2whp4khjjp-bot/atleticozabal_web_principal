const fs = require('node:fs');
for (const path of ['calendario-alevin-a.html', 'proximos-partidos.html']) {
  const html = fs.readFileSync(path, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error('Falta script en ' + path);
  new Function(script[1]);
}
const json = JSON.parse(fs.readFileSync('data/alevin-a-rfaf.json', 'utf8'));
if (!Array.isArray(json.matches) || json.matches.length < 2) throw new Error('Faltan jornadas del Alevín A');
const ics = fs.readFileSync('calendario-alevin-a.ics', 'utf8');
const total = json.matches.length;
if ((ics.match(/BEGIN:VEVENT/g) || []).length !== total ||
    (ics.match(/END:VEVENT/g) || []).length !== total ||
    (ics.match(/UID:zabal-alevin-a-/g) || []).length !== total) {
  throw new Error('El ICS del Alevín no contiene todos los eventos');
}
for (const line of ics.split('\r\n').filter(Boolean)) {
  if (Buffer.byteLength(line) > 75) throw new Error('Línea ICS sin plegar');
}
console.log('Calendario Alevín A válido: ' + total + ' partidos.');
