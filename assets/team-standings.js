(() => {
  const sources = {
    'calendario-senior.html': 'data/senior-rfaf.json',
    'calendario-division-honor.html': 'data/juvenil-dh-rfef.json',
    'calendario-juvenil-b.html': 'data/juvenil-b-rfaf.json',
    'calendario-cadete.html': 'data/cadete-rfaf.json',
    'calendario-cadete-b.html': 'data/cadete-b-rfaf.json',
    'calendario-infantil-a.html': 'data/infantil-a-rfaf.json',
    'calendario-alevin-a.html': 'data/alevin-a-rfaf.json',
    'calendario-alevin-c.html': 'data/alevin-c-rfaf.json',
    'calendario-alevin-atunara-a.html': 'data/alevin-atunara-a-rfaf.json',
    'calendario-alevin-zabal-c.html': 'data/alevin-zabal-c-rfaf.json',
    'calendario-alevin-atunara-b.html': 'data/alevin-atunara-b-rfaf.json',
    'calendario-benjamin-a.html': 'data/benjamin-a-rfaf.json',
    'calendario-benjamin.html': 'data/benjamin-b-rfaf.json'
  };

  for (const card of document.querySelectorAll('.team-card')) {
    const page = card.getAttribute('href')?.split('/').pop();
    const source = sources[page];
    const arrow = card.querySelector('.arrow');
    if (!source || !arrow) continue;

    const standing = document.createElement('span');
    standing.className = 'standing';
    standing.setAttribute('aria-label', 'Clasificación pendiente');
    standing.innerHTML = '<small>POS.</small><strong>—</strong>';
    arrow.before(standing);

    fetch(source, { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('No disponible');
        return response.json();
      })
      .then(data => {
        const position = Number(data?.standing?.position);
        if (!Number.isInteger(position) || position < 1) return;
        standing.querySelector('strong').textContent = position + 'º';
        standing.setAttribute('aria-label', position + 'º en la clasificación');
      })
      .catch(() => {});
  }
})();
