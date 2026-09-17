// Extrae los dos alevines del Grupo 4 desde la web pública de la RFAF.
// Nunca almacena cookies ni el HTML completo.
const fs = require('node:fs');
const { chromium } = require('playwright');

const base = 'https://www.rfaf.es';
const source = base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codgrupo=49286942&codcompeticion=49286744&codtemporada=22&CodJornada=1&CDetalle=1';
const group = base + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=49286744&codgrupo=49286942';
const classificationSource = base + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=49286942&codcompeticion=49286744&codjornada=1';
const teams = [
  { key: 'alevin-c', official: 'ATLETICO ZABAL "A"', label: 'Alevín B' },
  { key: 'alevin-atunara-a', official: 'ATLETICO ATUNARA C.D. "A"', label: 'Alevín Atunara A' }
];
const normal = value => String(value || '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    for (const url of [base + '/', group, source]) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!response.ok()) throw new Error('RFAF HTTP ' + response.status());
    }
    if (!page.url().includes('NFG_VisCalendario_Vis')) {
      throw new Error('RFAF no abrió el calendario del Grupo 4');
    }
    const officialNames = teams.map(team => team.official);
    const groupMatches = await page.evaluate(names => {
      const normal = value => String(value || '').replace(/\s+/g, ' ').trim();
      const rows = [...document.querySelectorAll('div.row')].filter(row => {
        const teams = [...row.querySelectorAll('table td')].slice(0, 3).map(cell => normal(cell.innerText));
        return names.some(name => teams.includes(name));
      });
      return [...new Set(rows)].map(row => {
        const heading = row.parentElement?.querySelector('h5');
        const roundInfo = (heading?.innerText || '').match(/Jornada\s+(\d+)\s*\((\d{2})-(\d{2})-(\d{4})\)/i);
        const cells = [...row.querySelectorAll('table td')].slice(0, 3)
          .map(cell => normal(cell.innerText));
        const text = row.innerText || '';
        const date = text.match(/\b(\d{2})-(\d{2})-(\d{4})(?:\s*-\s*(\d{2}:\d{2}))?/);
        const score = (cells[1] || '').match(/^(\d{1,2})\s+(\d{1,2})$/);
        const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
        return {
          round: roundInfo ? Number(roundInfo[1]) : null,
          date: date ? date[3] + '-' + date[2] + '-' + date[1] : null,
          time: date && date[4] ? date[4] : null,
          home: cells[0] || null,
          away: cells[2] || null,
          ground: lines.length >= 3 ? lines[1] : null,
          score: score ? [Number(score[1]), Number(score[2])] : null
        };
      });
    }, officialNames);
    const matchesByTeam = {};
    for (const team of teams) {
      const matches = groupMatches.filter(match =>
        (normal(match.home) === team.official || normal(match.away) === team.official) &&
        normal(match.home) !== 'Descansa' && normal(match.away) !== 'Descansa');
      if (matches.length !== 28 || matches.some(match =>
        !match.round || !match.date || !match.home || !match.away ||
        (normal(match.home) !== team.official && normal(match.away) !== team.official))) {
        throw new Error('El calendario del ' + team.label + ' no coincide con el grupo esperado');
      }
      matchesByTeam[team.key] = matches;
    }

    const response = await page.goto(classificationSource, {
      waitUntil: 'domcontentloaded', timeout: 45000
    });
    if (!response.ok() || !page.url().includes('NFG_VisClasificacion')) {
      throw new Error('RFAF no abrió la clasificación del Grupo 4');
    }
    const tableRows = await page.evaluate(() => [...document.querySelectorAll('tr')]
      .map(row => [...row.querySelectorAll('td')].map(cell => (cell.innerText || '').trim()))
      .filter(cells => cells.length >= 15));
    const roundLabel = await page.evaluate(() =>
      (document.body.innerText || '').match(/Jornada\s+\d+/i)?.[0] || null);
    const number = (cells, index) => /^\d+$/.test(cells[index] || '') ? Number(cells[index]) : null;
    const updatedAt = new Date().toISOString();
    fs.mkdirSync('data', { recursive: true });

    for (const team of teams) {
      const cells = tableRows.find(row => row.some(value => normal(value) === team.official));
      const teamIndex = cells?.findIndex(value => normal(value) === team.official) ?? -1;
      const standing = teamIndex >= 1 ? {
        position: number(cells, teamIndex - 1),
        points: number(cells, teamIndex + 2),
        played: number(cells, teamIndex + 3),
        goalsFor: number(cells, teamIndex + 11),
        goalsAgainst: number(cells, teamIndex + 12),
        round: Number(roundLabel?.match(/\d+/)?.[0]) || null
      } : null;
      if (!standing || standing.position < 1 || standing.position > 20 ||
          standing.points === null || standing.played === null ||
          standing.goalsFor === null || standing.goalsAgainst === null) {
        throw new Error('No se puede verificar la clasificación del ' + team.label);
      }
      const matches = matchesByTeam[team.key];
      if (standing.played === 1 && matches[0].score === null &&
          matches[0].date < matches[1].date) {
        const home = normal(matches[0].home) === team.official;
        matches[0].score = home
          ? [standing.goalsFor, standing.goalsAgainst]
          : [standing.goalsAgainst, standing.goalsFor];
        matches[0].scoreSource = 'classification-inference-single-match';
      }
      const output = { source, classificationSource, updatedAt, standing, matches };
      fs.writeFileSync('data/' + team.key + '-rfaf.json', JSON.stringify(output, null, 2) + '\n');
      console.log(team.label + ': ' + matches.length + ' partidos; ' +
        matches.filter(match => match.score).length + ' resultados; ' +
        standing.position + 'º con ' + standing.points + ' puntos.');
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
