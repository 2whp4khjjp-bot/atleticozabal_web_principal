const { test } = require('node:test');
const assert = require('node:assert/strict');
const { enrichRfafSchedule } = require('../scripts/rfaf-actas');

test('incorpora la hora aunque RFAF anteponga C. D. al nombre guardado', async () => {
  let currentUrl = '';
  const page = {
    async goto(url) { currentUrl = url; return { ok: () => true }; },
    url() { return currentUrl; },
    async evaluate() {
      return [
        { round: 10, date: '2099-11-21', home: 'C. D. ATLETICO ZABAL',
          away: 'A.D. MARIANISTAS C.D.', time: '10:00', ground: 'VIRGEN DEL CARMEN' },
        { round: 10, date: '2099-11-21', home: 'ATUNARA ATLETICO C.D. "B"',
          away: 'C. D. RVO. PUENTE MAYORGA C.F. "B"', time: '18:00', ground: 'VIRGEN DEL CARMEN' }
      ];
    }
  };
  const matches = [
    { round: 10, date: '2099-11-21', home: 'ATLETICO ZABAL',
      away: 'A.D. MARIANISTAS C.D.', time: null, ground: null },
    { round: 10, date: '2099-11-21', home: 'ATUNARA ATLETICO C.D. "B"',
      away: 'PUENTE MAYORGA RVO. "B"', time: null, ground: null },
    { round: 10, date: '2099-11-21', home: 'ATUNARA ATLETICO C.D. "A"',
      away: 'PUENTE MAYORGA RVO. "B"', time: null, ground: null }
  ];
  await enrichRfafSchedule(page, matches, {
    source: 'https://www.rfaf.es/pnfg/NPcd/NFG_VisCalendario_Vis?codcompeticion=48909139&codgrupo=48909177&codtemporada=22'
  });
  assert.equal(matches[0].time, '10:00');
  assert.equal(matches[0].ground, 'VIRGEN DEL CARMEN');
  assert.equal(matches[1].time, '18:00');
  assert.equal(matches[1].ground, 'VIRGEN DEL CARMEN');
  assert.equal(matches[2].time, null);
  assert.equal(matches[2].ground, null);
});

test('rechaza una consulta vacía de RFAF en vez de darla por actualizada', async () => {
  let currentUrl = '';
  const page = {
    async goto(url) { currentUrl = url; return { ok: () => true }; },
    url() { return currentUrl; },
    async evaluate() { return []; }
  };
  const matches = [{ round: 10, date: '2099-11-21', home: 'ATLETICO ZABAL',
    away: 'A.D. MARIANISTAS C.D.', time: null, ground: null }];
  await assert.rejects(enrichRfafSchedule(page, matches, {
    source: 'https://www.rfaf.es/pnfg/NPcd/NFG_VisCalendario_Vis?codcompeticion=48909139&codgrupo=48909177&codtemporada=22'
  }), /no devolvió filas/);
  assert.equal(matches[0].time, null);
});

test('corrige la fecha y la localía cuando cambia la jornada oficial', async () => {
  let currentUrl = '';
  const page = {
    async goto(url) { currentUrl = url; return { ok: () => true }; },
    url() { return currentUrl; },
    async evaluate() {
      return [{ round: 10, date: '2099-11-20', home: 'C. D. ATLETICO ZABAL',
        away: 'A.D. MARIANISTAS C.D.', time: '17:00', ground: 'CAMPO OFICIAL' }];
    }
  };
  const matches = [{ round: 10, date: '2099-11-21', home: 'A.D. MARIANISTAS C.D.',
    away: 'ATLETICO ZABAL', time: '18:00', ground: 'CAMPO ANTIGUO', score: [1, 2] }];
  await enrichRfafSchedule(page, matches, {
    source: 'https://www.rfaf.es/pnfg/NPcd/NFG_VisCalendario_Vis?codcompeticion=48909139&codgrupo=48909177&codtemporada=22',
    strict: true
  });
  assert.equal(matches[0].date, '2099-11-20');
  assert.equal(matches[0].time, '17:00');
  assert.equal(matches[0].home, 'C. D. ATLETICO ZABAL');
  assert.equal(matches[0].away, 'A.D. MARIANISTAS C.D.');
  assert.equal(matches[0].ground, 'CAMPO OFICIAL');
  assert.deepEqual(matches[0].score, [2, 1]);
});

test('rechaza un partido sin correspondencia oficial en modo estricto', async () => {
  let currentUrl = '';
  const page = {
    async goto(url) { currentUrl = url; return { ok: () => true }; },
    url() { return currentUrl; },
    async evaluate() {
      return [{ round: 10, date: '2099-11-20', home: 'OTRO CLUB',
        away: 'A.D. MARIANISTAS C.D.', time: '17:00', ground: 'CAMPO' }];
    }
  };
  const matches = [{ round: 10, date: '2099-11-21', home: 'ATLETICO ZABAL',
    away: 'A.D. MARIANISTAS C.D.', time: '18:00', ground: 'CAMPO ANTIGUO' }];
  await assert.rejects(enrichRfafSchedule(page, matches, {
    source: 'https://www.rfaf.es/pnfg/NPcd/NFG_VisCalendario_Vis?codcompeticion=48909139&codgrupo=48909177&codtemporada=22',
    strict: true
  }), /sin correspondencia oficial/);
});
