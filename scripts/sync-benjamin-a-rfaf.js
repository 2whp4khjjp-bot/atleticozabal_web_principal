// Prueba de lectura pública: no utiliza credenciales ni guarda cookies.
const fs = require('node:fs');
const base = 'https://www.rfaf.es';
const calendar = base + '/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=22&codcompeticion=48909542&codgrupo=48909586&CodJornada=1&CDetalle=1';
const cookies = new Map();
const headers = {
  'user-agent': 'AtleticoZabalCalendar/1.0 (https://www.atleticozabal.com)',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'es-ES,es;q=0.9'
};

async function get(path) {
  let url = new URL(path, base);
  for (let redirects = 0; redirects < 5; redirects++) {
    const cookie = [...cookies].map(([name, value]) => name + '=' + value).join('; ');
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { ...headers, ...(cookie ? { cookie } : {}) }
    });
    for (const entry of response.headers.getSetCookie()) {
      const first = entry.split(';', 1)[0];
      const separator = first.indexOf('=');
      if (separator > 0) cookies.set(first.slice(0, separator), first.slice(separator + 1));
    }
    if (response.status >= 300 && response.status < 400) {
      const next = new URL(response.headers.get('location') || '/', url);
      if (next.origin !== base) throw new Error('Redirección fuera de la RFAF');
      if (next.pathname.includes('/NLogin')) throw new Error('RFAF exige una sesión adicional');
      url = next;
      continue;
    }
    const html = await response.text();
    console.log(url.pathname + ': HTTP ' + response.status + ', ' + html.length + ' caracteres');
    return { response, html, url };
  }
  throw new Error('Demasiadas redirecciones de la RFAF');
}

(async () => {
  await get('/');
  await get('/pnfg/');
  const { response, html, url } = await get(calendar);
  if (!response.ok || url.pathname.includes('/NLogin') ||
      !/ATLETICO ZABAL/i.test(html) || !/SALESIANOS ALGECIRAS/i.test(html) ||
      !/Jornada\s*1/i.test(html) || html.length < 10000) {
    throw new Error('La sesión pública no devuelve los partidos: no se publican cambios');
  }
  const status = { source: calendar, updatedAt: new Date().toISOString(),
    verified: true, bytes: html.length };
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/benjamin-a-rfaf-status.json', JSON.stringify(status, null, 2) + '\n');
  console.log('Lectura de calendario verificada; resultados todavía no sincronizados.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
