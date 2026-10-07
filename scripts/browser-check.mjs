import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const root=path.resolve('.'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');if(url.pathname==='/app/config.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end('window.RENTAL_HOME_CONFIG=null;');return;}let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;fs.mkdirSync('tmp/browser',{recursive:true});const results=[];
async function run(engine,name,options={}){
 const browser=await engine.launch({headless:true,...options});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
 await page.goto(base+'/app/#/sample');await page.locator('.property-card').first().waitFor();assert.equal(await page.locator('.property-card').count(),3);assert.equal(await page.locator('#sampleBanner').isVisible(),true);results.push(`${name}: no-config/CDN-blocked local sample: 3 homes`);
 await page.locator('.property-card').first().click();await page.locator('#tab-tenant').click();await page.getByText('Lease agreement',{exact:true}).waitFor();assert.equal(await page.locator('#tenantForm button[type=submit]:visible').count(),0);results.push(`${name}: read-only detail tabs and lease fixture`);
 await page.locator('#tab-tenant').focus();await page.keyboard.press('ArrowRight');await page.locator('#tab-expenses[aria-selected="true"]').waitFor();results.push(`${name}: keyboard arrow tab navigation`);
 await page.locator('#tab-expenses').click();await page.getByText('Expenses',{exact:true}).last().waitFor();await page.screenshot({path:`tmp/browser/${name}-sample.png`,fullPage:true});
 await page.locator('#exitSampleSignIn').click();await page.locator('#setupView').waitFor({state:'visible'});await page.locator('#setupView [data-action="view-sample"]').click();await page.locator('.property-card').first().waitFor();results.push(`${name}: no-config sample exit/re-entry`);
 if(name==='chromium'){
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;const old=await caches.open('rentmanor-shell-v23');await old.put('/old-shell',new Response('synthetic old shell'));});
 await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.unregister();});await page.reload();await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.includes('rentmanor-shell-v24'));assert.ok(!keys.includes('rentmanor-shell-v23'));results.push('chromium: worker installation removes prior v23 cache');
 await context.setOffline(true);await page.reload();await page.locator('.property-card').first().waitFor();assert.equal(await page.locator('.property-card').count(),3);results.push('chromium: cached shell + local sample starts offline');await context.setOffline(false);await page.reload();await page.locator('.property-card').first().waitFor();results.push('chromium: reconnect recovery');
 }
 assert.deepEqual(errors,[]);results.push(`${name}: zero page JavaScript errors`);
 }finally{await browser.close();}
}
try{await run(chromium,'chromium',process.env.RENTMANOR_CHROMIUM?{executablePath:process.env.RENTMANOR_CHROMIUM}:{});await run(webkit,'webkit',process.env.RENTMANOR_WEBKIT?{executablePath:process.env.RENTMANOR_WEBKIT}:{});console.log(results.join('\n'));fs.writeFileSync('tmp/browser/results.json',JSON.stringify({backend:'blocked: all remote requests aborted; config null',results},null,2));}finally{await new Promise(resolve=>server.close(resolve));}
