// Extrae el Benjamín B desde la web pública de la RFAF.
// Nunca almacena cookies ni el HTML completo.
const fs = require('node:fs');
const { chromium } = require('playwright');

const base = 'https://www.rfaf.es';
const source = base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codgrupo=49288292&codcompeticion=49287953&codtemporada=22&CodJornada=1&CDetalle=1';
const group = base + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=49287953&codgrupo=49288292';
const classificationSource = base + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=49288292&codcompeticion=49287953&codjornada=1';
const team = 'ATLETICO ZABAL "A"';
const normal = value => String(value || '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    for (const url of [base + '/', group, source]) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!response || !response.ok()) throw new Error('RFAF HTTP no válido');
    }
    if (!page.url().includes('NFG_VisCalendario_Vis')) {
      throw new Error('RFAF no abrió el calendario del Benjamín B');
    }
    const rawMatches = await page.evaluate(official => {
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
      const rows = [...document.querySelectorAll('div.row')].filter(row => {
        const cells = [...row.querySelectorAll('table td')].slice(0, 3)
          .map(cell => clean(cell.innerText));
        return cells.includes(official);
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
    }, team);
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
      (normal(match.home) !== team && normal(match.away) !== team));
    if (matches.length < 18 || invalid) {
      throw new Error('El calendario del Benjamín B no coincide con el grupo esperado (' + matches.length + ')');
    }

    const response = await page.goto(classificationSource, {
      waitUntil: 'domcontentloaded', timeout: 45000
    });
    if (!response || !response.ok() || !page.url().includes('NFG_VisClasificacion')) {
      throw new Error('RFAF no abrió la clasificación del Benjamín B');
    }
    const sample = await page.evaluate(official => {
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
      const row = [...document.querySelectorAll('tr')].find(element =>
        [...element.querySelectorAll('td')].some(cell => clean(cell.innerText) === official));
      if (!row) return null;
      return {
        cells: [...row.querySelectorAll('td')].map(cell => clean(cell.innerText)),
        roundLabel: (document.body.innerText || '').match(/Jornada\s+\d+/i)?.[0] || null
      };
    }, team);
    const cells = sample?.cells || [];
    const teamIndex = cells.findIndex(value => normal(value) === team);
    const number = index => /^\d+$/.test(cells[index] || '') ? Number(cells[index]) : null;
    const standing = teamIndex >= 1 ? {
      position: number(teamIndex - 1),
      points: number(teamIndex + 2),
      played: number(teamIndex + 3),
      goalsFor: number(teamIndex + 11),
      goalsAgainst: number(teamIndex + 12),
      round: Number(sample.roundLabel?.match(/\d+/)?.[0]) || null
    } : null;
    if (!standing || standing.position < 1 || standing.position > 20 ||
        standing.points === null || standing.played === null ||
        standing.goalsFor === null || standing.goalsAgainst === null) {
      throw new Error('No se puede verificar la clasificación del Benjamín B');
    }
    if (standing.played === 1 && matches[0].score === null && matches[0].date < matches[1].date) {
      const home = normal(matches[0].home) === team;
      matches[0].score = home
        ? [standing.goalsFor, standing.goalsAgainst]
        : [standing.goalsAgainst, standing.goalsFor];
      matches[0].scoreSource = 'classification-inference-single-match';
    }
    const output = { source, classificationSource, updatedAt: new Date().toISOString(), standing, matches };
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync('data/benjamin-b-rfaf.json', JSON.stringify(output, null, 2) + '\n');
    console.log('Benjamín B: ' + matches.length + ' partidos; ' +
      matches.filter(match => match.score).length + ' resultados; ' +
      standing.position + 'º con ' + standing.points + ' puntos.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
