// Guarda las clasificaciones completas necesarias para la cartelera semanal de TV.
// Solo consulta páginas públicas de RFAF/RFEF y no conserva cookies ni HTML.
const fs = require('node:fs');
const { chromium } = require('playwright');

const rfaf = 'https://www.rfaf.es';
const rfef = 'https://marcadores.rfef.es';
const sources = [
  { key: 'senior', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=48780558&codgrupo=48781448',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=48781448&codcompeticion=48780558' },
  { key: 'juvenil-dh', root: rfef,
    warmup: rfef + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=22&codcompeticion=33836116&codgrupo=33836120&CodJornada=1',
    url: rfef + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codjornada=1&codcompeticion=33836116&codgrupo=33836120' },
  { key: 'juvenil-b', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=49145109&codgrupo=49151057',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=49151057&codcompeticion=49145109&codjornada=1' },
  { key: 'cadete', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=48909282&codgrupo=48909312',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=48909312&codcompeticion=48909282' },
  { key: 'cadete-b', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=49189596&codgrupo=49196403',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=49196403&codcompeticion=49189596&codjornada=1' },
  { key: 'infantil-a', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=48909139&codgrupo=48909177',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=48909177&codcompeticion=48909139' },
  { key: 'alevin-a', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=48893775&codgrupo=48894181',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=48894181&codcompeticion=48893775' },
  { key: 'alevines-g4', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=49286744&codgrupo=49286942',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=49286942&codcompeticion=49286744&codjornada=1' },
  { key: 'alevines-g5', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=49286744&codgrupo=49287025',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=49287025&codcompeticion=49286744&codjornada=1' },
  { key: 'benjamin-a', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=48909542&codgrupo=48909586',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=48909586&codcompeticion=48909542' },
  { key: 'benjamin-b', root: rfaf,
    warmup: rfaf + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=49287953&codgrupo=49288292',
    url: rfaf + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=49288292&codcompeticion=49287953&codjornada=1' }
];

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
function parseRows(rows) {
  const result = [];
  for (const cells of rows) {
    for (let positionIndex = 0; positionIndex < cells.length; positionIndex++) {
      const rawPosition = clean(cells[positionIndex]);
      if (!/^\d{1,2}$/.test(rawPosition)) continue;
      const position = Number(rawPosition);
      if (position < 1 || position > 20) continue;
      let team = null;
      for (let index = positionIndex + 1; index < Math.min(cells.length, positionIndex + 4); index++) {
        const candidate = clean(cells[index]);
        if (candidate && !/^[-+]?\d+(?:[.,]\d+)?$/.test(candidate)) {
          team = candidate;
          break;
        }
      }
      if (team) result.push({ team, position });
      break;
    }
  }
  const unique = new Map();
  for (const item of result) unique.set(item.team.toUpperCase(), item);
  return [...unique.values()].sort((a, b) => a.position - b.position);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const competitions = {};
  try {
    for (const source of sources) {
      const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
      try {
        for (const url of [source.root + '/', source.warmup, source.url]) {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          if (!response || !response.ok()) throw new Error(source.key + ': HTTP no válido');
        }
        if (!page.url().includes('NFG_VisClasificacion')) {
          throw new Error(source.key + ': no se abrió la clasificación');
        }
        const rows = await page.evaluate(() => [...document.querySelectorAll('tr')]
          .map(row => [...row.querySelectorAll('td')]
            .map(cell => (cell.innerText || '').replace(/\s+/g, ' ').trim()))
          .filter(cells => cells.length >= 4));
        const standings = parseRows(rows);
        if (standings.length < 8) {
          throw new Error(source.key + ': clasificación incompleta (' + standings.length + ')');
        }
        competitions[source.key] = standings;
        console.log(source.key + ': ' + standings.length + ' posiciones verificadas.');
      } finally {
        await page.close();
      }
    }
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync('data/tv-standings.json', JSON.stringify({
      updatedAt: new Date().toISOString(), competitions
    }, null, 2) + '\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
