// Hochwertige Aufnahmen: groesserer Rahmen, laengere Laufzeit, damit spaeter
// ein sauberer Ausschnitt gewaehlt werden kann.
const { chromium } = require('@playwright/test');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp',
  '.svg':'image/svg+xml','.woff2':'font/woff2','.wasm':'application/wasm','.mp3':'audio/mpeg','.ogg':'audio/ogg' };
function serve(root){
  return new Promise(r=>{ const s=http.createServer((rq,rp)=>{
    let u=decodeURIComponent(rq.url.split('?')[0]); if(u==='/')u='/index.html';
    const f=path.join(root,u);
    if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){rp.writeHead(404);return rp.end();}
    rp.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});
    fs.createReadStream(f).pipe(rp); });
    s.listen(0,'127.0.0.1',()=>r({srv:s,port:s.address().port})); });
}
const OUT='C:/Users/KaiFe/AppData/Local/Temp/claude/e--Coding-benchmarks-benchmark-securesight-ai/ee9c8bad-bbcf-4a4d-8ae5-f771bcee74cd/scratchpad/hq/';
fs.mkdirSync(OUT,{recursive:true});
const W=1280,H=800;

const JOBS=[
  ['clair-q38','E:/Coding/benchmarks/Clair Obscure Qwen 3.8 27b','clair'],
  ['clair-q36','E:/Coding/benchmarks/Clair Obscure Qwen 3.6 27b','clair'],
  ['moor-q36q6','E:/Coding/benchmarks/Moorhuhn Qwen 3.6 27b Q6/dist','canvas'],
  ['moor-sonnet','E:/Coding/benchmarks/Moorhuhn Sonnet 5/dist','menu'],
];

(async()=>{
 for(const [id,dir,mode] of JOBS){
  if(!fs.existsSync(dir)){ console.log(id,'fehlt'); continue; }
  const {srv,port}=await serve(dir);
  const b=await chromium.launch({channel:'msedge',
    args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--mute-audio',
          '--force-device-scale-factor=1','--disable-lcd-text']});
  const ctx=await b.newContext({viewport:{width:W,height:H},deviceScaleFactor:1,
    recordVideo:{dir:OUT+id,size:{width:W,height:H}}});
  const p=await ctx.newPage();
  try{
    await p.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle',timeout:25000});
    await p.waitForTimeout(4000);

    if(mode==='menu'){
      for(const w of ['Spielen','Spiel starten','Start']){
        const e=p.locator('button:has-text("'+w+'")').first();
        if(await e.count()){ await e.click().catch(()=>{}); break; }
      }
      await p.waitForTimeout(1400);
      for(const w of ['Classic Hunt','Classic']){
        const e=p.locator(':is(button,div,li,[class*=card]):has-text("'+w+'")').first();
        if(await e.count()){ await e.click().catch(()=>{}); break; }
      }
      await p.waitForTimeout(1200);
      for(const w of ['Nebelmoor']){
        const e=p.locator(':is(button,div,li,[class*=card]):has-text("'+w+'")').first();
        if(await e.count()){ await e.click().catch(()=>{}); break; }
      }
      await p.waitForTimeout(900);
      for(const w of ['Runde starten','Starten']){
        const e=p.locator('button:has-text("'+w+'")').first();
        if(await e.count()){ await e.click().catch(()=>{}); break; }
      }
      await p.waitForTimeout(3000);
    } else if(mode==='canvas'){
      for(let k=0;k<10;k++){ await p.mouse.click(W/2, 300+k*30); await p.waitForTimeout(500); }
      await p.waitForTimeout(2000);
    } else {
      for(let k=0;k<10;k++){
        await p.keyboard.press('Space').catch(()=>{});
        await p.mouse.click(W/2, H/2);
        await p.waitForTimeout(600);
      }
      await p.waitForTimeout(1500);
    }

    // 32 Sekunden Material, damit ein sauberer Ausschnitt uebrig bleibt
    const t0=Date.now(); let i=0;
    while(Date.now()-t0 < 32000){
      if(mode==='clair'){
        await p.keyboard.press(['KeyW','Space','KeyJ','KeyD','KeyE','KeyA','KeyL','KeyS'][i%8]).catch(()=>{});
        await p.mouse.move(W/2+((i*67)%360)-180, H/2+((i*41)%180)-90,{steps:8});
        if(i%3===0){ await p.mouse.down(); await p.mouse.up(); }
        await p.waitForTimeout(360);
      } else {
        const x=140+((i*191)%(W-280)), y=140+((i*113)%(H-320));
        await p.mouse.move(x,y,{steps:7});
        await p.mouse.down(); await p.mouse.up();
        await p.waitForTimeout(300);
      }
      i++;
    }
  }catch(e){ console.log(id,'FEHLER',e.message.slice(0,70)); }
  await ctx.close(); await b.close(); srv.close();
  const f=fs.readdirSync(OUT+id).find(x=>x.endsWith('.webm'));
  if(f){ fs.renameSync(OUT+id+'/'+f, OUT+id+'.webm'); fs.rmSync(OUT+id,{recursive:true}); }
  console.log(id,'|', f?(fs.statSync(OUT+id+'.webm').size/1024/1024).toFixed(1)+' MB':'kein Video');
 }
})();
