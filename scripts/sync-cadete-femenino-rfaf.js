// Extrae el Cadete Femenino desde la web pública de la RFAF.
// Nunca almacena cookies ni el HTML completo.
const fs = require('node:fs');
const { mergeStoredScores } = require('./preserve-rfaf-scores');
const { chromium } = require('playwright');
const { attachRfafActas, enrichRfafSchedule } = require('./rfaf-actas');

const base = 'https://www.rfaf.es';
const source = base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codgrupo=49660937&codcompeticion=49660873&codtemporada=22&CodJornada=1&CDetalle=1';
const group = base + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=49660873&codgrupo=49660937';
const classificationUrl = round => base + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=49660937&codcompeticion=49660873&codjornada=' + round;
const normal = value => String(value || '').replace(/\s+/g, ' ').trim();

(async () => {
  let previousOutput = null;
  try {
    previousOutput = JSON.parse(fs.readFileSync('data/cadete-femenino-rfaf.json', 'utf8'));
  } catch {}
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    for (const url of [group, source]) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!response || !response.ok()) throw new Error('RFAF HTTP no válido');
    }
    if (!page.url().includes('NFG_VisCalendario_Vis')) {
      throw new Error('RFAF no abrió el calendario del Cadete Femenino');
    }
    const rawMatches = await page.evaluate(() => {
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
      const rows = [...document.querySelectorAll('div.row')].filter(row => {
        const cells = [...row.querySelectorAll('table td')].slice(0, 3)
          .map(cell => clean(cell.innerText));
        return cells.some(value => /ATLETICO ZABAL/i.test(value));
      });
      return [...new Set(rows)].map(row => {
        const heading = row.parentElement?.querySelector('h5');
        const roundInfo = (heading?.innerText || '').match(/Jornada\s+(\d+)/i);
        const cells = [...row.querySelectorAll('table td')].slice(0, 3)
          .map(cell => clean(cell.innerText));
        const text = row.innerText || '';
        const date = text.match(/\b(\d{2})-(\d{2})-(\d{4})(?:\s*-\s*(\d{2}:\d{2}))?/);
        const score = (cells[1] || '').match(/^(\d{1,2})(?:\s+|\s*[-–:]\s*)(\d{1,2})$/);
        const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
        return {
          round: roundInfo ? Number(roundInfo[1]) : null,
          date: date ? date[3] + '-' + date[2] + '-' + date[1] : null,
          time: date && date[4] ? date[4] : null,
          home: cells[0] || null,
          away: cells[2] || null,
          ground: lines.find(line => /\s-\s/.test(line)) || null,
          score: score ? [Number(score[1]), Number(score[2])] : null
        };
      });
    });
    const roundDates = await page.evaluate(() => {
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
      return [...document.querySelectorAll('h5')].map(heading => {
        const text = clean(heading.innerText);
        const round = text.match(/Jornada\s+(\d+)/i);
        const date = text.match(/\((\d{2})-(\d{2})-(\d{4})\)/);
        return round && date ? {
          round: Number(round[1]),
          date: date[3] + '-' + date[2] + '-' + date[1]
        } : null;
      }).filter(Boolean);
    });
    const byRound = new Map();
    for (const match of rawMatches) {
      if (!match.round) continue;
      const previous = byRound.get(match.round);
      if (!previous || (!previous.time && match.time) || (!previous.ground && match.ground)) {
        byRound.set(match.round, match);
      }
    }
    const matches = [...byRound.values()].sort((a, b) => a.round - b.round)
      .filter(match => !/^Descansa$/i.test(match.home || '') && !/^Descansa$/i.test(match.away || ''));
    const invalid = matches.find(match => !match.round || !match.date || !match.home || !match.away ||
      !/ATLETICO ZABAL/i.test(match.home + ' ' + match.away));
    if (matches.length < 18 || invalid) {
      throw new Error('El calendario del Cadete Femenino no coincide con el grupo esperado (' + matches.length + ')');
    }
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const classificationRound = roundDates.reduce((round, item) =>
      item.date <= today ? Math.max(round, Number(item.round) || 0) : round, 1);
    const classificationSource = classificationUrl(classificationRound);

    await enrichRfafSchedule(page, matches, { base, source });
    await attachRfafActas(page, matches, { base, competition: '49660873', group: '49660937' });
    const response = await page.goto(classificationSource, {
      waitUntil: 'domcontentloaded', timeout: 45000
    });
    if (!response || !response.ok() || !page.url().includes('NFG_VisClasificacion')) {
      throw new Error('RFAF no abrió la clasificación del Cadete Femenino');
    }
    const sample = await page.evaluate(() => {
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
      const row = [...document.querySelectorAll('tr')].find(element =>
        [...element.querySelectorAll('td')].some(cell => /ATLETICO ZABAL/i.test(clean(cell.innerText))));
      if (!row) return null;
      return {
        cells: [...row.querySelectorAll('td')].map(cell => clean(cell.innerText)),
        roundLabel: (document.body.innerText || '').match(/Jornada\s+\d+/i)?.[0] || null
      };
    });
    const cells = sample?.cells || [];
    const teamIndex = cells.findIndex(value => /ATLETICO ZABAL/i.test(normal(value)));
    const number = index => /^\d+$/.test(cells[index] || '') ? Number(cells[index]) : null;
    const compactTable = cells.length < 14;
    let standing = teamIndex >= 1 ? {
      position: number(teamIndex - 1),
      // La vista de clasificación femenina usa el resumen (puntos al final de la fila).
      // La tabla detallada de otras categorías incluye además PJ y goles.
      points: compactTable ? number(cells.length - 1) : number(teamIndex + 2),
      played: compactTable ? null : number(teamIndex + 3),
      goalsFor: compactTable ? null : number(teamIndex + 11),
      goalsAgainst: compactTable ? null : number(teamIndex + 12),
      round: Number(sample.roundLabel?.match(/\d+/)?.[0]) || null
    } : null;
    let standingVerified = Boolean(standing &&
      Number.isInteger(standing.position) && standing.position >= 1 && standing.position <= 20 &&
      Number.isInteger(standing.points));
    if (!standingVerified) {
      const lastStanding = previousOutput?.standing;
      if (lastStanding && Number.isInteger(lastStanding.position) &&
          lastStanding.position >= 1 && lastStanding.position <= 20 &&
          Number.isInteger(lastStanding.points)) {
        standing = lastStanding;
        console.warn('Clasificación RFAF temporalmente incompleta; se conserva la última clasificación verificada.');
      } else {
        throw new Error('No se puede verificar la clasificación del Cadete Femenino y no hay una clasificación anterior válida');
      }
    }
    if (standingVerified && standing.played === 1 && Number.isInteger(standing.goalsFor) &&
        Number.isInteger(standing.goalsAgainst) && matches[0].score === null &&
        matches[0].date < matches[1].date) {
      const home = /ATLETICO ZABAL/i.test(normal(matches[0].home));
      matches[0].score = home
        ? [standing.goalsFor, standing.goalsAgainst]
        : [standing.goalsAgainst, standing.goalsFor];
      matches[0].scoreSource = 'classification-inference-single-match';
    }
    mergeStoredScores('data/cadete-femenino-rfaf.json', matches);
    const updatedAt = new Date().toISOString();
    const standingUpdatedAt = standingVerified
      ? updatedAt
      : (previousOutput.standingUpdatedAt || previousOutput.updatedAt || null);
    const output = {
      source, classificationSource, updatedAt, standing, standingUpdatedAt,
      standingVerified, rounds: roundDates, matches
    };
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync('data/cadete-femenino-rfaf.json', JSON.stringify(output, null, 2) + '\n');
    console.log('Cadete Femenino: ' + matches.length + ' partidos; ' +
      matches.filter(match => match.score).length + ' resultados; ' +
      standing.position + 'º con ' + standing.points + ' puntos.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
