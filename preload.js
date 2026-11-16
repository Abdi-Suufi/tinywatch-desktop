const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tinywatchDesktop', {
  setPresence: (data) => ipcRenderer.send('presence:set', data),
  clearPresence: () => ipcRenderer.send('presence:set', null),
});

// ---- Window buttons (min / max / close) ----
// Placed at the end of the site's nav pill. On pages without the pill they
// float in the top-right corner instead, and move into the pill once it appears.

const BTN_CLASS = 'rounded-lg p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-yellow-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${body}</svg>`;
const ICONS = {
  min: svg('<path stroke-linecap="round" d="M5 12h14"/>'),
  max: svg('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
  restore: svg('<rect x="5" y="8" width="11" height="11" rx="2"/><path stroke-linecap="round" d="M9 5h8a2 2 0 0 1 2 2v8"/>'),
  close: svg('<path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>'),
};

let maximized = false;
let group;

function button(label, icon, channel, extraClass = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.className = `${BTN_CLASS} ${extraClass}`;
  b.innerHTML = icon;
  b.addEventListener('click', () => ipcRenderer.send(channel));
  return b;
}

function buildGroup() {
  group = document.createElement('span');
  group.id = 'tw-window-controls';
  group.style.cssText = 'display:flex;align-items:center;gap:2px;';
  const sep = document.createElement('span');
  sep.className = 'tw-wc-sep mx-1 h-6 w-px bg-white/15';
  sep.setAttribute('aria-hidden', 'true');
  group.append(
    sep,
    button('Minimize', ICONS.min, 'win:minimize'),
    button(maximized ? 'Restore' : 'Maximize', maximized ? ICONS.restore : ICONS.max, 'win:toggle-max', 'tw-wc-max'),
    button('Close', ICONS.close, 'win:close', 'tw-wc-close'),
  );
}

function place() {
  if (!document.body) return;
  if (!group) buildGroup();
  const pill = document.querySelector('nav [data-nav-pill]');
  if (pill) {
    if (group.parentElement !== pill || pill.lastElementChild !== group) {
      group.classList.remove('tw-wc-floating');
      pill.appendChild(group);
    }
  } else if (!group.isConnected || !group.classList.contains('tw-wc-floating')) {
    group.classList.add('tw-wc-floating');
    document.body.appendChild(group);
  }
}

ipcRenderer.on('win:maximized', (_e, value) => {
  maximized = value;
  const b = group && group.querySelector('.tw-wc-max');
  if (b) {
    b.innerHTML = value ? ICONS.restore : ICONS.max;
    b.setAttribute('aria-label', value ? 'Restore' : 'Maximize');
  }
});

// Wait for 'load' so the site has hydrated before we add nodes to its DOM,
// then keep the buttons in place as the site re-renders and navigates.
window.addEventListener('load', () => {
  place();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; place(); });
  }).observe(document.body, { childList: true, subtree: true });
});
