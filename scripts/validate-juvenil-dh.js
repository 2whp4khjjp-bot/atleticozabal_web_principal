const fs = require('node:fs');
for (const path of ['calendario-division-honor.html','proximos-partidos.html']) {
  const script = fs.readFileSync(path,'utf8').match(/<script>([\s\S]*?)<\\/script>/);
  if (!script) throw new Error('Falta script en ' + path);
  new Function(script[1]);
}
const json = JSON.parse(fs.readFileSync('data/juvenil-dh-rfef.json','utf8'));
if (json.matches.length !== 34) throw new Error('Faltan jornadas del Juvenil');
const ics = fs.readFileSync('calendario-division-honor.ics','utf8');
if ((ics.match(/BEGIN:VEVENT/g)||[]).length !== 34 || (ics.match(/END:VEVENT/g)||[]).length !== 34) {
  throw new Error('El ICS del Juvenil no tiene 34 eventos');
}
for (const line of ics.split('\r\n').filter(Boolean)) {
  if (Buffer.byteLength(line) > 75) throw new Error('Línea ICS sin plegar');
}
console.log('Juvenil RFEF validado.');
