// Publish only reviewed static surfaces, never backups, SQL, tests or dependencies.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('.'),out=path.join(root,'dist');
if(out!==path.resolve(root,'dist'))throw new Error('Invalid build destination');
fs.mkdirSync(out,{recursive:true});
for(const dir of ['app','site'])fs.cpSync(dir,path.join(out,dir),{recursive:true,filter:source=>!/(?:config\.local\.js|config\.example\.js|\.env(?:\..*)?)$/.test(source)});
for(const file of ['index.html','_redirects'])if(fs.existsSync(file))fs.copyFileSync(file,path.join(out,file));
console.log('Static app/site copied to dist. No customer records or recovery archives included.');
