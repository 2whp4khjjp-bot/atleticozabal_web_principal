// Recupera resultados oficiales de la jornada y del calendario sencillo de RFAF.
// Esta rutina trabaja sobre el calendario guardado para no depender de la vista extendida.
const fs = require('node:fs');
const { chromium } = require('playwright');

const base = 'https://www.rfaf.es';
const groups = {
  senior: {
    competition: '48780558', group: '48781448',
    files: ['data/senior-rfaf.json']
  },
  'juvenil-b': {
    competition: '49145109', group: '49151057',
    files: ['data/juvenil-b-rfaf.json']
  },
  cadete: {
    competition: '48909282', group: '48909312',
    files: ['data/cadete-rfaf.json']
  },
  'cadete-b': {
    competition: '49189596', group: '49196403',
    files: ['data/cadete-b-rfaf.json']
  },
  'alevin-a': {
    competition: '48893775', group: '48894181',
    files: ['data/alevin-a-rfaf.json']
  },
  'alevin-b-infantil-a': {
    competition: '48909139', group: '48909177',
    files: ['data/alevin-b-rfaf.json', 'data/infantil-a-rfaf.json']
  },
  'alevines-g4': {
    competition: '49286744', group: '49286942',
    files: ['data/alevin-c-rfaf.json', 'data/alevin-atunara-a-rfaf.json']
  },
  'alevines-g5': {
    competition: '49286744', group: '49287025',
    files: ['data/alevin-zabal-c-rfaf.json', 'data/alevin-atunara-b-rfaf.json']
  },
  'benjamin-a': {
    competition: '48909542', group: '48909586',
    files: ['data/benjamin-a-rfaf.json']
  },
  'benjamin-b': {
    competition: '49287953', group: '49288292',
    files: ['data/benjamin-b-rfaf.json']
  }
};

const family = groups[process.argv[2]];
if (!family) throw new Error('Grupo RFAF desconocido: ' + process.argv[2]);

const normalize = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const scoreFrom = value => {
  const found = String(value || '').trim().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
  return found ? [Number(found[1]), Number(found[2])] : null;
};
const today = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

(async () => {
  const datasets = family.files
    .filter(file => fs.existsSync(file))
    .map(file => ({ file, data: JSON.parse(fs.readFileSync(file, 'utf8')) }));
  if (!datasets.length) throw new Error('No hay calendarios guardados para ' + process.argv[2]);

  const pending = datasets.flatMap(({ file, data }) =>
    (data.matches || [])
      .filter(match => !hasScore(match) && /^\d{4}-\d{2}-\d{2}$/.test(match.date || '') &&
        match.date <= today && match.date >= addDays(today, -14))
      .map(match => ({ file, data, match })));
  const rounds = [...new Set(pending.map(({ match }) => Number(match.round))
    .filter(round => Number.isInteger(round) && round > 0))].sort((a, b) => a - b);
  if (!rounds.length) {
    console.log('Sin marcadores pendientes recientes para ' + process.argv[2]);
    return;
  }

  const browser = await chromium.launch({ headless: true });
  let changed = 0;
  try {
    const page = await browser.newPage({
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 1200 },
      extraHTTPHeaders: {
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache'
      }
    });

    for (const round of rounds) {
      const roundMatches = pending.filter(({ match }) => Number(match.round) === round);
      const sources = [
        base + '/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=' +
          family.competition + '&CodGrupo=' + family.group + '&CodTemporada=22' +
          '&cod_agrupacion=1&CodJornada=' + round +
          '&Sch_Codigo_Delegacion=3&Sch_Tipo_Juego=1',
        base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=22' +
          '&codcompeticion=' + family.competition + '&codgrupo=' + family.group +
          '&CodJornada=' + round + '&cod_agrupacion=1'
      ];
      let roundChanged = false;

      for (const source of sources) {
        try {
          const response = await page.goto(source + '&_cb=' + Date.now(), {
            waitUntil: 'commit', timeout: 20000
          });
          if (!response?.ok() || !page.url().includes('NFG_')) {
            console.warn('Fuente RFAF no disponible: ' + source);
            continue;
          }
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(4000);

          const rows = await page.evaluate(() => {
            return [...document.querySelectorAll('table tr')].map(row => {
              const cells = [...row.children]
                .filter(cell => cell.tagName === 'TD');
              if (cells.length !== 3) return null;
              const scoreHeading = cells[1].querySelector('h4,strong');
              return {
                home: (cells[0].innerText || '').replace(/\s+/g, ' ').trim(),
                score: (scoreHeading?.innerText || cells[1].innerText || '')
                  .replace(/\s+/g, ' ').trim(),
                away: (cells[2].innerText || '').replace(/\s+/g, ' ').trim()
              };
            }).filter(row => row && row.home && row.away);
          });

          for (const entry of roundMatches) {
            const { match, data } = entry;
            if (hasScore(match)) continue;
            const homeKey = normalize(match.home);
            const awayKey = normalize(match.away);
            const row = rows.find(candidate => {
              const rowHome = normalize(candidate.home);
              const rowAway = normalize(candidate.away);
              return rowHome.includes(homeKey) && rowAway.includes(awayKey);
            });
            const score = scoreFrom(row?.score);
            if (!score) continue;
            match.score = score;
            match.scoreSource = source;
            entry.changed = true;
            roundChanged = true;
            changed++;
            console.log('Resultado oficial: ' + match.home + ' ' +
              score[0] + '-' + score[1] + ' ' + match.away +
              ' (J' + round + ', ' + process.argv[2] + ')');
          }
          if (roundMatches.every(({ match }) => hasScore(match) || match.date > today)) break;
        } catch (error) {
          console.warn('No se pudo consultar J' + round + ' en RFAF: ' + error.message);
        }
      }

      if (!roundChanged) {
        console.log('RFAF todavía no entrega un marcador nuevo para J' + round +
          ' (' + process.argv[2] + ').');
      }
    }

    if (changed) {
      const updatedAt = new Date().toISOString();
      for (const dataset of datasets) {
        if (!(dataset.data.matches || []).some(match =>
          pending.some(item => item.file === dataset.file && item.match === match && item.changed))) {
          continue;
        }
        dataset.data.updatedAt = updatedAt;
        fs.writeFileSync(dataset.file, JSON.stringify(dataset.data, null, 2) + '\n');
        console.log('Guardados los resultados de ' + dataset.file);
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

function hasScore(match) {
  return Array.isArray(match?.score) && match.score.length === 2 &&
    match.score.every(value => value !== null && value !== undefined &&
      String(value).trim() !== '');
}

function addDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
