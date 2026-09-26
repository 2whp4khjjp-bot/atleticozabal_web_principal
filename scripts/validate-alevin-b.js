// Validación independiente de la primera publicación.
const fs = require('node:fs');
for (const path of ['proximos-partidos.html']) {
  const html = fs.readFileSync(path, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error('Falta script en ' + path);
  new Function(script[1]);
}
const json = JSON.parse(fs.readFileSync('data/alevin-b-rfaf.json', 'utf8'));
if (!Array.isArray(json.matches) || json.matches.length < 2) throw new Error('Faltan jornadas del Alevín B');
const ics = fs.readFileSync('calendario-alevin-b.ics', 'utf8');
const total = json.matches.length;
if ((ics.match(/BEGIN:VEVENT/g) || []).length !== total ||
    (ics.match(/END:VEVENT/g) || []).length !== total ||
    (ics.match(/UID:zabal-alevin-b-/g) || []).length !== total) {
  throw new Error('El ICS del Alevín no contiene todos los eventos');
}
for (const line of ics.split('\r\n').filter(Boolean)) {
  if (Buffer.byteLength(line) > 75) throw new Error('Línea ICS sin plegar');
}
console.log('Calendario Alevín B válido: ' + total + ' partidos.');
