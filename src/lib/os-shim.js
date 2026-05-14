// Minimal browser shim for Node built-in modules pulled into the browser
// bundle via @perennity/engine's transitive fast-glob dependency.
//
// fast-glob's settings.js calls os.cpus().length at module init; glob-parent
// calls path.posix.dirname and os.platform() at module init. Without this
// shim those modules resolve to {} (Vite's default for externalized Node
// built-ins) and module init throws "platform is not a function" / "cpus is
// not a function", blanking the page.
//
// Aliased to os/node:os/path/node:path in vite.config.js. The shim exposes
// the union of the two modules' surfaces actually touched at module init —
// enough for init to succeed. The fast-glob runtime functions that would
// invoke these are dead code in the browser path: the KB loads from the
// engine's statically-bundled BUNDLED_ACTIVITIES, not its filesystem loader.

export const platform = () => 'browser';
export const cpus = () => [{}];
export const arch = () => '';
export const EOL = '\n';
export const homedir = () => '/';
export const tmpdir = () => '/tmp';
export const release = () => '';
export const type = () => 'Browser';

const posixUtil = {
  sep: '/',
  delimiter: ':',
  dirname: (p) => {
    const s = String(p);
    const i = s.lastIndexOf('/');
    return i < 0 ? '.' : i === 0 ? '/' : s.slice(0, i);
  },
  basename: (p) => {
    const s = String(p);
    const i = s.lastIndexOf('/');
    return i < 0 ? s : s.slice(i + 1);
  },
  extname: (p) => {
    const s = String(p);
    const i = s.lastIndexOf('.');
    return i <= 0 || s.lastIndexOf('/') > i ? '' : s.slice(i);
  },
  join: (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/'),
  resolve: (...parts) => parts.filter(Boolean).join('/'),
  normalize: (p) => String(p).replace(/\/+/g, '/'),
  isAbsolute: (p) => String(p).startsWith('/'),
};

export const posix = posixUtil;
export const win32 = { ...posixUtil, sep: '\\' };

export const sep = '/';
export const delimiter = ':';
export const dirname = posixUtil.dirname;
export const basename = posixUtil.basename;
export const extname = posixUtil.extname;
export const join = posixUtil.join;
export const resolve = posixUtil.resolve;
export const normalize = posixUtil.normalize;
export const isAbsolute = posixUtil.isAbsolute;

export default {
  platform, cpus, arch, EOL, homedir, tmpdir, release, type,
  posix, win32,
  sep, delimiter, dirname, basename, extname, join, resolve, normalize,
  isAbsolute,
};
