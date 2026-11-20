const fs = require('node:fs');

const teams = [
  ['alevin-atunara-mariano','data/alevin-atunara-mariano-rfaf.json'],
  ['senior', 'data/senior-rfaf.json'],
  ['juvenil-dh', 'data/juvenil-dh-rfef.json'],
  ['juvenil-b', 'data/juvenil-b-rfaf.json'],
  ['cadete', 'data/cadete-rfaf.json'],
  ['cadete-b', 'data/cadete-b-rfaf.json'],
  ['cadete-femenino', 'data/cadete-femenino-rfaf.json'],
  ['alevin-a', 'data/alevin-a-rfaf.json'],
  ['alevin-b', 'data/alevin-b-rfaf.json'],
  ['alevin-c', 'data/alevin-c-rfaf.json'],
  ['alevin-atunara-a', 'data/alevin-atunara-a-rfaf.json'],
  ['alevin-zabal-c', 'data/alevin-zabal-c-rfaf.json'],
  ['alevin-atunara-b', 'data/alevin-atunara-b-rfaf.json'],
  ['infantil-a', 'data/infantil-a-rfaf.json'],
  ['infantil-b', 'data/infantil-b-rfaf.json'],
  ['benjamin-a', 'data/benjamin-a-rfaf.json'],
  ['benjamin-b', 'data/benjamin-b-rfaf.json'],
  ['benjamin-sebas', 'data/benjamin-sebas-rfaf.json'],
  ['benjamin-javi-martin', 'data/benjamin-javi-martin-rfaf.json'],
  ['benjamin-angel', 'data/benjamin-angel-rfaf.json'],
  ['prebenjamin-a', 'data/prebenjamin-a-rfaf.json'],
  ['prebenjamin-b', 'data/prebenjamin-b-rfaf.json'],
  ['bebe-a', 'data/bebe-a-rfaf.json'],
  ['bebe-b', 'data/bebe-b-rfaf.json']
];
const statePath = 'data/result-refresh-state.json';
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : { completed: {} };
const now = new Date(process.env.DYNAMIC_RESULTS_NOW || Date.now());
const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const parts = Object.fromEntries(formatter.formatToParts(now)
  .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
const localNow = Date.UTC(Number(parts.year), Number(parts.month) - 1,
  Number(parts.day), Number(parts.hour), Number(parts.minute));
const plan = [];
// Primera comprobación: una hora después del final estimado de cada categoría.
// Duración aproximada con descanso: no conocemos el pitido final real.
const expectedMatchMinutes = team => {
  if (team === 'senior' || team.startsWith('juvenil')) return 120;
  if (team.startsWith('cadete')) return 100;
  if (team.startsWith('infantil')) return 90;
  if (team.startsWith('alevin')) return 75;
  if (team.startsWith('benjamin')) return 65;
  return 55; // Prebenjamín y Bebé
};
function retryOffsets(team) {
  const first = (expectedMatchMinutes(team) + 60) / 60;
  return [
    ...Array.from({length:25},(_,i)=>first+i*0.25), // Cada 15 minutos, durante 6 h
    ...Array.from({length:18},(_,i)=>first+7+i), // Horario, hasta el día siguiente
    36,48,72,96,120,144,168,192
  ];
}
const resultWindowHours = 192; // ocho días para actas/resultados demorados

function hasFinalScore(match) {
  return Array.isArray(match.score) && match.score.length === 2 &&
    match.score.every(value => value !== null && value !== undefined &&
      String(value).trim() !== '');
}

for (const [team, path] of teams) {
  if (!fs.existsSync(path)) continue;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  for (const match of data.matches || []) {
    if (hasFinalScore(match) && match.actaUrl) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(match.date || '')) continue;
    const [year, month, day] = match.date.split('-').map(Number);
    // Si RFAF aún no ha publicado la hora, iniciar reintentos al cierre del día.
    const [hour, minute] = (/^\d{2}:\d{2}$/.test(match.time || '') ? match.time : '20:00')
      .split(':').map(Number);
    const kickoff = Date.UTC(year, month - 1, day, hour, minute);
    const sinceKickoff = localNow - kickoff;
    // Ejecutar una sola franja vencida por partido en cada workflow.
    // Si GitHub retrasa el cron, usamos la franja más reciente que aún no se haya
    // intentado; las franjas posteriores permanecen disponibles para reintentar.
    const dueOffsets = retryOffsets(team).filter(offset =>
      localNow >= kickoff + offset * 60 * 60 * 1000);
    const offset = [...dueOffsets].reverse().find(value => {
      const key = [team, match.round, match.date, match.time, value].join(':');
      return !state.attempted?.[key];
    });
    if (offset !== undefined &&
        sinceKickoff < resultWindowHours * 60 * 60 * 1000) {
      const key = [team, match.round, match.date, match.time, offset].join(':');
      plan.push({
        team, round: match.round, date: match.date, time: match.time, offset, key
      });
    }
  }
}

process.stdout.write(JSON.stringify(plan));
