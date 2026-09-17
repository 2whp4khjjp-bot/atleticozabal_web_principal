const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const plan = JSON.parse(process.env.RESULT_REFRESH_PLAN || '[]');
const commands = {
  senior: ['sync-senior-rfaf.js', 'render-senior-ics.js', 'validate-senior.js'],
  'juvenil-dh': ['sync-juvenil-dh-rfef.js', 'render-juvenil-dh-ics.js', 'validate-juvenil-dh.js'],
  cadete: ['sync-cadete-rfaf.js', 'render-cadete-ics.js', 'validate-cadete.js'],
  'alevin-a': ['sync-alevin-a-rfaf.js', 'render-alevin-a-ics.js', 'validate-alevin-a.js'],
  'alevin-c': ['sync-alevines-g4-rfaf.js', 'render-alevines-g4-ics.js', 'validate-alevines-g4.js'],
  'alevin-atunara-a': ['sync-alevines-g4-rfaf.js', 'render-alevines-g4-ics.js', 'validate-alevines-g4.js'],
  'infantil-a': ['sync-infantil-a-rfaf.js', 'render-infantil-a-ics.js', 'validate-infantil-a.js'],
  'benjamin-a': ['sync-benjamin-a-rfaf.js', 'render-benjamin-a-ics.js', 'validate-benjamin-a.js']
};
const dueTeams = [...new Set(plan.map(item => item.team))];
const executed = new Set();

for (const team of dueTeams) {
  if (!commands[team]) throw new Error('Equipo dinámico desconocido: ' + team);
  const signature = commands[team].join('|');
  if (executed.has(signature)) continue;
  executed.add(signature);
  console.log('Actualización dinámica de resultados: ' + team);
  for (const script of commands[team]) {
    const result = spawnSync(process.execPath, ['scripts/' + script], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}

const statePath = 'data/result-refresh-state.json';
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : { completed: {} };
state.completed ||= {};
const completedAt = new Date().toISOString();
for (const item of plan) state.completed[item.key] = completedAt;
const cutoff = Date.now() - 120 * 24 * 60 * 60 * 1000;
for (const [key, value] of Object.entries(state.completed)) {
  if (Date.parse(value) < cutoff) delete state.completed[key];
}
state.updatedAt = completedAt;
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
