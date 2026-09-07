import {STORAGE_KEY, MAX_IMPORT_BYTES, backup, parseBackup, tagsFromText, filterNotes, mergeNotes, exportEntries, zipBytes} from './core.956223ee98e9.js';
const $ = id => document.getElementById(id);
let notes = [], baseline = null, selected = null, dirty = false, trash = false, storageFailed = false;
try { baseline = localStorage.getItem(STORAGE_KEY); notes = baseline ? parseBackup(baseline) : []; }
catch { storageFailed = true; $('storage-error').hidden = false; $('storage-error').textContent = 'Saved notes could not be read. Editing is paused so existing data is not overwritten. Check your browser storage settings or recover a backup in a separate browser profile.'; }

function status(text, error = false) { $('status').textContent = text; $('status').style.color = error ? '#803a1c' : ''; }
function persist(next) {
  if (storageFailed) throw new Error('Editing is paused because browser storage is unavailable.');
  if (localStorage.getItem(STORAGE_KEY) !== baseline) throw new Error('Notes changed in another tab. Copy any unsaved text, then reload this page before saving.');
  const serialized = backup(next);
  if (new TextEncoder().encode(serialized).length > MAX_IMPORT_BYTES) throw new Error('The 4 MB storage limit was reached. Download a backup before importing more notes.');
  parseBackup(serialized);
  try { localStorage.setItem(STORAGE_KEY, serialized); } catch { throw new Error('Browser storage is full or unavailable. Your edit has not been saved. Copy the text or download a backup.'); }
  notes = next; baseline = serialized;
}
function attempt(action) { try { action(); } catch (error) { status(error.message, true); } }
function discard() { return !dirty || confirm('Discard the unsaved changes in this editor?'); }
function markDirty() { dirty = true; $('save-state').textContent = 'Unsaved changes'; }
function renderList() {
  $('inbox-count').textContent = notes.filter(n => !n.deletedAt).length;
  $('trash-count').textContent = notes.filter(n => n.deletedAt).length;
  $('inbox-tab').setAttribute('aria-pressed', String(!trash)); $('trash-tab').setAttribute('aria-pressed', String(trash));
  const oldTag = $('tag-filter').value;
  $('tag-filter').replaceChildren(new Option('All tags', ''));
  for (const tag of [...new Set(notes.filter(n => Boolean(n.deletedAt) === trash).flatMap(n => n.tags))].sort()) $('tag-filter').add(new Option(tag, tag));
  if ([...$('tag-filter').options].some(o => o.value === oldTag)) $('tag-filter').value = oldTag;
  const shown = filterNotes(notes, {query: $('search').value, tag: $('tag-filter').value, trash});
  $('note-list').replaceChildren();
  for (const note of shown) {
    const button = document.createElement('button'); button.className = 'note-card'; button.setAttribute('aria-current', String(note.id === selected));
    const title = document.createElement('strong'); title.textContent = note.title || 'Untitled';
    const detail = document.createElement('small'); detail.textContent = note.tags.length ? note.tags.join(' · ') : note.body.slice(0, 90);
    button.append(title, detail); button.onclick = () => { if (discard()) openNote(note.id); }; $('note-list').append(button);
  }
  $('list-empty').hidden = shown.length > 0;
  $('list-empty').textContent = $('search').value || $('tag-filter').value ? 'No notes match these filters.' : trash ? 'Trash is empty. Removed notes can be restored here.' : 'Your next idea goes here.';
  $('export-markdown').disabled = !notes.some(n => !n.deletedAt);
  $('export-backup').disabled = storageFailed;
}
function openNote(id) {
  selected = id; dirty = false;
  const note = notes.find(n => n.id === id), deleted = Boolean(note?.deletedAt);
  $('title').value = note?.title || ''; $('body').value = note?.body || ''; $('tags').value = note?.tags.join(', ') || '';
  $('editor-state').textContent = deleted ? 'IN TRASH' : note ? 'SAVED NOTE' : 'NEW NOTE';
  $('note-date').textContent = note ? new Date(note.updatedAt).toLocaleDateString() : '';
  $('save-state').textContent = note ? 'Saved in this browser' : 'Not saved yet';
  for (const id of ['title', 'body', 'tags']) $(id).disabled = deleted || storageFailed;
  $('save-note').hidden = deleted; $('save-note').disabled = storageFailed;
  $('trash-note').hidden = !note || deleted; $('restore-note').hidden = !deleted;
  renderList();
}
for (const id of ['title', 'body', 'tags']) $(id).addEventListener('input', markDirty);
$('note-form').onsubmit = event => { event.preventDefault(); attempt(() => {
  if (!$('body').value.trim()) throw new Error('Write a note before saving.');
  const now = new Date().toISOString(), old = notes.find(n => n.id === selected);
  const note = {id: old?.id || crypto.randomUUID(), title: $('title').value.trim(), body: $('body').value, tags: tagsFromText($('tags').value), createdAt: old?.createdAt || now, updatedAt: now, deletedAt: null};
  persist(old ? notes.map(n => n.id === old.id ? note : n) : [...notes, note]); openNote(note.id); status('Note saved.');
}); };
$('new-note').onclick = () => { if (discard()) { trash = false; openNote(null); $('body').focus(); } };
for (const [id, deleted] of [['trash-note', true], ['restore-note', false]]) $(id).onclick = () => { if (!discard()) return; attempt(() => {
  const now = new Date().toISOString(); persist(notes.map(n => n.id === selected ? {...n, deletedAt: deleted ? now : null, updatedAt: now} : n));
  openNote(null); status(deleted ? 'Note moved to trash. You can restore it from the Trash tab.' : 'Note restored to the inbox.');
}); };
for (const [id, value] of [['inbox-tab', false], ['trash-tab', true]]) $(id).onclick = () => { if (discard()) { trash = value; openNote(null); } };
$('search').oninput = renderList; $('tag-filter').onchange = renderList;
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], {type})), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('export-backup').onclick = () => { download(`memo-inbox-${new Date().toISOString().slice(0, 10)}.json`, backup(notes), 'application/json'); status('Backup downloaded, including trash. Unsaved editor changes are not included.'); };
$('export-markdown').onclick = () => { download('memo-inbox-markdown.zip', zipBytes(exportEntries(notes)), 'application/zip'); status('Markdown downloaded for all saved inbox notes. Trash and unsaved changes are not included.'); };
$('import-text').onclick = () => { if (discard()) $('text-files').click(); };
$('import-backup').onclick = () => { if (discard()) $('backup-file').click(); };
$('backup-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('Choose a backup smaller than 4 MB.');
    const incoming = parseBackup(await file.text());
    const result = mergeNotes(notes, incoming); persist(result.notes); openNote(null);
    status(`Restored ${result.added} notes. Skipped ${result.skipped} identical notes. Kept ${result.conflicts} conflicting notes as separate copies.`);
  } catch (error) { status(error.message, true); }
  event.target.value = '';
};
$('text-files').onchange = async event => {
  const files = [...event.target.files]; if (!files.length) return;
  try {
    if (files.reduce((total, f) => total + f.size, 0) > MAX_IMPORT_BYTES) throw new Error('Select text files totaling less than 4 MB.');
    const incoming = [];
    for (const file of files) {
      if (!/\.(txt|md)$/i.test(file.name)) throw new Error('Only UTF-8 .txt and .md files are supported.');
      const body = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer());
      if (!body.trim()) continue;
      if (body.length > 200000) throw new Error('A text file exceeds 200,000 characters. Nothing was imported.');
      const now = new Date().toISOString();
      incoming.push({id: crypto.randomUUID(), title: file.name.replace(/\.(txt|md)$/i, '').slice(0, 200), body, tags: [], createdAt: now, updatedAt: now, deletedAt: null});
    }
    const merged = mergeNotes(notes, incoming); persist(merged.notes); trash = false; openNote(incoming[0]?.id || null); status(`Imported ${incoming.length} notes. Original files were not changed.`);
  } catch (error) { status(error.message, true); }
  event.target.value = '';
};
$('demo').onclick = () => { if (!discard()) return; attempt(() => {
  const now = new Date().toISOString();
  const examples = [{id:'demo-reading', title:'A line worth keeping', body:'The most useful reading note might be the one you can find again.\n\nWrite one sentence about why this passage matters to you.', tags:['reading']}, {id:'demo-idea', title:'小さなアイデア 🌱', body:'散歩中に浮かんだアイデアを一行で残す。\n\nあとで検索して、育てていく。', tags:['ideas','日本語']}].map(n => ({...n, createdAt:now, updatedAt:now, deletedAt:null}));
  const fresh = examples.filter(n => !notes.some(old => old.id === n.id)); persist([...notes,...fresh]); trash=false; openNote(fresh[0]?.id || null); status(fresh.length ? 'Example notes added. Edit them or move them to trash whenever you like.' : 'Example notes have already been added.');
}); };
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) status('Notes changed in another tab. Copy unsaved text and reload to use the latest version.', true); });
openNote(null);
