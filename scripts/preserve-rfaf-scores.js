// Retiene resultados confirmados cuando una respuesta temporal de RFAF vuelve sin marcador.
const fs = require('node:fs');

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function mergeStoredScores(path, matches) {
  if (!fs.existsSync(path)) return matches;
  const previous = JSON.parse(fs.readFileSync(path, 'utf8'));
  const byIdentity = new Map((previous.matches || []).map(match => [
    [match.round, match.date, match.time, normalize(match.home), normalize(match.away)].join('|'),
    match
  ]));
  for (const match of matches || []) {
    const old = byIdentity.get([
      match.round, match.date, match.time, normalize(match.home), normalize(match.away)
    ].join('|'));
    const finalScore = Array.isArray(old?.score) && old.score.length === 2 &&
      old.score.every(value => value !== null && value !== undefined && String(value).trim() !== '');
    if (finalScore) {
      match.score = old.score;
      if (old.scoreSource) match.scoreSource = old.scoreSource;
    }
  }
  return matches;
}

module.exports = { mergeStoredScores };
