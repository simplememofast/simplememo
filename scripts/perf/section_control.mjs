import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const MARKER='/* Progressive enhancement only: native search, focus and print keep full content. */';
export function removeSectionRule(text){
 const start=text.indexOf(MARKER);
 if(start<0||text.indexOf(MARKER,start+1)>=0)throw Error('Expected exactly one section-rendering rule');
 const open=text.indexOf('{',start);let depth=0,end=-1;
 for(let i=open;i<text.length;i++){
  if(text[i]==='{')depth++;
  if(text[i]==='}'&&--depth===0){end=i+1;break;}
 }
 if(open<0||end<0)throw Error('Unbalanced section-rendering rule');
 const rule=text.slice(start,end);
 if(!rule.includes('@supports (content-visibility: auto)')||!rule.includes('html[lang="ja"] main > section:not(.hero):not(.press-band)'))throw Error('Unexpected section-rendering rule');
 return text.slice(0,start)+text.slice(end);
}
export function main(){
 const source=fs.realpathSync(process.argv[2]),destination=path.resolve(process.argv[3]);
 if(fs.existsSync(destination)||destination===source||destination.startsWith(source+path.sep))throw Error('Control destination must be new and outside the candidate');
 fs.cpSync(source,destination,{recursive:true,filter:p=>!p.split(path.sep).includes('.git')});
 for(const name of ['index.html','en/index.html','assets/css/home-hero.css']){
  const file=path.join(destination,name);fs.writeFileSync(file,removeSectionRule(fs.readFileSync(file,'utf8')));
 }
 console.log('Control has identical candidate content, with only the new screen-only section rendering rule removed. The candidate is not modified.');
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href)main();
