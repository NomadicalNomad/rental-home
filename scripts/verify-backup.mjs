// Offline inspection only: never connects to an account or changes an archive.
import fs from 'node:fs';
import {validateArchive,MAX_ARCHIVE_BYTES,TABLES} from '../app/recovery.js';
const file=process.argv[2];
if(!file)throw new Error('Usage: node scripts/verify-backup.mjs <private-backup.json>');
if(fs.statSync(file).size>MAX_ARCHIVE_BYTES)throw new Error('Archive exceeds 100 MiB');
const archive=JSON.parse(fs.readFileSync(file,'utf8'));
await validateArchive(archive);
console.log(JSON.stringify({valid:true,version:archive.version,records:Object.fromEntries(TABLES.map(t=>[t,archive.tables[t].length])),files:archive.files.length},null,2));
