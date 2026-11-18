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
        { round: 10, date: '2099-11-21', home: 'C. D. OTRO CLUB',
          away: 'A.D. MARIANISTAS C.D.', time: '12:00', ground: 'OTRO CAMPO' }
      ];
    }
  };
  const matches = [
    { round: 10, date: '2099-11-21', home: 'ATLETICO ZABAL',
      away: 'A.D. MARIANISTAS C.D.', time: null, ground: null },
    { round: 10, date: '2099-11-21', home: 'OTRO EQUIPO',
      away: 'A.D. MARIANISTAS C.D.', time: null, ground: null }
  ];
  await enrichRfafSchedule(page, matches, {
    source: 'https://www.rfaf.es/pnfg/NPcd/NFG_VisCalendario_Vis?codcompeticion=48909139&codgrupo=48909177&codtemporada=22'
  });
  assert.equal(matches[0].time, '10:00');
  assert.equal(matches[0].ground, 'VIRGEN DEL CARMEN');
  assert.equal(matches[1].time, null);
  assert.equal(matches[1].ground, null);
});
