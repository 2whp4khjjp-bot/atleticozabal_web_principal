const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const plan = JSON.parse(process.env.RESULT_REFRESH_PLAN || '[]');
const commands = {
  senior: [['sync-rfaf-results.js', 'senior'], 'render-senior-ics.js', 'validate-senior.js'],
  'juvenil-dh': ['sync-juvenil-dh-rfef.js', 'render-juvenil-dh-ics.js', 'validate-juvenil-dh.js'],
  'juvenil-b': [['sync-rfaf-results.js', 'juvenil-b'], 'render-juvenil-b-ics.js', 'validate-juvenil-b.js'],
  cadete: [['sync-rfaf-results.js', 'cadete'], 'render-cadete-ics.js', 'validate-cadete.js'],
  'cadete-b': [['sync-rfaf-results.js', 'cadete-b'], 'render-cadete-b-ics.js', 'validate-cadete-b.js'],
  'alevin-a': [['sync-rfaf-results.js', 'alevin-a'], 'render-alevin-a-ics.js', 'validate-alevin-a.js'],
  'alevin-b': [['sync-rfaf-results.js', 'alevin-b-infantil-a'], 'render-alevin-b-ics.js', 'validate-alevin-b.js'],
  'alevin-c': [['sync-rfaf-results.js', 'alevines-g4'], 'render-alevines-g4-ics.js', 'validate-alevines-g4.js'],
  'alevin-atunara-a': [['sync-rfaf-results.js', 'alevines-g4'], 'render-alevines-g4-ics.js', 'validate-alevines-g4.js'],
  'alevin-zabal-c': [['sync-rfaf-results.js', 'alevines-g5'], 'render-alevines-g5-ics.js', 'validate-alevines-g5.js'],
  'alevin-atunara-b': [['sync-rfaf-results.js', 'alevines-g5'], 'render-alevines-g5-ics.js', 'validate-alevines-g5.js'],
  'infantil-a': [['sync-rfaf-results.js', 'alevin-b-infantil-a'], 'render-infantil-a-ics.js', 'validate-infantil-a.js'],
  'benjamin-a': [['sync-rfaf-results.js', 'benjamin-a'], 'render-benjamin-a-ics.js', 'validate-benjamin-a.js'],
  'benjamin-b': [['sync-rfaf-results.js', 'benjamin-b'], 'render-benjamin-b-ics.js', 'validate-benjamin-b.js']
};
const teamFiles = {
  senior: 'data/senior-rfaf.json',
  'juvenil-dh': 'data/juvenil-dh-rfef.json',
  'juvenil-b': 'data/juvenil-b-rfaf.json',
  cadete: 'data/cadete-rfaf.json',
  'cadete-b': 'data/cadete-b-rfaf.json',
  'alevin-a': 'data/alevin-a-rfaf.json',
  'alevin-b': 'data/alevin-b-rfaf.json',
  'alevin-c': 'data/alevin-c-rfaf.json',
  'alevin-atunara-a': 'data/alevin-atunara-a-rfaf.json',
  'alevin-zabal-c': 'data/alevin-zabal-c-rfaf.json',
  'alevin-atunara-b': 'data/alevin-atunara-b-rfaf.json',
  'infantil-a': 'data/infantil-a-rfaf.json',
  'benjamin-a': 'data/benjamin-a-rfaf.json',
  'benjamin-b': 'data/benjamin-b-rfaf.json'
};
const dueTeams = [...new Set(plan.map(item => item.team))];
const executed = new Set();
const failedTeams = [];

for (const team of dueTeams) {
  if (!commands[team]) throw new Error('Equipo dinámico desconocido: ' + team);
  const signature = JSON.stringify(commands[team]);
  if (executed.has(signature)) continue;
  executed.add(signature);
  console.log('Actualización dinámica de resultados: ' + team);
  for (const command of commands[team]) {
    const [script, ...args] = Array.isArray(command) ? command : [command];
    const result = spawnSync(process.execPath, ['scripts/' + script, ...args], {
      encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
      const details = (result.stderr || '') + '\\n' + (result.stdout || '') +
        '\\n' + (result.error?.message || '');
      const transient = /Timeout.*exceeded|net::ERR_|ECONNRESET|ENOTFOUND|EAI_AGAIN|RFAF HTTP 5\d\d/i
        .test(details);
      if (transient) {
        console.warn('RFAF no responde temporalmente para ' + team +
          '; se volverá a intentar en la siguiente comprobación programada.');
      } else {
        failedTeams.push(team + ' (' + script + ')');
        console.error('Se continúa con otros equipos; falló ' + team + ': ' +
          (result.error?.message || 'código ' + result.status));
      }
      break;
    }
  }
}

const statePath = 'data/result-refresh-state.json';
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : { completed: {} };
state.completed ||= {};
state.attempted ||= {};
const checkedAt = new Date().toISOString();

function hasFinalScore(item) {
  const path = teamFiles[item.team];
  if (!path || !fs.existsSync(path)) return false;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const match = (data.matches || []).find(candidate =>
    String(candidate.round) === String(item.round) &&
    candidate.date === item.date && candidate.time === item.time);
  return Array.isArray(match?.score) && match.score.length === 2 &&
    match.score.every(value => value !== null && value !== undefined &&
      String(value).trim() !== '');
}

for (const item of plan) {
  state.attempted[item.key] = checkedAt;
  if (hasFinalScore(item)) state.completed[item.key] = checkedAt;
  else delete state.completed[item.key];
}
const cutoff = Date.now() - 120 * 24 * 60 * 60 * 1000;
for (const bucket of ['completed', 'attempted']) {
  for (const [key, value] of Object.entries(state[bucket])) {
    if (Date.parse(value) < cutoff) delete state[bucket][key];
  }
}
state.updatedAt = checkedAt;
if (failedTeams.length) {
  state.lastErrors = failedTeams;
  state.lastErrorAt = checkedAt;
  console.warn('Sincronizaciones aplazadas; se conservará el estado y se reintentará: ' +
    failedTeams.join(', '));
} else {
  state.lastErrors = [];
  delete state.lastErrorAt;
}

fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
