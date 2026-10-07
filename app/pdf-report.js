import {PDFDocument,rgb} from './vendor/pdf-lib.js';
import fontkit from './vendor/fontkit.js';
export async function createExpensePdf({address,list=[],exportedAt=new Date(),fontBytes}) {
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 if(!fontBytes){const response=await fetch(new URL('./fonts/NotoSans-Regular.ttf',import.meta.url));if(!response.ok)throw new Error('Report font unavailable; reconnect or use CSV.');fontBytes=await response.arrayBuffer();}
 const font=await doc.embedFont(fontBytes,{subset:true}),chars=new Set(font.getCharacterSet());
 const check=text=>{for(const c of text){if(!['\n','\r','\t'].includes(c)&&!chars.has(c.codePointAt(0)))throw new Error('This report contains characters unsupported by the installed Noto Sans font. Use CSV to preserve all text.');}return text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ');};
 const width=516,size=10,leading=15;let page,y=0,pageNumber=0;
 function text(value,x=48){page.drawText(check(String(value)),{x,y,font,size,color:rgb(.08,.12,.12)});}
 function newPage(){page=doc.addPage([612,792]);pageNumber++;y=748;text('RentManor - Expense report');y-=leading;for(const line of wrap(address || 'Property')){text(line);y-=leading;}text(`Exported ${new Date(exportedAt).toISOString().slice(0,10)} - Page ${pageNumber}`);y-=24;text('Date / Category / Amount');y-=leading;}
 function wrap(value){const lines=[];for(const paragraph of check(String(value??'')).split('\n')){let line='';for(const character of paragraph){if(line && font.widthOfTextAtSize(line+character,size)>width){lines.push(line);line='';}line+=character;}lines.push(line);}return lines;}
 function writeLine(line){if(y<64)newPage();text(line);y-=leading;}
 newPage();let total=0;
 for(const item of list){total+=Number(item.amount)||0;for(const line of wrap(`${item.spentOn||''} / ${item.category||'Other'} / $${Number(item.amount).toFixed(2)}`))writeLine(line);for(const line of wrap(item.notes))writeLine(line);writeLine('');}
 writeLine(`Total: ${list.length} expenses / $${total.toFixed(2)}`);
 return doc.save();
}
