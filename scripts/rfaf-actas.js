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

module.exports = { attachRfafActas };
