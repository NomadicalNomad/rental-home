// Deliberately preserves the historical fresh-install prefix.
import fs from 'node:fs';
const schema='supabase/schema.sql',marker='-- COMPLETE REMEDIATION FORWARD ALIGNMENT';
const base=fs.readFileSync(schema,'utf8').split(marker)[0];
fs.writeFileSync(schema,base+marker+'\n'+fs.readFileSync('supabase/migrations/20261007_complete_remediation.sql','utf8'));
