// Validación independiente de la primera publicación.
const fs = require('node:fs');
for (const path of ['calendario-benjamin-javi-martin.html', 'proximos-partidos.html']) {
  const html = fs.readFileSync(path, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error('Falta script en ' + path);
  new Function(script[1]);
}
const json = JSON.parse(fs.readFileSync('data/benjamin-javi-martin-rfaf.json', 'utf8'));
if (!Array.isArray(json.matches) || json.matches.length !== 28) throw new Error('Faltan jornadas del Benjamín · Javi Martin');
const ics = fs.readFileSync('calendario-benjamin-javi-martin.ics', 'utf8');
const total = json.matches.length;
if ((ics.match(/BEGIN:VEVENT/g) || []).length !== total ||
    (ics.match(/END:VEVENT/g) || []).length !== total ||
    (ics.match(/UID:zabal-benjamin-javi-martin-/g) || []).length !== total) {
  throw new Error('El ICS de Benjamín · Javi Martin no contiene todos los eventos');
}
for (const line of ics.split('\r\n').filter(Boolean)) {
  if (Buffer.byteLength(line) > 75) throw new Error('Línea ICS sin plegar');
}
if (!Array.isArray(json.rounds) || json.rounds.length !== 30) throw new Error('Faltan jornadas oficiales');
console.log('Calendario Benjamín · Javi Martin válido: ' + total + ' partidos en 22 jornadas.');
