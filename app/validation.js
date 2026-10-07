export function validateMoney(value, label = 'Amount') {
  const text = String(value ?? '').trim();
  if (!text || !/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text) > 9999999999.99) throw new Error(`${label} must be an explicit amount from 0 to 9,999,999,999.99 with at most two decimals.`);
  return Number(text);
}
export function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)!==value) throw new Error('Please enter a valid date.');
  return value;
}
export function validateProperty(data) {
  for (const [field,max] of [['address',120],['city',60],['state',2],['zip',10],['notes',1000],['description',1000],['utilityElectric',80],['utilityGas',80],['utilityWater',80],['utilityNotes',400],['trashSchedule',80],['trashNotes',400]]) {
    if(String(data[field] ?? '').length>max) throw new Error(`${field} is too long (maximum ${max}).`);
  }
  if(!data.address?.trim() || !data.city?.trim() || !/^[A-Za-z]{2}$/.test(data.state || '') || !/^\d{5}(-\d{4})?$/.test(data.zip || '')) throw new Error('Enter an address, city, two-letter state and valid ZIP.');
  if(data.rent!=='' && data.rent!=null) validateMoney(data.rent,'Monthly rent');
  for(const [key,max,integer] of [['beds',20,false],['baths',20,false],['sqft',2147483647,true],['yearBuilt',2100,true]]) {
    const val=data[key]; if(val==='' || val==null) continue;
    const n=Number(val); if(!Number.isFinite(n) || n<0 || n>max || (integer && !Number.isInteger(n)) || (!integer && Math.round(n*10)!==n*10) || (key==='yearBuilt' && n<1800)) throw new Error(`Please enter valid ${key}.`);
  }
  return data;
}
export function assertFileSignature(bytes,type) {
  const a=new Uint8Array(bytes); const text=new TextDecoder().decode(a.slice(0,8));
  const ok=type==='application/pdf'?text.startsWith('%PDF-'):type==='image/jpeg'?a[0]===255&&a[1]===216&&a[2]===255:type==='image/png'?a[0]===137&&text.slice(1,4)==='PNG':type==='image/webp'?text.startsWith('RIFF')&&new TextDecoder().decode(a.slice(8,12))==='WEBP':type==='image/gif'?text.startsWith('GIF8'):false;
  if(!ok) throw new Error('File contents do not match a supported JPEG, PNG, WebP, GIF or PDF. Convert HEIC/HEIF to JPEG if your browser cannot decode it.');
}
