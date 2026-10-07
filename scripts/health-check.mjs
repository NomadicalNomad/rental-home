// Read-only static health check. No credentials or backend access.
import fs from 'node:fs';import crypto from 'node:crypto';
const url=process.argv[2];if(!url)throw new Error('Usage: node scripts/health-check.mjs https://app.rentmanor.com/');
const base=new URL(url);if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('HTTPS required');
for(const file of ['index.html','app.js','auth.js','sw.js','manifest.json']){
 const response=await fetch(new URL(file,base));if(!response.ok)throw new Error(`${file}: HTTP ${response.status}`);
 const served=new Uint8Array(await response.arrayBuffer()),local=fs.readFileSync('app/'+file);const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
 console.log(`${file}: 200; local match=${hash(served)===hash(local)}; served SHA256=${hash(served)}`);
}
