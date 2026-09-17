(() => {
  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const isClubTeam = name => {
    const value = normalize(name);
    return value.includes('ATLETICO ZABAL') || value.startsWith('ATLETICO ATUNARA C.D.');
  };

  function highlightMatch(element) {
    if (element.dataset.clubHighlight === '1') return;
    const names = element.textContent.trim().split(/\s+[–-]\s+/);
    if (names.length !== 2 || !names.some(isClubTeam)) return;

    const fragment = document.createDocumentFragment();
    names.forEach((name, index) => {
      const span = document.createElement('span');
      span.textContent = name;
      if (isClubTeam(name)) span.className = 'club-team';
      fragment.append(span);
      if (index === 0) fragment.append(document.createTextNode(' – '));
    });
    element.dataset.clubHighlight = '1';
    element.replaceChildren(fragment);
  }

  function highlightCoach(element) {
    if (element.dataset.coachHighlight === '1') return;
    const match = element.textContent.trim().match(/^Entrenador\s*·\s*(.+)$/i);
    if (!match) return;
    const name = document.createElement('span');
    name.className = 'coach-name';
    name.textContent = match[1];
    element.dataset.coachHighlight = '1';
    element.replaceChildren(document.createTextNode('Entrenador · '), name);
  }

  function highlightCardTitle(element) {
    if (element.dataset.cardHighlight === '1') return;
    const parts = element.textContent.trim().split(/\s*·\s*/);
    const team = document.createElement('span');
    team.className = 'club-team';
    team.textContent = parts.shift();
    element.dataset.cardHighlight = '1';
    element.replaceChildren(team);
    if (parts.length) {
      const coach = document.createElement('span');
      coach.className = 'coach-name';
      coach.textContent = parts.join(' · ');
      element.append(document.createTextNode(' · '), coach);
    }
  }

  function highlightAgendaLabel(element) {
    if (element.dataset.coachHighlight === '1') return;
    const parts = element.textContent.trim().split(/\s*·\s*/);
    const coachIndex = parts.findIndex(part => /^(Berrocal|Cristian)$/i.test(part));
    if (coachIndex < 0) return;
    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      if (index) fragment.append(document.createTextNode(' · '));
      if (index === coachIndex) {
        const coach = document.createElement('span');
        coach.className = 'coach-name';
        coach.textContent = part;
        fragment.append(coach);
      } else {
        fragment.append(document.createTextNode(part));
      }
    });
    element.dataset.coachHighlight = '1';
    element.replaceChildren(fragment);
  }

  function applyHighlights() {
    document.querySelectorAll('.teams:not(section), .match').forEach(highlightMatch);
    document.querySelectorAll('.coach').forEach(highlightCoach);
    document.querySelectorAll('.team-card h2').forEach(highlightCardTitle);
    if (document.querySelector('.coach')) {
      const heading = document.querySelector('main h1');
      if (heading) highlightCardTitle(heading);
    }
    document.querySelectorAll('.team').forEach(highlightAgendaLabel);
  }

  const observer = new MutationObserver(applyHighlights);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyHighlights, { once: true });
  } else {
    applyHighlights();
  }
})();
