const fs=require('node:fs');const {chromium}=require('playwright');const {enrichRfafSchedule}=require('./rfaf-actas');const {spawnSync}=require('node:child_process');
const files=fs.readdirSync('data').filter(n=>/-rfaf\.json$/.test(n));
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
(async()=>{const browser=await chromium.launch({headless:true});let count=0;try{
for(const name of files){const path='data/'+name,data=JSON.parse(fs.readFileSync(path,'utf8'));if(!data.source?.includes('rfaf.es'))continue;
const pending=(data.matches||[]).filter(m=>m.date>=today&&m.date<=new Date(Date.now()+21*86400000).toISOString().slice(0,10)&&!m.time);
if(!pending.length)continue;const page=await browser.newPage({locale:'es-ES',timezoneId:'Europe/Madrid'});try{
await enrichRfafSchedule(page,pending,{source:data.source,base:'https://www.rfaf.es'});const found=pending.filter(m=>m.time).length;
if(found){data.updatedAt=new Date().toISOString();fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');count+=found}
console.log(name+': recuperados '+found+'/'+pending.length+' horarios');
}catch(e){console.warn(name+': '+e.message)}finally{await page.close()}
}
}finally{await browser.close()}
const renders=[...new Set(fs.readdirSync('scripts').filter(n=>/^render-.*-ics\.js$/.test(n)))];
for(const name of renders){const r=spawnSync(process.execPath,['scripts/'+name],{encoding:'utf8'});if(r.status!==0)console.warn(name+': '+(r.stderr||'error'))}
console.log('Total horarios incorporados: '+count);
})().catch(e=>{console.error(e);process.exitCode=1});
