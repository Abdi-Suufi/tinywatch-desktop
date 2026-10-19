const { app, BrowserWindow, WebContentsView, nativeTheme, session, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const SITE = 'https://tinywatch.co.uk';
const ALLOWED_HOSTS = ['tinywatch.co.uk', 'www.tinywatch.co.uk'];
const EMBED_HOSTS = [];
const BLOCKED = ['*://*.doubleclick.net/*', '*://*.popads.net/*'];
const BAR_HEIGHT = 36;

const { Client } = require('@xhayper/discord-rpc');

const DISCORD_CLIENT_ID = '1561584295481712673';
const appStartedAt = new Date();
let rpc;
let rpcReady = false;
let last = { key: '', start: 0 };
let busy = false;

async function connectDiscord() {
  rpc = new Client({ clientId: DISCORD_CLIENT_ID });
  rpc.on('ready', () => { rpcReady = true; last = { key: '', start: 0 }; });
  rpc.on('disconnected', () => { rpcReady = false; setTimeout(connectDiscord, 15000); });
  try { await rpc.login(); } catch { setTimeout(connectDiscord, 15000); }
}

// Finds the real player video across all frames, ignoring short ad clips
async function readPlayback() {
  if (!view || view.webContents.isDestroyed()) return null;
  let best = null;
  for (const f of view.webContents.mainFrame.framesInSubtree) {
    try {
      const r = await f.executeJavaScript(`(() => {
        const v = document.querySelector('video');
        return v ? { t: v.currentTime, d: v.duration, paused: v.paused } : null;
      })()`);
      if (r && isFinite(r.d) && r.d > 120 && (!best || r.d > best.d)) best = { ...r, url: f.url };
    } catch {}
  }
  return best;
}

function parseEpisode(url) {
  try {
    const u = new URL(url);
    const s = u.searchParams.get('s');
    const e = u.searchParams.get('e');
    if (s && e) return `Season ${s} · Episode ${e}`;
  } catch {}
  return undefined;
}

function cleanTitle() {
  const t = view.webContents.getTitle() || '';
  if (!t || /modern streaming platform/i.test(t)) return null;
  return t.replace(/\s*[|\-–]\s*Tinywatch.*$/i, '').trim() || null;
}

async function updatePresence() {
  if (busy || !rpcReady || !rpc.user) return;
  busy = true;
  try {
    const pb = await readPlayback();
    const base = { largeImageKey: 'tinywatch', largeImageText: 'Tinywatch' };

    if (!pb) {
      if (last.key !== 'browse') {
        await rpc.user.setActivity({ ...base, details: 'Browsing Tinywatch', startTimestamp: appStartedAt });
        last = { key: 'browse', start: 0 };
      }
      return;
    }

    const title = cleanTitle() || 'Watching on Tinywatch';
    const episode = parseEpisode(pb.url);

    if (pb.paused) {
      const key = `paused|${title}|${episode}`;
      if (last.key !== key) {
        await rpc.user.setActivity({ ...base, details: title, state: episode ? `${episode} · Paused` : 'Paused' });
        last = { key, start: 0 };
      }
      return;
    }

    const startMs = Date.now() - pb.t * 1000;
const key = `play|${title}|${episode}`;
if (last.key !== key || Math.abs(startMs - last.start) > 5000) {
  const mins = Math.round(pb.d / 60);
  const length = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  await rpc.user.setActivity({
    ...base,
    details: title,
    state: episode ? `${episode} · ${length}` : length,
    startTimestamp: new Date(startMs),
  });
  last = { key, start: startMs };
}
  } catch {} finally {
    busy = false;
  }
}

// Tweak these to match your site exactly
const THEMES = {
  dark:  { bg: '#0a0a0a', fg: '#f5f5f5' },
  light: { bg: '#f4f4f5', fg: '#111111' },
};
const theme = () => (nativeTheme.shouldUseDarkColors ? THEMES.dark : THEMES.light);

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

if (!app.requestSingleInstanceLock()) app.quit();

let win, view;
let fullscreen = false;

function layout() {
  const [w, h] = win.getContentSize();
  const top = fullscreen ? 0 : BAR_HEIGHT;
  view.setBounds({ x: 0, y: top, width: w, height: h - top });
}

function applyTheme() {
  const t = theme();
  win.setBackgroundColor(t.bg);
  view.setBackgroundColor(t.bg);
  win.setTitleBarOverlay({ color: t.bg, symbolColor: t.fg, height: BAR_HEIGHT });
}

function createWindow() {
  const t = theme();

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: t.bg,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: t.bg, symbolColor: t.fg, height: BAR_HEIGHT },
  });

  // The window itself shows the slim title bar
  win.loadFile(path.join(__dirname, 'titlebar.html'));

  // The site lives in its own view underneath
  view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.contentView.addChildView(view);
  view.setBackgroundColor(t.bg);
  layout();
  view.webContents.loadURL(SITE);

  const wc = view.webContents;

  wc.on('did-fail-load', (_e, code, _d, _u, isMainFrame) => {
    if (isMainFrame && code !== -3) wc.loadFile(path.join(__dirname, 'offline.html'));
  });

  wc.setWindowOpenHandler(({ url }) => {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.includes(host) ? { action: 'allow' } : { action: 'deny' };
  });

  wc.on('will-navigate', (e, url) => {
    const host = new URL(url).hostname;
    if (!ALLOWED_HOSTS.includes(host) && !EMBED_HOSTS.includes(host)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Video fullscreen: hide the bar and let the site fill the window
  wc.on('enter-html-full-screen', () => { fullscreen = true; layout(); });
  wc.on('leave-html-full-screen', () => { fullscreen = false; layout(); });

  win.on('resize', layout);
  win.on('maximize', layout);
  win.on('unmaximize', layout);
  win.on('focus', () => wc.focus());
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  connectDiscord();
  setInterval(updatePresence, 5000);
  app.setAppUserModelId('uk.co.tinywatch.desktop');
  session.defaultSession.webRequest.onBeforeRequest({ urls: BLOCKED }, (_d, cb) => cb({ cancel: true }));
  createWindow();
  nativeTheme.on('updated', applyTheme);

  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (error) => console.error('Auto-updater error:', error));
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: 'An update is ready to install.',
        detail: 'Restart Tinywatch to finish installing the update.',
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      }).catch((error) => {
        console.error('Failed to show update dialog:', error);
      });
    });
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('Failed to check for updates:', error);
    });
  }
});

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.on('window-all-closed', () => app.quit());