const SECTIONS = globalThis.DP_SECTIONS;
const GROUPS = globalThis.DP_GROUPS;
const DEFAULT_HIDE = Object.fromEntries(SECTIONS.map(s => [s.key, !!s.hide]));
const DEFAULTS = { enabled: true, domains: ['wikipedia.org'], highlight: true, fallback: false, inlineButtons: true, sitelinks: true, hide: DEFAULT_HIDE };
const $ = id => document.getElementById(id);

function normalizeDomain(d) {
  return d.trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
}

function el(tag, props = {}, kids = []) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function attrs(e, map) {
  for (const [k, v] of Object.entries(map)) e.setAttribute(k, v);
  return e;
}

// One grouped list per section group. A checked box means the section is
// shown. Each group's heading has a checkbox for the whole group: ticked when
// every section in it is shown, a dash when some are, empty when none are.
function buildSections() {
  const host = $('sections');
  for (const g of GROUPS) {
    const items = SECTIONS.filter(s => s.group === g.id);
    if (!items.length) continue;
    const headId = 'g-' + g.id;
    const all = attrs(el('input', { type: 'checkbox', id: 'all-' + g.id }), { 'aria-label': 'Show all: ' + g.title });
    all.dataset.groupAll = g.id;
    const head = el('div', { className: 'ghead check' }, [
      all, el('h2', { id: headId }, [el('label', { htmlFor: all.id, textContent: g.title })]),
    ]);
    const box = el('div', { className: 'group' });
    for (const s of items) {
      const id = 'show-' + s.key;
      const input = attrs(el('input', { type: 'checkbox', id }), { 'aria-describedby': 'sections-d' });
      const text = el('span', { className: 'text' }, [el('span', { className: 'label', textContent: s.label })]);
      if (s.hint) {
        text.append(el('span', { className: 'hint', id: id + '-d', textContent: s.hint }));
        input.setAttribute('aria-describedby', id + '-d sections-d');
      }
      input.dataset.key = s.key;
      input.dataset.group = g.id;
      box.append(el('label', { className: 'row' }, [input, text]));
    }
    host.append(attrs(el('div', {}, [head, box]), { role: 'group', 'aria-labelledby': headId }));
  }
}

buildSections();
const sectionInputs = () => document.querySelectorAll('#sections input[data-key]');

// Bring each group's heading checkbox in line with its rows.
function syncGroups() {
  for (const all of document.querySelectorAll('input[data-group-all]')) {
    const rows = [...sectionInputs()].filter(i => i.dataset.group === all.dataset.groupAll);
    const shown = rows.filter(i => i.checked).length;
    all.checked = shown === rows.length;
    all.indeterminate = shown > 0 && shown < rows.length;
  }
}

function parseDomains() {
  return [...new Set($('domains').value.split('\n').map(normalizeDomain).filter(Boolean))];
}

// Storage keeps the original "hide" map, so a checked (shown) box is hide: false.
function readHide() {
  const hide = {};
  for (const input of sectionInputs()) hide[input.dataset.key] = !input.checked;
  return hide;
}

function syncEnabled() {
  document.body.classList.toggle('off', !$('enabled').checked);
}

// ---------- auto-save ----------

// Changes made in quick succession go out as one write: storage.sync allows
// 120 writes a minute, and a write over the limit fails.
let savedTimer = null;
let pending = {};
let flushTimer = null;
function save(partial) {
  Object.assign(pending, partial);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 300);
}

function flush() {
  const batch = pending;
  pending = {};
  chrome.storage.sync.set(batch, () => {
    const err = chrome.runtime.lastError;
    if (err) {
      // Stays on screen (role="alert") until a later save works or it's dismissed.
      // The unsaved values remain in the form, so the next change retries them.
      $('error-msg').textContent = '× Not saved: ' + err.message;
      $('error').hidden = false;
      pending = { ...batch, ...pending };
      return;
    }
    $('error').hidden = true;
    const st = $('status');
    st.textContent = '✓ Saved';
    st.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { st.classList.remove('show'); st.textContent = ''; }, 1600);
  });
}

// Checkboxes save the moment they change.
document.addEventListener('change', e => {
  const t = e.target;
  if (!t.matches('input[type=checkbox]')) return;
  if (t.id === 'enabled') { syncEnabled(); save({ enabled: t.checked }); }
  else if (['highlight', 'fallback', 'inlineButtons', 'sitelinks'].includes(t.id)) save({ [t.id]: t.checked });
  else if (t.dataset.groupAll) {
    for (const input of sectionInputs()) if (input.dataset.group === t.dataset.groupAll) input.checked = t.checked;
    syncGroups();
    save({ hide: readHide() });
  } else if (t.dataset.key) {
    syncGroups();
    save({ hide: readHide() });
  }
});

// Domains save shortly after typing stops, and are tidied when the box loses focus.
let typingTimer = null;
$('domains').addEventListener('input', () => {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => save({ domains: parseDomains() }), 600);
});
$('domains').addEventListener('change', () => {
  clearTimeout(typingTimer);
  const domains = parseDomains();
  $('domains').value = domains.join('\n');
  save({ domains });
});

// Don't lose a change made just before the tab closes.
window.addEventListener('pagehide', () => {
  if (typingTimer) { clearTimeout(typingTimer); pending.domains = parseDomains(); }
  if (Object.keys(pending).length) { clearTimeout(flushTimer); flush(); }
});

$('error-close').addEventListener('click', () => { $('error').hidden = true; });

$('showall').addEventListener('click', () => {
  for (const input of sectionInputs()) input.checked = true;
  syncGroups();
  save({ hide: readHide() });
});

chrome.storage.sync.get(DEFAULTS, s => {
  const hide = { ...DEFAULT_HIDE, ...(s.hide || {}) };
  $('enabled').checked = s.enabled;
  $('domains').value = s.domains.join('\n');
  $('highlight').checked = s.highlight;
  $('fallback').checked = s.fallback;
  $('inlineButtons').checked = s.inlineButtons;
  $('sitelinks').checked = s.sitelinks;
  if (s.fallback) $('advanced').open = true; // never tuck away an option that's on
  for (const input of sectionInputs()) input.checked = !hide[input.dataset.key];
  syncGroups();
  syncEnabled();
});
