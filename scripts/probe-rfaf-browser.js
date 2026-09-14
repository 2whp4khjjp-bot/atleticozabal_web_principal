// Extrae únicamente partidos públicos de la RFAF en un navegador anónimo.
// Nunca almacena ni registra cookies o el HTML completo.
const fs = require('node:fs');
const { chromium } = require('playwright');

const base = 'https://www.rfaf.es';
const source = base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=22&codcompeticion=48909542&codgrupo=48909586&CodJornada=1&CDetalle=1';
const group = base + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=48909542&codgrupo=48909586';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    for (const url of [base + '/', group, source]) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!response.ok()) throw new Error('RFAF HTTP ' + response.status());
    }
    if (!page.url().includes('NFG_VisCalendario_Vis')) {
      throw new Error('RFAF no abrió el calendario del grupo');
    }
    const matches = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('span.font_responsive')]
        .filter(el => /ATLETICO ZABAL/i.test(el.textContent || ''));
      return nodes.map((el, index) => {
        const row = el.closest('div.row');
        const cells = [...row.querySelectorAll('table td')].slice(0, 3)
          .map(cell => (cell.innerText || '').replace(/\s+/g, ' ').trim());
        const text = row.innerText || '';
        const date = text.match(/\b(\d{2})-(\d{2})-(\d{4})(?:\s*-\s*(\d{2}:\d{2}))?/);
        const score = (cells[1] || '').match(/^(\d{1,2})\s+(\d{1,2})$/);
        const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
        return {
          round: index + 1,
          date: date ? date[3] + '-' + date[2] + '-' + date[1] : null,
          time: date && date[4] ? date[4] : null,
          home: cells[0] || null,
          away: cells[2] || null,
          ground: lines.length >= 3 ? lines[1] : null,
          score: score ? [Number(score[1]), Number(score[2])] : null
        };
      });
    });
    if (matches.length !== 30 ||
      matches.some(match => !match.date || !match.home || !match.away ||
        !/ATLETICO ZABAL/i.test(match.home + ' ' + match.away)) ||
      !/SALESIANOS ALGECIRAS/i.test(matches[0].away) ||
      !/TRASMALLO/i.test(matches[1].home)) {
      throw new Error('Los 30 partidos del Zabal no coinciden con el grupo esperado');
    }
    const classificationUrl = base + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=48909586&codcompeticion=48909542';
    const classificationResponse = await page.goto(classificationUrl, {
      waitUntil: 'domcontentloaded', timeout: 45000
    });
    const standingSample = await page.evaluate(() => {
      const row = [...document.querySelectorAll('tr')].find(el =>
        /ATLETICO ZABAL/i.test(el.innerText || ''));
      if (!row) return null;
      return {
        cells: [...row.querySelectorAll('td')].map(el => (el.innerText || '').trim()),
        heading: (row.closest('table')?.querySelector('thead')?.innerText || '').trim().slice(0, 400),
        roundLabel: (document.body.innerText || '').match(/Jornada\s+\d+/i)?.[0] || null
      };
    });
    console.log('Clasificación HTTP ' + classificationResponse.status() +
      ', ruta ' + new URL(page.url()).pathname +
      ', fila Zabal: ' + JSON.stringify(standingSample));
    const output = { source, updatedAt: new Date().toISOString(), matches };
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync('data/benjamin-a-rfaf.json', JSON.stringify(output, null, 2) + '\n');
    console.log('Verificados ' + matches.length + ' partidos, ' +
      matches.filter(match => match.score).length + ' marcadores completos.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
