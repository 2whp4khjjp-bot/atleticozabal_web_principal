// Sincroniza los partidos públicos del Juvenil División de Honor desde Marcadores RFEF.
// No usa cuentas, cookies persistentes ni datos privados.
const fs = require('node:fs');
const { chromium } = require('playwright');

const base = 'https://marcadores.rfef.es';
const competition = '33836116';
const group = '33836120';
const season = '22';
const calendarSource = base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=' + season + '&codcompeticion=' + competition + '&codgrupo=' + group + '&CodJornada=1';
const classificationSource = base + '/pnfg/NPcd/NFG_VisClasificacion?cod_primaria=1000120&codjornada=1&codcompeticion=' + competition + '&codgrupo=' + group;

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    const matches = [];
    for (let round = 1; round <= 34; round++) {
      const url = base + '/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=' +
        competition + '&CodGrupo=' + group + '&CodTemporada=' + season + '&CodJornada=' + round;
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!response || !response.ok()) throw new Error('RFEF HTTP en jornada ' + round);
      const match = await page.evaluate(() => {
        const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
        const cards = [...document.querySelectorAll('table.table.table-bordered.table-striped.table-light')];
        for (const card of cards) {
          const home = norm(card.querySelector('.font_widgetL h4')?.textContent);
          const away = norm(card.querySelector('.font_widgetV h4')?.textContent);
          if (!/Atlético Zabal/i.test(home + ' ' + away)) continue;
          const center = card.querySelector('td[width="20%"]');
          const info = norm(center?.innerText);
          const date = info.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
          const time = info.match(/\b(\d{2}:\d{2})\b/);
          const goals = [...(center?.querySelectorAll('.wid2_resultado_cerrada') || [])]
            .map(node => norm(node.innerText)).filter(value => /^\d{1,2}$/.test(value));
          const field = norm(card.querySelector('tr:nth-child(2) .col-sm-6.font_widgetL')?.childNodes?.[0]?.textContent);
          const acta = card.querySelector('a[title="Acta del partido"]')?.href || null;
          return {
            date: date ? date[3] + '-' + date[2] + '-' + date[1] : null,
            time: time ? time[1] : null,
            home, away, ground: field || null,
            score: goals.length === 2 ? goals.map(Number) : null,
            actaUrl: acta
          };
        }
        return null;
      });
      if (!match || !match.date || !match.home || !match.away) {
        throw new Error('No se pudo leer el partido del Zabal en jornada ' + round);
      }
      matches.push({ round, ...match });
    }
    if (matches.length !== 34 ||
      !/Arenas de Armilla/i.test(matches[0].home) ||
      !/Atlético Zabal/i.test(matches[0].away) ||
      !/UD Tomares/i.test(matches[1].away)) {
      throw new Error('Las 34 jornadas no coinciden con el Grupo 4 del Juvenil');
    }
    const response = await page.goto(classificationSource, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!response || !response.ok()) throw new Error('No se pudo abrir la clasificación RFEF');
    const standing = await page.evaluate(() => {
      const row = [...document.querySelectorAll('tr')].find(node => /Atlético Zabal/i.test(node.innerText || ''));
      const cells = row ? [...row.querySelectorAll('td')].map(cell => cell.innerText.replace(/\s+/g, ' ').trim()) : [];
      const number = index => /^\d+$/.test(cells[index] || '') ? Number(cells[index]) : null;
      return { position: number(1), points: number(3), played: number(4) };
    });
    if (!standing || standing.position < 1 || standing.position > 18 ||
      standing.points === null || standing.played === null) {
      throw new Error('No se pudo verificar la clasificación del Juvenil');
    }
    const output = {
      source: calendarSource,
      resultsSource: base + '/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=' + competition + '&CodGrupo=' + group + '&CodTemporada=' + season,
      classificationSource,
      updatedAt: new Date().toISOString(),
      standing,
      matches
    };
    fs.mkdirSync('data', { recursive: true });
    fs.writeFileSync('data/juvenil-dh-rfef.json', JSON.stringify(output, null, 2) + '\n');
    console.log('RFEF verificada: ' + matches.length + ' jornadas, clasificación ' +
      standing.position + 'º · ' + standing.points + ' puntos.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

// Fin del actualizador.
