const {test}=require('node:test');
const assert=require('node:assert/strict');
const {detailsFromSnapshot,snapshotActa}=require('../scripts/read-rfaf-acta-score');
const match={round:2,date:'2026-10-16',home:'ATUNARA ATLETICO C.D. "B"',away:'HISTORICO RECREATIVO LINENSE CLUB DE FÚTBOL "A"'};
const snapshot=()=>({meta:'Temporada 2026-2027 Jornada 2 16-10-2026 19:45 h',ground:'VIRGEN DEL CARMEN',tables:[{rows:[['ATUNARA ATLETICO C.D. B','','HISTORICO RECREATIVO LINENSE CLUB DE FÚTBOL A'],['','2 - 5','']],scores:[[2,5]]},{rows:[['0 - 1',"20'"],['2 - 4',"73'"]],scores:[[0,1],[2,4]]}]});
test('encuentra el resultado en otra fila, sin confundir goles parciales',()=>assert.deepEqual(detailsFromSnapshot(snapshot(),match),{score:[2,5],ground:'VIRGEN DEL CARMEN'}));
test('rechaza otro partido, otra jornada, otra fecha y marcadores ambiguos',()=>{for(const m of [{...match,home:'OTRO EQUIPO'},{...match,round:3},{...match,date:'2026-10-17'}])assert.equal(detailsFromSnapshot(snapshot(),m),null);let s=snapshot();s.tables[0].scores.push([3,5]);assert.equal(detailsFromSnapshot(s,match),null);});
test('descarta marcadores que contradicen los goles del acta',()=>{
 let s=snapshot();s.goalCount=6;s.tables[0].scores=[[31,3]];
 assert.equal(detailsFromSnapshot(s,match),null);
 s.goalCount=10;s.tables[0].scores=[[0,5]];
 assert.equal(detailsFromSnapshot(s,match),null);
 s.tables[0].scores=[[0,10]];
 assert.deepEqual(detailsFromSnapshot(s,match).score,[0,10]);
});
test('conserva un 0-0 oficial',()=>{let s=snapshot();s.tables[0].scores=[[0,0]];assert.deepEqual(detailsFromSnapshot(s,match).score,[0,0]);});
test('lee clases de dígitos resueltos y descarta scripts señuelo, también con dos cifras',()=>{
 const text=t=>({nodeType:3,textContent:t});const digit=d=>({tagName:'I',id:'id'+d,classList:['fa-'+d],childNodes:[]});
 const score={childNodes:[digit(1),digit(2),text(' - '),{tagName:'SCRIPT',childNodes:[text('99-99')]},digit(5)],closest:()=>table};
 const row={cells:[{innerText:'LOCAL'},{innerText:''},{innerText:'VISITANTE'}],closest:()=>table};
 const table={rows:[row],querySelectorAll:()=>[score]};
 global.document={querySelectorAll:s=>s==='table'?[table]:s==='.details'?[]:[{innerText:'Jornada 1'}],querySelector:()=>null};
 try{assert.deepEqual(snapshotActa().tables[0].scores,[[12,5]])}finally{delete global.document}
});
test('el equipo entra en los reintentos dinámicos cuando falta marcador y sale al completarse',()=>{
 const vm=require('node:vm'),fs=require('node:fs');const source=fs.readFileSync(require.resolve('../scripts/detect-result-refresh'),'utf8');
 const feed='data/alevin-atunara-mariano-rfaf.json';
 function plan(score){let output='';const context={require:()=>({existsSync:p=>p===feed,readFileSync:()=>JSON.stringify({matches:[{...match,time:'19:45',actaUrl:'https://www.rfaf.es/acta',score}]})}),process:{env:{DYNAMIC_RESULTS_NOW:'2026-10-18T15:00:00Z'},stdout:{write:s=>output=s}},Intl,Date};vm.runInNewContext(source,context);return JSON.parse(output);}
 assert.equal(plan(null)[0].team,'alevin-atunara-mariano');assert.equal(plan([2,5]).length,0);
});

test('un marcador nuevo verificado reemplaza el antiguo aunque el anterior tuviera fuente acta',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {mergeStoredScores}=require('../scripts/preserve-rfaf-scores');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rfaf-score-'));
 const file=path.join(dir,'feed.json');
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
 const old={round:3,date,time:'17:20',home:'ATLETICO ZABAL B',away:'HISTORICO RECREATIVO LINENSE A',score:[31,3],scoreSource:'acta: https://www.rfaf.es/acta'};
 try{
  fs.writeFileSync(file,JSON.stringify({matches:[old]}));
  const fresh={...old,score:[3,3],scoreSource:'acta: https://www.rfaf.es/acta'};
  mergeStoredScores(file,[fresh]);
  assert.deepEqual(fresh.score,[3,3]);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
