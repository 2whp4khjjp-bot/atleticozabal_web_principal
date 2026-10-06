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
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
  const missing = upcoming.filter(match => !match.time || !match.ground);
  const rounds = [...new Set(missing.map(match => Number(match.round)))]
    .sort((a, b) => a - b);
  const roundsToCheck = rounds.slice(0, 3);
  const pending = missing;
  const base = config.base || sourceUrl.origin;
  const allRecords = new Map();

  for (const round of rounds) {
    const urls = roundsToCheck.map(round => ({
      round,
      url: base + '/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120' +
        '&CodCompeticion=' + competition + '&CodGrupo=' + group + '&CodTemporada=' + season +
        (extra ? '&cod_agrupacion=1&Sch_Codigo_Delegacion=' + extra[0] +
          '&Sch_Tipo_Juego=' + extra[1] : '') + '&CodJornada=' + round
    }));
    const calendarRound = roundsToCheck[0];
    if (calendarRound) urls.push(
      {
        round: calendarRound,
        url: base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120' +
          '&codgrupo=' + group + '&codcompeticion=' + competition + '&codtemporada=' + season +
          '&CodJornada=' + calendarRound + '&CDetalle=0'
      },
      {
        round: calendarRound,
        url: base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120' +
          '&codgrupo=' + group + '&codcompeticion=' + competition + '&codtemporada=' + season +
          '&CodJornada=' + calendarRound + '&CDetalle=1'
      }
    );
    const allRecords = new Map();

    for (const source of urls) {
      const { url, round: defaultRound } = source;
      try {
        const response = await page.goto(url + '&_cb=' + Date.now(), {
          waitUntil: 'domcontentloaded', timeout: 45000
        });
        if (!response?.ok() || !page.url().includes('NFG_')) {
          console.warn('Vista RFAF no disponible para horarios: ' + url);
          continue;
        }
        const records = await page.evaluate(({ isCalendar, defaultRound }) => {
          const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
          if (isCalendar) {
            const containers = [...new Set([...document.querySelectorAll('span.font_responsive')]
              .map(element => element.closest('div.row')).filter(Boolean))];
            return containers.map(row => {
              const cells = [...row.querySelectorAll('table td')].slice(0, 3).map(cell =>
                normalize(cell.innerText));
              if (cells.length < 3) return null;
              const heading = row.parentElement?.querySelector('h5')?.innerText || '';
              const round = Number(heading.match(/Jornada\s+(\d+)/i)?.[1]) || defaultRound;
              const text = row.innerText || '';
              const dateTime = text.match(/\b(\d{2})[-/](\d{2})[-/](\d{4})(?:\s*(?:-|·)?\s*(\d{1,2}:\d{2}))?/);
              const place = row.querySelector('a[href*="NFG_VisCampos"]')?.innerText?.trim() || null;
              return {
                round,
                home: cells[0], middle: cells[1], away: cells[2],
                date: dateTime ? dateTime[3] + '-' + dateTime[2] + '-' + dateTime[1] : null,
                time: dateTime?.[4] || null,
                ground: place
              };
            }).filter(Boolean);
          }

          const rows = [...document.querySelectorAll('tr')];
          return rows.map(row => {
            const cells = [...row.children].filter(cell => cell.tagName === 'TD');
            const values = cells.length >= 3
              ? cells.slice(0, 3).map(cell => normalize(cell.innerText))
              : [...row.querySelectorAll('table td')].slice(0, 3)
                .map(cell => normalize(cell.innerText));
            if (values.length < 3) return null;
            const nearby = [row.innerText || '', row.nextElementSibling?.innerText || '']
              .join('\n');
            const dateTime = nearby.match(/\b(\d{2})[-/](\d{2})[-/](\d{4})(?:\s*(?:-|·)?\s*(\d{1,2}:\d{2}))?/);
            const place = row.nextElementSibling?.querySelector('a[href*="NFG_VisCampos"]')
              ?.innerText?.trim() || null;
            return {
              round: defaultRound,
              home: values[0], middle: values[1], away: values[2],
              date: dateTime ? dateTime[3] + '-' + dateTime[2] + '-' + dateTime[1] : null,
              time: dateTime?.[4] || null,
              ground: place
            };
          }).filter(Boolean);
        }, { isCalendar: url.includes('NFG_VisCalendario_Vis'), defaultRound });
        let matched = 0;
        for (const record of records) {
          const recordRound = Number(record.round) || defaultRound;
          if (!rounds.includes(recordRound)) continue;
          const key = normalizeTeam(record.home) + '>' + normalizeTeam(record.away);
          if (!key || key === '>') continue;
          const recordKey = recordRound + ':' + key;
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
  console.log('Horarios RFAF: ' + pending.length + ' partidos futuros revisados; modo jornada en ' +
    roundsToCheck.join(', ') + ' y calendarios anuales resumido y extendido completos; ' +
    updated + ' horas añadidas.');
  return matches;
}

module.exports = { attachRfafActas, enrichRfafSchedule };
