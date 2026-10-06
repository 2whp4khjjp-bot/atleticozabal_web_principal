const normal = value => String(value || '').replace(/\s+/g, ' ').trim();

async function attachRfafActas(page, matches, config) {
  const base = config.base || 'https://www.rfaf.es';
  const season = config.season || '22';
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const pending = (matches || []).filter(match => match.date <= today &&
    match.home && match.away && !match.actaUrl);
  const rounds = [...new Set(pending.map(match => Number(match.round)).filter(Boolean))];

  for (const round of rounds) {
    const url = base + '/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120' +
      '&CodTemporada=' + season + '&CodGrupo=' + config.group +
      '&CodCompeticion=' + config.competition + '&CodJornada=' + round;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!response?.ok() || !page.url().includes('NFG_CmpJornada')) continue;

    for (const match of pending.filter(item => Number(item.round) === round)) {
      const actaUrl = await page.evaluate(({ home, away }) => {
        const normalize = value => String(value || '')
          .replace(/\s+/g, ' ').trim().toUpperCase();
        const row = [...document.querySelectorAll('tr')].find(candidate => {
          const cells = [...candidate.children].filter(child => child.tagName === 'TD');
          return cells.length === 3 && normalize(cells[0].innerText) === normalize(home) &&
            normalize(cells[2].innerText) === normalize(away);
        });
        if (!row) return null;
        const container = row.closest('table')?.parentElement || row;
        return container.querySelector('a[title="Acta del partido"],a[href*="NFG_CmpPartido"]')?.href || null;
      }, { home: normal(match.home), away: normal(match.away) });
      if (actaUrl) match.actaUrl = actaUrl;
    }
  }
  return matches;
}

function normalizeTeam(value) {
  return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function queryValue(params, key) {
  const wanted = key.toLowerCase();
  for (const [name, value] of params.entries()) {
    if (name.toLowerCase() === wanted) return value;
  }
  return '';
}

async function enrichRfafSchedule(page, matches, config = {}) {
  const sourceUrl = new URL(config.source);
  const sourceParams = sourceUrl.searchParams;
  const competition = queryValue(sourceParams, 'codcompeticion');
  const group = queryValue(sourceParams, 'codgrupo');
  const season = queryValue(sourceParams, 'codtemporada') || '22';
  const extra = {
    '48909282:48909312': ['3','1'],
    '49189596:49196403': ['3','1'],
    '49660873:49660937': ['3','1'],
    '48893775:48894181': ['3','2'],
    '48909139:48909177': ['3','1'],
    '49223072:49227064': ['3','1'],
    '49287953:49288358': ['3','2']
  }[competition + ':' + group] || null;
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const upcoming = (matches || []).filter(match => match.date >= today &&
    match.home && match.away && Number.isInteger(Number(match.round)) && Number(match.round) > 0);
  const nearestRound = upcoming.length
    ? Math.min(...upcoming.map(match => Number(match.round)))
    : null;
  const pending = upcoming.filter(match => Number(match.round) === nearestRound &&
    (!match.time || !match.ground));
  const rounds = pending.length ? [nearestRound] : [];
  const base = config.base || sourceUrl.origin;
  const allRecords = new Map();

  for (const round of rounds) {
    const urls = [
      base + '/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120' +
        '&CodCompeticion=' + competition + '&CodGrupo=' + group + '&CodTemporada=' + season +
        (extra ? '&cod_agrupacion=1&Sch_Codigo_Delegacion=' + extra[0] +
          '&Sch_Tipo_Juego=' + extra[1] : '') + '&CodJornada=' + round,
      base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120' +
        '&codgrupo=' + group + '&codcompeticion=' + competition + '&codtemporada=' + season +
        '&CodJornada=' + round + '&CDetalle=0',
      base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120' +
        '&codgrupo=' + group + '&codcompeticion=' + competition + '&codtemporada=' + season +
        '&CodJornada=' + round + '&CDetalle=1'
    ];
    for (const url of urls) {
      try {
        const response = await page.goto(url + '&_cb=' + Date.now(), {
          waitUntil: 'domcontentloaded', timeout: 45000
        });
        if (!response?.ok() || !page.url().includes('NFG_')) {
          console.warn('Vista RFAF no disponible para horarios: ' + url);
          continue;
        }
        const records = await page.evaluate(() => {
          const nodes = [...new Set([
            ...document.querySelectorAll('tr'),
            ...document.querySelectorAll('div.row')
          ])];
          return nodes.map(row => {
            const cells = [...row.children].filter(cell => cell.tagName === 'TD');
            const values = cells.length >= 3
              ? cells.slice(0, 3).map(cell => (cell.innerText || '').replace(/\\s+/g, ' ').trim())
              : [...row.querySelectorAll('table td')].slice(0, 3)
                .map(cell => (cell.innerText || '').replace(/\\s+/g, ' ').trim());
            if (values.length < 3) return null;
            const nearby = [row.innerText || '', row.nextElementSibling?.innerText || '']
              .join('\\n');
            const dateTime = nearby.match(/\\b(\\d{2})[-/](\\d{2})[-/](\\d{4})(?:\\s*(?:-|·)?\\s*(\\d{1,2}:\\d{2}))?/);
            const date = dateTime ? dateTime[3] + '-' + dateTime[2] + '-' + dateTime[1] : null;
            const time = dateTime?.[4] || null;
            const placeLines = nearby.split(/\\n+/).map(line => line.trim()).filter(Boolean);
            const ground = placeLines.find(line =>
              /\\b(CAMPO|ESTADIO|POLIDEPORTIVO|MUNICIPAL|CDAD|CIUDAD DE|COMPLEJO)\\b/i.test(line) &&
              !/\\b(ARBITRO|ÁRBITRO|FECHA|JORNADA)\\b/i.test(line)) || null;
            return { home: values[0], middle: values[1], away: values[2], date, time, ground };
          }).filter(Boolean);
        });
        let matched = 0;
        for (const record of records) {
          const key = normalizeTeam(record.home) + '>' + normalizeTeam(record.away);
          if (!key || key === '>') continue;
          const recordKey = round + ':' + key;
          const previous = allRecords.get(recordKey);
          if (!previous) allRecords.set(recordKey, record);
          else {
            if (!previous.date && record.date) previous.date = record.date;
            if (!previous.time && record.time) previous.time = record.time;
            if (!previous.ground && record.ground) previous.ground = record.ground;
          }
          matched++;
        }
        console.log('RFAF horario ' + url + ': filas=' + records.length + ', pares=' + matched);
      } catch (error) {
        console.warn('Error consultando vista RFAF de horarios: ' + error.message);
      }
    }
  }

  let updated = 0;
  for (const match of pending) {
    const record = allRecords.get(Number(match.round) + ':' +
      normalizeTeam(match.home) + '>' + normalizeTeam(match.away));
    if (!record) continue;
    if (!match.time && record.time) {
      match.time = record.time;
      updated++;
    }
    if (!match.ground && record.ground) match.ground = record.ground;
    if (!match.date && record.date) match.date = record.date;
  }
  console.log('Horarios RFAF: ' + pending.length + ' partidos de la jornada próxima revisados, ' +
    updated + ' horas añadidas; se consultaron las tres vistas de esa jornada.');
  return matches;
}

module.exports = { attachRfafActas, enrichRfafSchedule };
