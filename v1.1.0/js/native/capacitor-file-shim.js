/* ================= Native program storage for the packaged Android app =================
   "Save As" downloads a Blob via <a download> (see downloadText() in
   js/app.js) — a mechanism plain Android WebView (what Capacitor wraps) has
   no handler for at all, so the click silently does nothing and no file is
   ever written. "Open" already uses the OS file picker, which works fine in
   the packaged app; it simply never had anything new to find.

   This file replaces the write side, only inside the packaged app
   (self-activation check at the bottom — false, so a no-op, in every normal
   browser, same pattern as js/ble/capacitor-ble-shim.js), using
   @capacitor/filesystem to write into the app's own private storage
   (Directory.Data — no permission prompt on any Android version, survives
   app updates, cleared on uninstall). Because that storage isn't visible to
   the OS file picker, the read ("Open") side becomes a small in-app list
   instead — see js/app.js's openbtn handler and the #openlist modal. */

const NATIVE_PROGRAM_DIR = 'programs';

/**
 * Builds a save/list/load/remove API backed by a @capacitor/filesystem
 * Filesystem plugin instance. Kept as a pure factory (no reference to
 * `window`/`Capacitor` inside) so it can be unit tested with a fake plugin.
 */
function createNativeProgramStorage(Filesystem, Directory) {
  let dirReady = null;
  function ensureDir() {
    if (!dirReady) {
      dirReady = Filesystem.mkdir({ path: NATIVE_PROGRAM_DIR, directory: Directory.Data, recursive: true })
        .catch(() => {}); // already exists
    }
    return dirReady;
  }

  return {
    available: true,
    async list() {
      await ensureDir();
      try {
        const { files } = await Filesystem.readdir({ path: NATIVE_PROGRAM_DIR, directory: Directory.Data });
        return files
          .filter(f => f.type === 'file' && /\.wedo\.json$/i.test(f.name))
          .map(f => f.name)
          .sort((a, b) => a.localeCompare(b));
      } catch (e) { return []; }
    },
    async save(name, text) {
      await ensureDir();
      await Filesystem.writeFile({
        path: NATIVE_PROGRAM_DIR + '/' + name,
        data: text,
        directory: Directory.Data,
        encoding: 'utf8',
      });
    },
    async load(name) {
      const { data } = await Filesystem.readFile({
        path: NATIVE_PROGRAM_DIR + '/' + name,
        directory: Directory.Data,
        encoding: 'utf8',
      });
      return data;
    },
    async remove(name) {
      await Filesystem.deleteFile({ path: NATIVE_PROGRAM_DIR + '/' + name, directory: Directory.Data });
    },
  };
}

if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform
    && window.Capacitor.isNativePlatform() && typeof capacitorFilesystemPluginCapacitor !== 'undefined') {
  window.NativeProgramStorage = createNativeProgramStorage(
    capacitorFilesystemPluginCapacitor.Filesystem,
    capacitorFilesystemPluginCapacitor.Directory,
  );
}
