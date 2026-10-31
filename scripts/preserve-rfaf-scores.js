// Retiene resultados confirmados cuando una respuesta temporal de RFAF vuelve sin marcador.
const fs = require('node:fs');

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function mergeStoredScores(path, matches) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
  for (const match of matches || []) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(match.date || '') && match.date > today) {
      match.score = null;
      delete match.scoreSource;
    }
  }
  if (!fs.existsSync(path)) return matches;
  const previous = JSON.parse(fs.readFileSync(path, 'utf8'));
  const byIdentity = new Map((previous.matches || []).map(match => [
    [match.round, match.date, match.time, normalize(match.home), normalize(match.away)].join('|'),
    match
  ]));
  for (const match of matches || []) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(match.date || '') && match.date > today) continue;
    const old = byIdentity.get([
      match.round, match.date, match.time, normalize(match.home), normalize(match.away)
    ].join('|'));
    const finalScore = Array.isArray(old?.score) && old.score.length === 2 &&
      old.score.every(value => value !== null && value !== undefined && String(value).trim() !== '');
    const incomingScore = Array.isArray(match.score) && match.score.length === 2 &&
      match.score.every(value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)));
    // Fresh confirmed official results must never be overwritten by stale stored results.
    if (finalScore && !incomingScore && match.date <= today) {
      match.score = old.score;
      if (old.scoreSource) match.scoreSource = old.scoreSource;
    }
  }
  return matches;
}

module.exports = { mergeStoredScores };
