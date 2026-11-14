import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {editorialProfile} from './verify_production.cjs';
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
 if(!rule.includes('@supports (content-visibility: auto)')||!rule.includes('html[lang="ja"] main > section:not(.hero):not(.press-band) {'))throw Error('Unexpected section-rendering rule');
 const deferred=/html\[lang="ja"\] main > section:not\(\.hero\):not\(\.press-band\) \{\s*content-visibility: auto;\s*contain-intrinsic-block-size: auto 600px;\s*\}/g;
 const matches=[...rule.matchAll(deferred)];
 if(matches.length!==1)throw Error('Unexpected deferred section assignment');
 // The shared stylesheet already defers four sections. Removing the fragment
 // escape too makes the control jump against placeholders, not real geometry.
 // Keep native fragment/focus escapes common; compare only normal deferral.
 return text.slice(0,start)+rule.replace(deferred,'')+text.slice(end);
}
export function assertEditorialSectionPolicy(css){
 const declarations=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/(?:^|[;{])\s*content-visibility\s*:\s*([^;}]+)/gi)];
 if(declarations.some(match=>!/^visible(?:\s*!important)?\s*$/i.test(match[1])))throw Error('Editorial sections must remain visible; deferral is not part of this layout');
}
export function controlDocument(html,name){
 if(name==='index.html'&&editorialProfile(html)){
  if(html.includes(MARKER)||!/<link\b[^>]*href="\/assets\/css\/home-editorial\.css\?v=[a-f0-9]{10}"/.test(html))throw Error('Editorial control must use the reviewed external stylesheet without the legacy deferral rule');
  return html;
 }
 return removeSectionRule(html);
}
export function main(){
 const source=fs.realpathSync(process.argv[2]),destination=path.resolve(process.argv[3]);
 const editorial=editorialProfile(fs.readFileSync(path.join(source,'index.html'),'utf8'));
 if(editorial)assertEditorialSectionPolicy(fs.readFileSync(path.join(source,'assets/css/home-editorial.css'),'utf8'));
 if(fs.existsSync(destination)||destination===source||destination.startsWith(source+path.sep))throw Error('Control destination must be new and outside the candidate');
 fs.cpSync(source,destination,{recursive:true,filter:p=>!p.split(path.sep).includes('.git')});
 for(const name of ['index.html','en/index.html','assets/css/home-hero.css']){
  const file=path.join(destination,name);fs.writeFileSync(file,controlDocument(fs.readFileSync(file,'utf8'),name));
 }
 console.log(editorial ? 'Editorial control is byte-identical: normal-screen deferral comparison is not applicable. Both copies must still pass actual visible-section, fragment, focus, print and unchanged-English checks. The candidate is not modified.' : 'Control has identical content and native fragment/focus escapes, with only the new normal-screen deferral assignment removed. The candidate is not modified.');
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href)main();
