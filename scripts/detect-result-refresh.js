const fs = require('node:fs');

const teams = [
  ['senior', 'data/senior-rfaf.json'],
  ['juvenil-dh', 'data/juvenil-dh-rfef.json'],
  ['cadete', 'data/cadete-rfaf.json'],
  ['cadete-b', 'data/cadete-b-rfaf.json'],
  ['alevin-a', 'data/alevin-a-rfaf.json'],
  ['alevin-c', 'data/alevin-c-rfaf.json'],
  ['alevin-atunara-a', 'data/alevin-atunara-a-rfaf.json'],
  ['alevin-zabal-c', 'data/alevin-zabal-c-rfaf.json'],
  ['alevin-atunara-b', 'data/alevin-atunara-b-rfaf.json'],
  ['infantil-a', 'data/infantil-a-rfaf.json'],
  ['benjamin-a', 'data/benjamin-a-rfaf.json'],
  ['benjamin-b', 'data/benjamin-b-rfaf.json']
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

for (const [team, path] of teams) {
  if (!fs.existsSync(path)) continue;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  for (const match of data.matches || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(match.date || '') ||
        !/^\d{2}:\d{2}$/.test(match.time || '')) continue;
    const [year, month, day] = match.date.split('-').map(Number);
    const [hour, minute] = match.time.split(':').map(Number);
    const kickoff = Date.UTC(year, month - 1, day, hour, minute);
    // Tres comprobaciones horarias y una última comprobación de seguridad.
    for (const offset of [1, 2, 3, 5]) {
      const target = kickoff + offset * 60 * 60 * 1000;
      const elapsed = localNow - target;
      const key = [team, match.round, match.date, match.time, offset].join(':');
      if (elapsed >= 0 && elapsed < 45 * 60 * 1000 && !state.completed?.[key]) {
        plan.push({ team, round: match.round, offset, key });
      }
    }
  }
}

process.stdout.write(JSON.stringify(plan));
