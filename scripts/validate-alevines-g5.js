const fs = require('node:fs');
for (const team of ['alevin-zabal-c', 'alevin-atunara-b']) {
  const data = JSON.parse(fs.readFileSync('data/' + team + '-rfaf.json', 'utf8'));
  const html = fs.readFileSync('calendario-' + team + '.html', 'utf8');
  const ics = fs.readFileSync('calendario-' + team + '.ics', 'utf8');
  if (!Array.isArray(data.matches) || data.matches.length !== 28 ||
      new Set(data.matches.map(match => match.round)).size !== 28) {
    throw new Error('El ' + team + ' no tiene sus 28 jornadas oficiales únicas');
  }
  if (!html.includes('Tercera Andaluza Alevín Cádiz · Grupo 5')) {
    throw new Error('Categoría incorrecta en calendario-' + team + '.html');
  }
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error('Falta script en calendario-' + team + '.html');
  new Function(script[1]);
  const total = data.matches.length;
  if ((ics.match(/BEGIN:VEVENT/g) || []).length !== total ||
      (ics.match(/END:VEVENT/g) || []).length !== total ||
      (ics.match(new RegExp('UID:zabal-' + team + '-', 'g')) || []).length !== total) {
    throw new Error('ICS incompleto del ' + team);
  }
  for (const line of ics.split('\r\n').filter(Boolean)) {
    if (Buffer.byteLength(line) > 75) throw new Error('Línea ICS sin plegar del ' + team);
  }
}
console.log('Los dos calendarios del Grupo 5 son válidos.');
