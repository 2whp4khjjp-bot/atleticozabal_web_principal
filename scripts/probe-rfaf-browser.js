// Comprueba si una navegación pública de Chromium entrega el calendario RFAF.
// Sin claves, sin cookies importadas y sin publicar el HTML recibido.
const { chromium } = require('playwright');

const base = 'https://www.rfaf.es';
const group = base + '/pnfg/NPcd/NFG_VisGrupos_Vis?cod_primaria=1000123&codcompeticion=48909542&codgrupo=48909586';
const calendar = base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=22&codcompeticion=48909542&codgrupo=48909586&CodJornada=1&CDetalle=1';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
    for (const [name, url] of [['portada', base + '/'], ['grupo', group], ['calendario', calendar]]) {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      console.log(name + ': HTTP ' + response.status() + ', ruta ' + new URL(page.url()).pathname);
    }
    const html = await page.content();
    const matches = (html.match(/ATLETICO ZABAL/gi) || []).length;
    const hasOpponent = /SALESIANOS ALGECIRAS/i.test(html);
    const hasFixture = matches > 0 && hasOpponent && /Jornada\s*1/i.test(html);
    console.log('Calendario: ' + html.length + ' caracteres, Zabal ' + matches +
      ' menciones, rival ' + (hasOpponent ? 'presente' : 'ausente') + '.');
    const samples = await page.evaluate(() => [...document.querySelectorAll('*')]
      .filter(el => el.children.length === 0 && /ATLETICO ZABAL/i.test(el.textContent || '')).slice(0, 2)
      .map(el => {
        const parents = [];
        for (let node = el, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
          parents.push({ tag: node.tagName, css: String(node.className || '').slice(0, 100),
            text: (node.innerText || '').trim().slice(0, 240) });
        }
        return parents;
      }));
    console.log('Estructura de dos partidos (solo texto público): ' + JSON.stringify(samples));
    const rows = await page.evaluate(() => [...document.querySelectorAll('span.font_responsive')]
      .filter(el => /ATLETICO ZABAL/i.test(el.textContent || '')).slice(0, 3)
      .map(el => {
        const row = el.closest('div.row');
        const cells = [...row.querySelectorAll('table td')].map(td => (td.innerText || '').trim());
        return { cells, rowText: (row.innerText || '').trim().slice(0, 320) };
      }));
    console.log('Celdas de tres partidos: ' + JSON.stringify(rows));

    if (!hasFixture) throw new Error('Chromium tampoco obtuvo partidos verificables de RFAF');
    console.log('La sesión anónima del navegador permite leer los partidos.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
