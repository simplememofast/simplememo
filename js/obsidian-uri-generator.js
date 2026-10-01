(function(root){'use strict';if(!root||!root.document)return;
const doc=root.document,form=doc.getElementById('uri-tool'),get=id=>doc.getElementById(id);let data=null;
const enc=v=>encodeURIComponent(v).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
function parse(uri){try{const u=new URL(uri);if(u.protocol!=='obsidian:'||u.hash)return null;const p={};for(const[k,v]of u.searchParams){if(k in p)return null;p[k]=v}return{action:u.hostname,params:p}}catch(e){return null}}
function key(uri){const x=parse(uri);return x?x.action+'|'+JSON.stringify(Object.keys(x.params).sort().map(k=>[k,x.params[k]])):null}
function matches(uri){const k=key(uri);return k&&data?data.observations.filter(x=>key(x.uri)===k):[]}
function fromForm(f,legacy){get('input-errors').replaceChildren();const mode=get('mode').value,a=f.elements.action.value;let extended=mode==='extended';if(['unique','search','choose-vault'].includes(a)&&!extended){get('mode').value='extended';extended=true}get('extended-fields').hidden=!extended;
const base={action:a,vault:f.elements.vault.value,file:f.elements.file.value,content:a==='open'?'':f.elements.content.value,append:a!=='open'&&a!=='daily'&&f.elements.append.checked,silent:a!=='open'&&f.elements.silent.checked};
if(!extended){get('append-row').hidden=a==='open'||a==='daily';f.elements.vault.required=true;return legacy(base)}
const p={},errs=[],target=get('target-mode').value;get('file-row').hidden=!(['new','open'].includes(a)&&target==='file');get('append-row').hidden=true;get('silent-row').hidden=!['new','daily'].includes(a);get('content-row').hidden=!['new','daily','unique'].includes(a);f.elements.file.required=false;f.elements.vault.required=a!=='choose-vault'&&!(a==='open'&&target==='path');
const need=(v,label)=>{if(!v.trim())errs.push(label+'を入力してください。');return v};const control=(v,label)=>{if(/[\u0000-\u001f\u007f]/.test(v))errs.push(label+'に制御文字は使えません。')};
if(a!=='choose-vault'&&!(a==='open'&&target==='path')){p.vault=need(f.elements.vault.value,'Vault名');control(p.vault,'Vault名')}
if(a==='open'){if(target==='path'){p.path=need(get('path').value,'絶対パス');if(!p.path.startsWith('/'))errs.push('絶対Linuxパスは / から入力してください。');control(p.path,'絶対パス')}else if(target==='file')p.file=need(f.elements.file.value,'相対パス')}
if(a==='new'){if(!['file','name'].includes(target))errs.push('newは相対パスかノート名を選んでください。');else{p[target]=need(target==='file'?f.elements.file.value:get('name').value,'新規対象');control(p[target],'新規対象');if(target==='name'&&/[\/\\]/.test(p.name))errs.push('ノート名に / や \\ は使えません。')}if(get('behavior').value!=='create')p[get('behavior').value]='true'}
if(p.file!==undefined){if(p.file.startsWith('/')||/^[A-Za-z]:/.test(p.file)||p.file.split('/').some(x=>x==='.'||x==='..'))errs.push('Vaultからの相対パスを入力してください。');if(p.file.includes('#'))errs.push('#の位置指定は専用欄へ入力してください。');control(p.file,'相対パス');if(a==='open'&&get('anchor-mode').value!=='none'){const v=need(get('anchor').value,'位置');if(get('anchor-mode').value==='block'&&!/^[A-Za-z0-9-]+$/.test(v))errs.push('ブロックIDは英数字とハイフンだけです。');control(v,'位置');p.file+='#'+(get('anchor-mode').value==='block'?'^':'')+v}}
if(['new','daily','unique'].includes(a)){if(get('use-clipboard').checked){p.clipboard='true';if(f.elements.content.value!=='')errs.push('clipboardと本文を同時に指定しないでください。')}else if(f.elements.content.value!=='')p.content=f.elements.content.value}
if(['open','new','daily','unique'].includes(a)&&get('pane').value)p.paneType=get('pane').value;
if(['new','daily'].includes(a)&&f.elements.silent.checked)p.silent='true';if(a==='search'&&get('query').value!=='')p.query=get('query').value;
if(!data||!data.whitelist[a])errs.push('固定参照データの読み込みを確認してください。');else for(const k of Object.keys(p))if(!data.whitelist[a].includes(k))errs.push('未対応パラメータ: '+k);
if(errs.length){for(const e of errs){const li=doc.createElement('li');li.textContent=e;get('input-errors').append(li)}throw Error('Invalid enriched input')}
const uri='obsidian://'+a+(Object.keys(p).length?'?'+Object.entries(p).map(([k,v])=>enc(k)+'='+enc(v)).join('&'):'');const d=parse(uri);if(!d||Object.entries(p).some(([k,v])=>d.params[k]!==v))throw Error('Decode mismatch');return uri;
}
function draw(uri){get('fixed-results').replaceChildren();get('decoded-params').textContent='';if(!uri){get('syntax-status').textContent='構文確認: 入力を修正してください。固定結果は表示しません。';return}get('syntax-status').textContent='構文確認: queryの値を読み戻せます。任意の入力の実機成功は確認していません。';get('decoded-params').textContent=JSON.stringify(parse(uri),null,2);const ms=matches(uri),lead=doc.createElement('p');lead.textContent=ms.length?'Linux固定入力と完全一致する元記録 '+ms.length+'件。初回失敗と別計画の保存は区別します。':'この入力値の固定観測はありません。構文のみの確認です。裸のappend/silentはtrue付き測定とは一致しません。';get('fixed-results').append(lead);for(const x of ms){const p=doc.createElement('p');p.dataset.observation=x.ref;p.textContent=x.ref+' — '+x.title;get('fixed-results').append(p)}}
root.ObsidianURIRefresh={fromForm,draw,parse,matches,encode:enc};
get('load-example').addEventListener('click',()=>{if(!data)return;const x=data.observations.find(x=>x.ref===get('example').value);if(!x)return;form.reset();get('mode').value='extended';get('example').value=x.ref;form.elements.action.value=x.action;const p=Object.fromEntries(Object.entries(x.decoded_params).map(([k,v])=>[k,v[0]]));form.elements.vault.value=p.vault||'';form.elements.file.value=p.file||'';get('name').value=p.name||'';get('path').value=p.path||'';get('target-mode').value=p.name!==undefined?'name':p.path!==undefined?'path':p.file!==undefined?'file':'vault';get('anchor-mode').value='none';get('anchor').value='';if(x.action==='open'&&p.file&&p.file.includes('#')){let i=p.file.indexOf('#'),v=p.file.slice(i+1);form.elements.file.value=p.file.slice(0,i);get('anchor-mode').value=v.startsWith('^')?'block':'heading';get('anchor').value=v.replace(/^\^/,'')}form.elements.content.value=p.content||'';form.elements.append.checked=false;form.elements.silent.checked=p.silent==='true';get('use-clipboard').checked=p.clipboard==='true';get('behavior').value=p.append==='true'?'append':p.overwrite==='true'?'overwrite':'create';get('pane').value=p.paneType||'';get('query').value=p.query||'';form.dispatchEvent(new Event('input',{bubbles:true}))});
get('reset-tool').addEventListener('click',()=>{form.reset();get('example').value='';form.dispatchEvent(new Event('input',{bubbles:true}));form.elements.action.focus()});
fetch('/assets/data/obsidian-uri-generator-fixed-results.json',{credentials:'omit'}).then(r=>{if(!r.ok)throw Error('Reference');return r.json()}).then(d=>{if(d.observations.length!==58)throw Error('Reference58');data=d;form.dataset.referenceReady='true';form.dispatchEvent(new Event('input',{bubbles:true}))}).catch(()=>{form.dataset.referenceReady='error';get('syntax-status').textContent='固定参照データを読めません。固定結果を確認できません。'});
})(typeof window==='undefined'?null:window);

(function (root) {
  'use strict';

  function encode(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, function (character) {
      return '%' + character.charCodeAt(0).toString(16).toUpperCase();
    });
  }

  function buildUri(input) {
    var action = input.action;
    if (action !== 'new' && action !== 'daily' && action !== 'open') {
      throw new Error('Unsupported action');
    }
    var vault = String(input.vault || '').trim();
    var file = String(input.file || '').trim();
    var content = String(input.content || '');
    if (!vault) throw new Error('Vault name is required');
    if (action !== 'daily' && !file) throw new Error('Note path is required');
    if (action === 'open' && content) throw new Error('Open does not add content');

    var parameters = [['vault', vault]];
    if (action !== 'daily') parameters.push(['file', file]);
    if (action !== 'open' && content) parameters.push(['content', content]);
    if (action !== 'open' && input.append) parameters.push(['append', null]);
    if (action !== 'open' && input.silent) parameters.push(['silent', null]);

    return 'obsidian://' + action + '?' + parameters.map(function (entry) {
      return encode(entry[0]) + (entry[1] === null ? '' : '=' + encode(entry[1]));
    }).join('&');
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { buildUri: buildUri };
  if (!root || !root.document) return;

  var form = root.document.getElementById('uri-tool');
  if (!form) return;
  var output = root.document.getElementById('uri-output');
  var status = root.document.getElementById('uri-status');
  var contentLabel = root.document.getElementById('content-label');
  var fileRow = root.document.getElementById('file-row');
  var contentRow = root.document.getElementById('content-row');
  var appendRow = root.document.getElementById('append-row');
  var silentRow = root.document.getElementById('silent-row');

  function update() {
    var action = form.elements.action.value;
    var opensExisting = action === 'open';
    fileRow.hidden = action === 'daily';
    contentRow.hidden = opensExisting;
    appendRow.hidden = opensExisting;
    silentRow.hidden = opensExisting;
    form.elements.file.required = action !== 'daily';
    contentLabel.textContent = action === 'daily' ? '日次ノートに入れる本文（任意）' : '本文（任意）';

    try {
      var uri = root.ObsidianURIRefresh.fromForm(form, buildUri);
      output.value = uri;
      status.textContent = uri.length > 1800 ? 'URLが長くなっています。長文が渡るかは端末・アプリで確認してください。' : '';
      root.ObsidianURIRefresh.draw(uri);
      return uri;
    } catch (_) {
      output.value = '';
      root.ObsidianURIRefresh.draw(null);
      status.textContent = action === 'daily' ? '保管庫名を入力してください。' : '保管庫名とノートのパスを入力してください。';
      return null;
    }
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', function (event) { event.preventDefault(); });
  root.document.getElementById('copy-uri').addEventListener('click', async function () {
    var uri = update();
    if (!uri) {
      form.reportValidity();
      return;
    }
    try {
      if (!root.navigator.clipboard) throw new Error('Clipboard unavailable');
      await root.navigator.clipboard.writeText(uri);
      status.textContent = 'URIをコピーしました。本文を入れた場合、このURLの共有先にも本文が見えます。';
    } catch (_) {
      output.focus();
      output.select();
      status.textContent = '自動コピーが使えません。選択したURIをブラウザのコピー操作で取得してください。';
    }
  });
  update();
})(typeof window === 'undefined' ? null : window);
