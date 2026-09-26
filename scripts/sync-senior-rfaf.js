// Extrae únicamente partidos públicos de la RFAF en un navegador anónimo.
// Nunca almacena ni registra cookies o el HTML completo.
const fs = require('node:fs');
const { mergeStoredScores } = require('./preserve-rfaf-scores');
const { chromium } = require('playwright');
const { attachRfafActas } = require('./rfaf-actas');

const base = 'https://www.rfaf.es';
const source = base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=22&codcompeticion=48780558&codgrupo=48781448&CodJornada=1&CDetalle=1';
const group = base + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=48780558&codgrupo=48781448';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    const previous = fs.existsSync('data/senior-rfaf.json')
      ? JSON.parse(fs.readFileSync('data/senior-rfaf.json', 'utf8'))
      : { matches: [] };
    for (const url of [group, source]) {
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
        const scoreCell = row.querySelectorAll('table td')[1];
        const cells = [...row.querySelectorAll('table td')].slice(0, 3)
          .map(cell => (cell.innerText || '').replace(/\s+/g, ' ').trim());
        const text = row.innerText || '';
        const date = text.match(/\b(\d{2})-(\d{2})-(\d{4})(?:\s*-\s*(\d{2}:\d{2}))?/);
        const scoreParts = scoreCell ? [...scoreCell.querySelectorAll('strong')].map(node => {
          const visible = (node.innerText || '').match(/\d{1,2}/);
          if (visible) return visible[0];
          const coded = [...node.querySelectorAll('[id^="idh"]')].map(icon => {
            const classValue = String(icon.className || '').match(/(?:^|\s)fa-(\d)(?:\s|$)/);
            if (classValue) return classValue[1];
            const generated = getComputedStyle(icon, '::after').content || '';
            const generatedValue = generated.match(/\d/);
            if (generatedValue) return generatedValue[0];
            const rule = node.querySelector('style')?.textContent || '';
            return rule.match(/content\s*:\s*["'](\d)["']/)?.[1] || null;
          }).filter(Boolean);
          return coded.length ? coded.join('') : null;
        }).filter(value => /^\d{1,2}$/.test(value || '')) : [];
        const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
        return {
          round: index + 1,
          date: date ? date[3] + '-' + date[2] + '-' + date[1] : null,
          time: date && date[4] ? date[4] : null,
          home: cells[0] || null,
          away: cells[2] || null,
          ground: lines.length >= 3 ? lines[1] : null,
          score: scoreParts.length === 2 ? scoreParts.map(Number) : null
        };
      }).filter(match => !/^Descansa$/i.test(match.home || '') &&
        !/^Descansa$/i.test(match.away || ''));
    });
    const invalid = matches.find(match => !match.date || !match.home || !match.away ||
      !/ATLETICO ZABAL/i.test(match.home + ' ' + match.away));
    if (matches.length < 2 || invalid) {
      console.error('Partidos detectados: ' + matches.length);
      console.error('Muestra: ' + JSON.stringify(matches.slice(0, 3)));
      if (invalid) console.error('Partido no válido: ' + JSON.stringify(invalid));
      throw new Error('El calendario del Sénior no coincide con el grupo esperado');
    }
    await attachRfafActas(page, matches, { base, competition: '48780558', group: '48781448' });
    const classificationUrl = base + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=48781448&codcompeticion=48780558';
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
    const cells = standingSample?.cells || [];
    const teamIndex = cells.findIndex(value => /^ATLETICO ZABAL$/i.test(value));
    const number = index => /^\d+$/.test(cells[index] || '') ? Number(cells[index]) : null;
    const currentStanding = teamIndex >= 1 ? {
      position: number(teamIndex - 1),
      points: number(teamIndex + 2),
      played: number(teamIndex + 3) !== null && number(teamIndex + 7) !== null
        ? number(teamIndex + 3) + number(teamIndex + 7) : null,
      goalsFor: number(teamIndex + 11),
      goalsAgainst: number(teamIndex + 12),
      round: Number(standingSample.roundLabel?.match(/\d+/)?.[0]) || null
    } : null;
    let standing = currentStanding;
    if (!classificationResponse.ok ||
        !page.url().includes('NFG_VisClasificacion') ||
        !standing || standing.position < 1 || standing.position > 20 ||
        standing.points === null || standing.played === null ||
        standing.goalsFor === null || standing.goalsAgainst === null) {
      // La clasificación es complementaria: un cambio en su tabla no debe
      // impedir que se publiquen marcadores que sí se han leído del calendario.
      standing = previous.standing || null;
      if (!standing) throw new Error('No se puede verificar ni conservar la clasificación del Sénior');
      console.warn('Clasificación RFAF no legible; se conserva la última clasificación válida.');
    }
    // Un solo partido oficial permite deducir su marcador del total de goles de la tabla.
    if (standing.played === 1 && matches[0].score === null &&
        matches[0].date < matches[1].date && standing.goalsFor >= 0 &&
        standing.goalsAgainst >= 0) {
      const zabalHome = /^ATLETICO ZABAL$/i.test(matches[0].home);
      matches[0].score = zabalHome
        ? [standing.goalsFor, standing.goalsAgainst]
        : [standing.goalsAgainst, standing.goalsFor];
      matches[0].scoreSource = 'classification-inference-single-match';
    }
    console.log('Clasificación verificada: ' + standing.position + 'º, ' +
      standing.points + ' puntos, ' + standing.played + ' partidos (J' + standing.round + ').');
    mergeStoredScores('data/senior-rfaf.json', matches);
    const output = { source, classificationSource: classificationUrl,
      updatedAt: new Date().toISOString(), standing, matches };
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync('data/senior-rfaf.json', JSON.stringify(output, null, 2) + '\n');
    console.log('Verificados ' + matches.length + ' partidos, ' +
      matches.filter(match => match.score).length + ' marcadores completos.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
