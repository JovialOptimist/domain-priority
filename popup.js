const $ = id => document.getElementById(id);

function flashSaved() {
  const st = $('status');
  st.textContent = '✓ Saved';
  st.classList.add('show');
  setTimeout(() => { st.classList.remove('show'); st.textContent = ''; }, 1200);
}

// Read out by screen readers (visually hidden live region).
function announce(text) {
  $('announce').textContent = '';
  setTimeout(() => { $('announce').textContent = text; }, 30);
}

function emptyRow(text) {
  const row = document.createElement('div');
  row.className = 'lrow empty';
  row.textContent = text;
  return row;
}

function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

const ICON_HANDLE = '<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="9" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="9" cy="13" r="1.5"/></svg>';
const ICON_EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7s-9-4.5-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.7 5.1A10.9 10.9 0 0 1 12 5c5 0 9 4.5 10 7a13.2 13.2 0 0 1-2.4 3.4"/><path d="M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.9 0 3.7-.6 5.2-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>';

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

// Older versions stored these; the popup no longer uses them.
chrome.storage.sync.remove(['hoverPreview', 'domainsOff']);

// ---------- power button ----------
//
// A toggle button (aria-pressed): filled when on, an outline when off. The
// title beside it says "on" or "off" in words, and the line under it sums
// up what the extension did on this page.

let enabled = true;
let pageStatus = null;

function showPower() {
  $('power').setAttribute('aria-pressed', String(enabled));
  $('power-title').textContent = enabled ? 'Domain Priority is on' : 'Domain Priority is off';
  document.body.classList.toggle('is-off', !enabled);
  let sub;
  if (!enabled) sub = 'Google is shown exactly as it is';
  else if (!pageStatus) sub = 'Works on Google Search';
  else if (!pageStatus.onAllTab) sub = 'Works on the All results tab';
  else {
    const hidden = pageStatus.sections.filter(s => s.hidden).length;
    sub = plural(pageStatus.promoted || 0, 'result', 'results') + ' moved up · ' + plural(hidden, 'section', 'sections') + ' hidden';
  }
  $('power-sub').textContent = sub;
}

$('power').addEventListener('click', async () => {
  enabled = !enabled;
  showPower();
  await chrome.storage.sync.set({ enabled });
  flashSaved();
});

// ---------- connection to the Google tab ----------
//
// A port to the content script stays open while the popup is showing. It
// sends this page's sections, and we send the key of the row being pointed
// at so the page can show that section. Closing the popup drops the port,
// which ends the preview. No "tabs" permission is needed: tabs.query still
// returns the tab id, just not its URL.

let port = null;
let rendered = '';   // the section keys currently drawn, to avoid rebuilding under the pointer

function preview(key) {
  if (port) { try { port.postMessage({ type: 'preview', key }); } catch { /* tab closed */ } }
}

function setEye(row, button, s) {
  row.classList.toggle('hidden', s.hidden);
  button.setAttribute('aria-pressed', String(!s.hidden));
  button.title = s.hidden ? s.label + ' is hidden. Click to show it' : s.label + ' is shown. Click to hide it';
  button.replaceChildren(svg(s.hidden ? ICON_EYE_OFF : ICON_EYE));
}

function renderSections(status) {
  pageStatus = status;
  showPower();
  const list = $('page-list');
  $('edit').disabled = !(status && status.enabled && status.onAllTab && status.sections.length);
  const showEmpty = text => { rendered = ''; list.replaceChildren(emptyRow(text)); };
  if (!status) return showEmpty('Open a Google search to see its sections here.');
  if (!status.enabled) return showEmpty('Turn Domain Priority on to manage this page’s sections.');
  if (!status.onAllTab) return showEmpty('Sections are only managed on the All results tab.');
  if (!status.sections.length) return showEmpty('No known sections on this page.');

  const keys = status.sections.map(s => s.key).join(',');
  if (keys === rendered) {
    // Same sections: just bring the eyes up to date.
    for (const s of status.sections) {
      const row = list.querySelector('[data-key="' + s.key + '"]');
      if (row) setEye(row, row.querySelector('.eye'), s);
    }
    return;
  }
  rendered = keys;
  list.replaceChildren(...status.sections.map(s => {
    const row = document.createElement('div');
    row.className = 'lrow srow';
    row.dataset.key = s.key;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = s.label;
    // A toggle button: its name stays "Show …" and aria-pressed says whether it is.
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'icon-btn eye';
    eye.setAttribute('aria-label', 'Show ' + s.label);
    setEye(row, eye, s);
    eye.addEventListener('click', async () => {
      const show = eye.getAttribute('aria-pressed') !== 'true';
      setEye(row, eye, { ...s, hidden: !show });
      const { hide = {} } = await chrome.storage.sync.get({ hide: {} });
      await chrome.storage.sync.set({ hide: { ...hide, [s.key]: !show } });
      flashSaved();
    });
    // Pointer or keyboard focus on the row shows that section on the page.
    row.addEventListener('mouseenter', () => preview(s.key));
    row.addEventListener('mouseleave', () => preview(null));
    eye.addEventListener('focus', () => preview(s.key));
    eye.addEventListener('blur', () => preview(null));
    row.append(name, eye);
    return row;
  }));
}

async function connect() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return renderSections(null);
  let answered = false;
  try {
    port = chrome.tabs.connect(tab.id, { name: 'dp-popup' });
  } catch {
    return renderSections(null);
  }
  port.onMessage.addListener(msg => {
    if (msg.type === 'status') { answered = true; renderSections(msg); }
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError; // no content script in this tab
    port = null;
    if (!answered) renderSections(null);
  });
  port.postMessage({ type: 'status' });
  setTimeout(() => { if (!answered) renderSections(null); }, 800);
}

// ---------- preferred domains ----------
//
// The list order is the priority order. Each row has a drag handle (which
// also moves with ↑/↓ when focused), its rank, the domain and a remove
// button. New domains go at the bottom.

let domains = [];

function normalizeDomain(d) {
  return String(d).trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#:].*$/, '');
}

async function saveDomains() {
  await chrome.storage.sync.set({ domains });
  flashSaved();
}

function setMsg(text, isError) {
  const m = $('add-msg');
  m.textContent = text;
  m.classList.toggle('err', !!isError);
}

function moveLabel(d, i) {
  return 'Move ' + d + ', rank ' + (i + 1) + ' of ' + domains.length + '. Drag, or use the up and down arrow keys';
}

// focus: { index, what: 'handle' | 'remove' } to put keyboard focus back after a redraw.
function renderDomains(focus) {
  const list = $('domain-list');
  if (!domains.length) {
    list.replaceChildren(emptyRow('No preferred domains yet.'));
  } else {
    list.replaceChildren(...domains.map((d, i) => {
      const row = document.createElement('div');
      row.className = 'lrow drow';
      row.dataset.domain = d;
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'icon-btn handle';
      handle.setAttribute('aria-label', moveLabel(d, i));
      handle.append(svg(ICON_HANDLE));
      handle.addEventListener('keydown', e => {
        const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
        if (to === null) return;
        e.preventDefault();
        if (to < 0 || to >= domains.length) return;
        moveDomain(i, to, true);
      });
      handle.addEventListener('pointerdown', e => startDrag(e, row));
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.setAttribute('aria-hidden', 'true');
      rank.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = d;
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = '↑↓ to move';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn remove';
      remove.textContent = '×';
      remove.title = 'Remove ' + d;
      remove.setAttribute('aria-label', 'Remove ' + d);
      remove.addEventListener('click', () => {
        domains = domains.filter(x => x !== d);
        renderDomains({ index: Math.min(i, domains.length - 1), what: 'remove' });
        setMsg('Removed ' + d + '.');
        saveDomains();
      });
      row.append(handle, rank, name, hint, remove);
      return row;
    }));
  }
  if (focus) {
    const rows = list.querySelectorAll('.drow');
    const target = rows[focus.index]?.querySelector('.' + focus.what) || $('add-open');
    target.focus();
  }
}

function moveDomain(from, to, byKeyboard) {
  const [d] = domains.splice(from, 1);
  domains.splice(to, 0, d);
  renderDomains(byKeyboard ? { index: to, what: 'handle' } : null);
  announce(d + ' moved to ' + (to + 1) + ' of ' + domains.length + '.');
  saveDomains();
}

// Drag with the pointer: the row lifts, and moves between the others as the
// pointer passes their middles. The order is saved on release.
function startDrag(e, row) {
  if (e.button !== 0) return;
  e.preventDefault();
  const list = $('domain-list');
  const from = [...list.children].indexOf(row);
  row.classList.add('lifted');
  row.querySelector('.handle').focus({ preventScroll: true });

  const onMove = ev => {
    const others = [...list.children].filter(r => r !== row);
    const before = others.find(r => {
      const b = r.getBoundingClientRect();
      return ev.clientY < b.top + b.height / 2;
    });
    if (before ? row.nextElementSibling !== before : row !== list.lastElementChild) list.insertBefore(row, before || null);
    [...list.children].forEach((r, i) => { const rank = r.querySelector('.rank'); if (rank) rank.textContent = String(i + 1); });
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    row.classList.remove('lifted');
    const to = [...list.children].indexOf(row);
    if (to !== from) moveDomain(from, to, true);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// Adding: "+ Add a domain" turns into a small form.
function showAddForm(open) {
  $('add-open').hidden = open;
  $('add-form').hidden = !open;
  if (open) $('add-domain').focus();
}

$('add-open').addEventListener('click', () => { setMsg(''); showAddForm(true); });
$('add-cancel').addEventListener('click', () => { $('add-domain').value = ''; showAddForm(false); $('add-open').focus(); });
$('add-domain').addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); $('add-cancel').click(); } });

$('add-form').addEventListener('submit', e => {
  e.preventDefault();
  const field = $('add-domain');
  const d = normalizeDomain(field.value);
  if (!d) return setMsg('');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return setMsg('× “' + d + '” isn’t a domain, like example.com', true);
  field.value = '';
  if (domains.includes(d)) return setMsg(d + ' is already in the list.');
  domains = [...domains, d];
  setMsg('✓ Added ' + d + ' at the bottom of the list.');
  renderDomains();
  saveDomains();
});

// ---------- settings ----------

function loadSettings() {
  chrome.storage.sync.get({ enabled: true, domains: ['wikipedia.org'] }, s => {
    enabled = s.enabled;
    showPower();
    const next = s.domains.map(normalizeDomain).filter(Boolean);
    // Our own saves come back through onChanged too; redrawing then would
    // take keyboard focus off the row just used.
    if (JSON.stringify(next) !== JSON.stringify(domains) || !$('domain-list').children.length) {
      domains = next;
      renderDomains();
    }
  });
}
loadSettings();

// Stay in step with changes made in Settings (or another window).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && ('enabled' in changes || 'domains' in changes)) loadSettings();
});

// Editing happens on the page itself: the popup would close on the first
// click there anyway, so it hands over and closes.
$('edit').addEventListener('click', () => {
  if (!port) return;
  // Close once the page confirms, so the message isn't lost with the popup.
  port.onMessage.addListener(msg => { if (msg.type === 'editing') window.close(); });
  try { port.postMessage({ type: 'edit' }); } catch { return; }
});

$('settings').addEventListener('click', () => { chrome.runtime.openOptionsPage(); window.close(); });

connect();
