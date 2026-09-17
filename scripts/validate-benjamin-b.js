const fs = require('node:fs');
for (const path of ['calendario-benjamin.html', 'proximos-partidos.html']) {
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(value => value.trim());
  if (!scripts.length) throw new Error('Falta script en ' + path);
  scripts.forEach(script => new Function(script));
  console.log('JavaScript válido: ' + path);
}
const json = JSON.parse(fs.readFileSync('data/benjamin-b-rfaf.json', 'utf8'));
if (!Array.isArray(json.matches) || json.matches.length < 18) throw new Error('Faltan jornadas');
if (new Set(json.matches.map(match => match.round)).size !== json.matches.length) {
  throw new Error('Hay jornadas duplicadas');
}
const ics = fs.readFileSync('calendario-benjamin.ics', 'utf8');
const total = json.matches.length;
if ((ics.match(/BEGIN:VEVENT/g) || []).length !== total ||
    (ics.match(/END:VEVENT/g) || []).length !== total ||
    (ics.match(/UID:zabal-benjamin-b-/g) || []).length !== total) {
  throw new Error('El ICS no contiene todos los eventos');
}
for (const line of ics.split('\r\n').filter(Boolean)) {
  if (Buffer.byteLength(line) > 75) throw new Error('Línea ICS sin plegar');
}
console.log('Benjamín B verificado: ' + total + ' partidos.');
