export const STORAGE_KEY = 'memo-inbox-v1';
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const MAX_NOTES = 5000;
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function parseBackup(text) {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('This backup is larger than 4 MB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (data?.format !== 'memo-inbox' || data.version !== 1 || !Array.isArray(data.notes))
    throw new Error('Choose a Memo Inbox version 1 backup.');
  if (data.notes.length > MAX_NOTES) throw new Error('A backup can contain at most 5,000 notes.');
  const ids = new Set();
  const notes = data.notes.map(note => {
    if (!note || typeof note.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(note.id) || ids.has(note.id) ||
        typeof note.title !== 'string' || note.title.length > 200 || typeof note.body !== 'string' || note.body.length > 200000 ||
        !Array.isArray(note.tags) || note.tags.length > 30 || note.tags.some(t => typeof t !== 'string' || t.length > 50) ||
        !validDate(note.createdAt) || !validDate(note.updatedAt) ||
        !(note.deletedAt === null || validDate(note.deletedAt))) throw new Error('This backup contains an invalid or duplicate note. Nothing was imported.');
    ids.add(note.id);
    return {id: note.id, title: note.title, body: note.body, tags: [...note.tags], createdAt: note.createdAt, updatedAt: note.updatedAt, deletedAt: note.deletedAt};
  });
  return notes;
}

export function backup(notes) {
  return JSON.stringify({format: 'memo-inbox', version: 1, notes}, null, 2);
}

export function tagsFromText(text) {
  const tags = [...new Set(text.split(/[,、]/).map(t => t.trim()).filter(Boolean))];
  if (tags.length > 30 || tags.some(t => t.length > 50)) throw new Error('Use up to 30 tags, each at most 50 characters.');
  return tags;
}

export function filterNotes(notes, {query = '', tag = '', trash = false} = {}) {
  const q = query.normalize('NFKC').toLocaleLowerCase().trim();
  return notes.filter(n => Boolean(n.deletedAt) === trash && (!tag || n.tags.includes(tag)) &&
    (!q || [n.title, n.body, ...n.tags].join('\n').normalize('NFKC').toLocaleLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export function mergeNotes(existing, incoming, makeId = () => crypto.randomUUID()) {
  const result = existing.map(n => ({...n, tags: [...n.tags]}));
  const byId = new Map(result.map(n => [n.id, n]));
  let added = 0, skipped = 0, conflicts = 0;
  for (const note of incoming) {
    const previous = byId.get(note.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(note)) { skipped++; continue; }
    let id = note.id;
    if (previous) {
      conflicts++;
      do { id = makeId(); } while (byId.has(id));
    }
    const copy = {...note, id, tags: [...note.tags]};
    result.push(copy); byId.set(id, copy); added++;
  }
  if (result.length > MAX_NOTES) throw new Error('Import would exceed 5,000 notes. Nothing was imported.');
  return {notes: result, added, skipped, conflicts};
}

export function markdown(note) {
  return `---\ntitle: ${JSON.stringify(note.title || 'Untitled')}\ncreated: ${JSON.stringify(note.createdAt)}\nupdated: ${JSON.stringify(note.updatedAt)}\ntags: ${JSON.stringify(note.tags)}\n---\n\n${note.body}\n`;
}

export function exportEntries(notes) {
  return notes.filter(n => !n.deletedAt).map((n, i) => {
    const title = (n.title || 'Untitled').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 60) || 'Untitled';
    return {name: `${String(i + 1).padStart(4, '0')}-${title}.md`, text: markdown(n)};
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP's stored method needs no compressor or third-party runtime.
export function zipBytes(entries) {
  const encoder = new TextEncoder(), parts = [], central = [];
  let offset = 0, centralSize = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name), data = encoder.encode(entry.text), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true); l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, name.length, true);
    local.set(name, 30);
    const directory = new Uint8Array(46 + name.length), c = new DataView(directory.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); directory.set(name, 46);
    parts.push(local, data); central.push(directory); offset += local.length + data.length; centralSize += directory.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...parts, ...central, end]) { output.set(part, cursor); cursor += part.length; }
  return output;
}
