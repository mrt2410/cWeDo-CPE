const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("../helpers.js");

/** A fake Filesystem plugin recording every call, standing in for the
 * native plugin — the real native round-trip (permissions, real device
 * storage) can only be verified on a device, but everything this shim
 * itself does with the plugin's call shapes is covered here. */
function fakeFilesystem(overrides) {
  const calls = [];
  const files = new Map(); // path -> text
  const fs = {
    calls,
    mkdir: async (opts) => { calls.push(['mkdir', opts]); },
    writeFile: async (opts) => { calls.push(['writeFile', opts]); files.set(opts.path, opts.data); return { uri: 'file://' + opts.path }; },
    readFile: async (opts) => { calls.push(['readFile', opts]); if (!files.has(opts.path)) throw new Error('not found'); return { data: files.get(opts.path) }; },
    readdir: async (opts) => {
      calls.push(['readdir', opts]);
      const prefix = opts.path + '/';
      const names = [...files.keys()].filter(p => p.startsWith(prefix)).map(p => p.slice(prefix.length));
      return { files: names.map(name => ({ name, type: 'file' })) };
    },
    deleteFile: async (opts) => { calls.push(['deleteFile', opts]); files.delete(opts.path); },
    _files: files,
  };
  return Object.assign(fs, overrides);
}

const Directory = { Data: 'DATA' };

async function loadShim(t) {
  const dom = await loadApp({});
  t.after(() => dom.window.close());
  return dom.window.createNativeProgramStorage;
}

function plain(x) { return JSON.parse(JSON.stringify(x)); }

test("save() creates the programs dir once and writes the file as utf8", async (t) => {
  const create = await loadShim(t);
  const fs = fakeFilesystem();
  const storage = create(fs, Directory);

  await storage.save('my program.wedo.json', '{"a":1}');
  await storage.save('second.wedo.json', '{"b":2}');

  const mkdirCalls = fs.calls.filter(c => c[0] === 'mkdir');
  assert.equal(mkdirCalls.length, 1, "must only create the directory once");
  assert.deepEqual(plain(mkdirCalls[0][1]), { path: 'programs', directory: 'DATA', recursive: true });

  const writes = fs.calls.filter(c => c[0] === 'writeFile');
  assert.deepEqual(plain(writes[0][1]), { path: 'programs/my program.wedo.json', data: '{"a":1}', directory: 'DATA', encoding: 'utf8' });
});

test("list() returns only .wedo.json files, sorted", async (t) => {
  const create = await loadShim(t);
  const fs = fakeFilesystem();
  const storage = create(fs, Directory);

  await storage.save('b.wedo.json', '{}');
  await storage.save('a.wedo.json', '{}');
  fs._files.set('programs/notes.txt', 'ignore me');

  assert.deepEqual(await storage.list(), ['a.wedo.json', 'b.wedo.json']);
});

test("list() returns an empty array when the directory doesn't exist yet", async (t) => {
  const create = await loadShim(t);
  const fs = fakeFilesystem({ readdir: async () => { throw new Error('ENOENT'); } });
  const storage = create(fs, Directory);

  assert.deepEqual(plain(await storage.list()), []);
});

test("load() reads the file back as utf8 text", async (t) => {
  const create = await loadShim(t);
  const fs = fakeFilesystem();
  const storage = create(fs, Directory);
  await storage.save('prog.wedo.json', '{"stacks":[]}');

  const text = await storage.load('prog.wedo.json');
  assert.equal(text, '{"stacks":[]}');
  const reads = fs.calls.filter(c => c[0] === 'readFile');
  assert.deepEqual(plain(reads[0][1]), { path: 'programs/prog.wedo.json', directory: 'DATA', encoding: 'utf8' });
});

test("remove() deletes the file", async (t) => {
  const create = await loadShim(t);
  const fs = fakeFilesystem();
  const storage = create(fs, Directory);
  await storage.save('prog.wedo.json', '{}');

  await storage.remove('prog.wedo.json');
  assert.deepEqual(plain(await storage.list()), []);
  const deletes = fs.calls.filter(c => c[0] === 'deleteFile');
  assert.deepEqual(plain(deletes[0][1]), { path: 'programs/prog.wedo.json', directory: 'DATA' });
});
