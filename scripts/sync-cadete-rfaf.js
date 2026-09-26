// Extrae únicamente partidos públicos de la RFAF en un navegador anónimo.
// Nunca almacena ni registra cookies o el HTML completo.
const fs = require('node:fs');
const { chromium } = require('playwright');
const { attachRfafActas } = require('./rfaf-actas');

const base = 'https://www.rfaf.es';
const source = base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=22&codcompeticion=48909282&codgrupo=48909312&CodJornada=1&CDetalle=1';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    const cachedData = fs.existsSync('data/cadete-rfaf.json')
      ? JSON.parse(fs.readFileSync('data/cadete-rfaf.json', 'utf8'))
      : null;
    let matches = [];
    let calendarLoaded = false;
    try {
      const response = await page.goto(source, { waitUntil: 'commit', timeout: 15000 });
      if (!response?.ok()) throw new Error('RFAF HTTP ' + response?.status());
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      if (!page.url().includes('NFG_VisCalendario_Vis')) {
        throw new Error('RFAF no abrió el calendario del Cadete');
      }
      matches = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('span.font_responsive')]
        .filter(el => /ATLETICO ZABAL/i.test(el.textContent || ''));
      return nodes.map((el, index) => {
        const row = el.closest('div.row');
        const cells = [...row.querySelectorAll('table td')].slice(0, 3)
          .map(cell => (cell.innerText || '').replace(/\s+/g, ' ').trim());
        const text = row.innerText || '';
        const date = text.match(/\b(\d{2})-(\d{2})-(\d{4})(?:\s*-\s*(\d{2}:\d{2}))?/);
        const score = (cells[1] || '').match(/^(\d{1,2})(?:\s+|\s*[-–:]\s*)(\d{1,2})$/);
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
      }).filter(match => !/^Descansa$/i.test(match.home || '') &&
        !/^Descansa$/i.test(match.away || ''));
      });
      calendarLoaded = true;
    } catch (error) {
      console.warn('No se pudo leer el calendario extendido; se usará el último calendario guardado: ' +
        error.message);
      matches = cachedData?.matches || [];
    }
    const invalid = matches.find(match => !match.date || !match.home || !match.away ||
      !/ATLETICO ZABAL/i.test(match.home + ' ' + match.away));
    if ((!calendarLoaded && matches.length === 0) || (calendarLoaded && matches.length < 2) || invalid) {
      console.error('Partidos detectados: ' + matches.length);
      console.error('Muestra: ' + JSON.stringify(matches.slice(0, 3)));
      if (invalid) console.error('Partido no válido: ' + JSON.stringify(invalid));
      throw new Error('El calendario del Cadete no coincide con el grupo esperado');
    }
    // La vista extendida a veces tarda en reflejar el marcador. Consultar también
    // la jornada oficial y el calendario sencillo del mismo grupo.
    const scoreSources = [...new Set(matches
      .filter(match => !match.score && match.date <= new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Europe/Madrid'
      }))
      .map(match => Number(match.round))
      .filter(round => Number.isInteger(round) && round > 0))]
      .flatMap(round => [
        base + '/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=48909282&CodGrupo=48909312&CodTemporada=22&cod_agrupacion=1&CodJornada=' + round + '&Sch_Codigo_Delegacion=3&Sch_Tipo_Juego=1',
        base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=22&codcompeticion=48909282&codgrupo=48909312&CodJornada=' + round + '&cod_agrupacion=1'
      ]);
    const normalizeTeam = value => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const scoreSource of scoreSources) {
      const response = await page.goto(scoreSource, {
        waitUntil: 'commit', timeout: 15000
      }).catch(error => {
        console.warn('No se pudo consultar la fuente alternativa de marcadores: ' + error.message);
        return null;
      });
      if (!response?.ok() || !page.url().includes('NFG_')) {
        console.warn('Fuente alternativa de marcadores no disponible: ' + scoreSource);
        continue;
      }
      const rows = await page.evaluate(() => {
        const nodes = [...new Set([
          ...document.querySelectorAll('tr'),
          ...document.querySelectorAll('div.row')
        ])];
        return nodes.map(node => ({
          text: (node.innerText || '').replace(/\s+/g, ' ').trim(),
          cells: [...node.querySelectorAll('td')]
            .map(cell => (cell.innerText || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
        })).filter(row => row.text && /ATLETICO\s+ZABAL/i.test(row.text));
      });
      for (const match of matches.filter(candidate => !candidate.score)) {
        const home = normalizeTeam(match.home);
        const away = normalizeTeam(match.away);
        const row = rows.find(candidate => {
          const text = normalizeTeam(candidate.text);
          return text.includes(home) && text.includes(away);
        });
        if (!row) continue;
        const scoreCell = row.cells.find(cell =>
          /^(\d{1,2})\s*(?:[-–]\s*|\s+)(\d{1,2})$/.test(cell));
        const score = scoreCell?.match(/^(\d{1,2})\s*(?:[-–]\s*|\s+)(\d{1,2})$/);
        if (score) {
          match.score = [Number(score[1]), Number(score[2])];
          match.scoreSource = scoreSource;
          console.log('Marcador Cadete recuperado desde fuente alternativa: ' +
            match.home + ' ' + score[1] + '-' + score[2] + ' ' + match.away);
        }
      }
      if (matches.every(match => match.score || match.date > new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Europe/Madrid'
      }))) break;
    }
    await attachRfafActas(page, matches, {
      base, competition: '48909282', group: '48909312'
    }).catch(error => {
      console.warn('No se pudieron consultar las actas; se conserva el calendario: ' + error.message);
    });
    const classificationUrl = base + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codgrupo=48909312&codcompeticion=48909282';
    let standing = cachedData?.standing || null;
    let classificationVerified = false;
    try {
      const classificationResponse = await page.goto(classificationUrl, {
        waitUntil: 'commit', timeout: 15000
      });
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      const standingSample = await page.evaluate(() => {
        const row = [...document.querySelectorAll('tr')].find(el =>
          /ATLETICO ZABAL/i.test(el.innerText || ''));
        if (!row) return null;
        return {
          cells: [...row.querySelectorAll('td')].map(el => (el.innerText || '').trim()),
          heading: (row.closest('table')?.querySelector('thead')?.innerText || '').trim().slice(0, 400),
          roundLabel: (document.body.innerText || '').match(/Jornada\\s+\\d+/i)?.[0] || null
        };
      });
      const cells = standingSample?.cells || [];
      const teamIndex = cells.findIndex(value => /^ATLETICO ZABAL$/i.test(value));
      const number = index => /^\\d+$/.test(cells[index] || '') ? Number(cells[index]) : null;
      const freshStanding = teamIndex >= 1 ? {
        position: number(teamIndex - 1),
        points: number(teamIndex + 2),
        played: number(teamIndex + 3),
        goalsFor: number(teamIndex + 11),
        goalsAgainst: number(teamIndex + 12),
        round: Number(standingSample.roundLabel?.match(/\\d+/)?.[0]) || null
      } : null;
      if (classificationResponse?.ok() && page.url().includes('NFG_VisClasificacion') &&
          freshStanding && freshStanding.position >= 1 && freshStanding.position <= 20 &&
          freshStanding.points !== null && freshStanding.played !== null &&
          freshStanding.goalsFor !== null && freshStanding.goalsAgainst !== null) {
        standing = freshStanding;
        classificationVerified = true;
      } else {
        console.warn('La clasificación no está disponible; se conserva la última guardada.');
      }
    } catch (error) {
      console.warn('No se pudo consultar la clasificación; se conserva la última guardada: ' +
        error.message);
    }
    if (!standing) throw new Error('No hay una clasificación guardada ni se pudo verificar la actual');
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
    if (classificationVerified) {
      console.log('Clasificación verificada: ' + standing.position + 'º, ' +
        standing.points + ' puntos, ' + standing.played + ' partidos (J' + standing.round + ').');
    }
    const output = { source, classificationSource: classificationVerified ? classificationUrl : (cachedData?.classificationSource || classificationUrl),
      updatedAt: new Date().toISOString(), standing, matches };
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync('data/cadete-rfaf.json', JSON.stringify(output, null, 2) + '\n');
    console.log('Verificados ' + matches.length + ' partidos, ' +
      matches.filter(match => match.score).length + ' marcadores completos.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
