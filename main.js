const { app, BrowserWindow, WebContentsView, nativeTheme, session, shell } = require('electron');
const path = require('path');

const SITE = 'https://tinywatch.co.uk';
const ALLOWED_HOSTS = ['tinywatch.co.uk', 'www.tinywatch.co.uk'];
const EMBED_HOSTS = [];
const BLOCKED = ['*://*.doubleclick.net/*', '*://*.popads.net/*'];
const BAR_HEIGHT = 36;

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
  app.setAppUserModelId('uk.co.tinywatch.desktop');
  session.defaultSession.webRequest.onBeforeRequest({ urls: BLOCKED }, (_d, cb) => cb({ cancel: true }));
  createWindow();
  nativeTheme.on('updated', applyTheme);
});

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.on('window-all-closed', () => app.quit());