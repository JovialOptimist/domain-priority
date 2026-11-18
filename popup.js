const $ = id => document.getElementById(id);

function flashSaved() {
  const st = $('status');
  st.textContent = '✓ Saved';
  st.classList.add('show');
  setTimeout(() => { st.classList.remove('show'); st.textContent = ''; }, 1200);
}

function emptyRow(text) {
  const row = document.createElement('div');
  row.className = 'row empty';
  row.textContent = text;
  return row;
}

// ---------- connection to the Google tab ----------
//
// A port to the content script stays open while the popup is showing. It
// sends this page's sections, and we send the key of the row being pointed
// at so the page can fade that section. Closing the popup drops the port,
// which clears the fade. No "tabs" permission is needed: tabs.query still
// returns the tab id, just not its URL.

let port = null;
let rendered = '';   // the section keys currently drawn, to avoid rebuilding under the pointer

function preview(key) {
  if (port) { try { port.postMessage({ type: 'preview', key }); } catch { /* tab closed */ } }
}

function render(status) {
  const list = $('page-list');
  $('edit').disabled = !(status && status.enabled && status.onAllTab && status.sections.length);
  const showEmpty = text => { rendered = ''; list.replaceChildren(emptyRow(text)); };
  if (!status) return showEmpty('Open a Google search to see its sections here.');
  if (!status.enabled) return showEmpty('Turn Domain Priority on to manage this page’s sections.');
  if (!status.onAllTab) return showEmpty('Sections are only managed on the All results tab.');
  if (!status.sections.length) return showEmpty('No known sections on this page.');

  const keys = status.sections.map(s => s.key).join(',');
  if (keys === rendered) {
    // Same sections: just bring the checkboxes up to date.
    for (const s of status.sections) {
      const input = $('sec-' + s.key);
      if (input) input.checked = !s.hidden;
    }
    return;
  }
  rendered = keys;
  list.replaceChildren();
  for (const s of status.sections) {
    const id = 'sec-' + s.key;
    const row = document.createElement('label');
    row.className = 'row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = !s.hidden;   // checked = shown
    input.setAttribute('aria-describedby', 'page-note');
    const text = document.createElement('span');
    text.className = 'text';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = s.label;
    text.append(label);
    row.append(input, text);

    // Pointer or keyboard focus on the row previews that section on the page.
    row.addEventListener('mouseenter', () => preview(s.key));
    row.addEventListener('mouseleave', () => preview(null));
    input.addEventListener('focus', () => preview(s.key));
    input.addEventListener('blur', () => preview(null));

    input.addEventListener('change', async () => {
      const { hide = {} } = await chrome.storage.sync.get({ hide: {} });
      await chrome.storage.sync.set({ hide: { ...hide, [s.key]: !input.checked } });
      flashSaved();
    });
    list.append(row);
  }
}

async function connect() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return render(null);
  let answered = false;
  try {
    port = chrome.tabs.connect(tab.id, { name: 'dp-popup' });
  } catch {
    return render(null);
  }
  port.onMessage.addListener(msg => {
    if (msg.type === 'status') { answered = true; render(msg); }
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError; // no content script in this tab
    port = null;
    if (!answered) render(null);
  });
  port.postMessage({ type: 'status' });
  setTimeout(() => { if (!answered) render(null); }, 800);
}

// ---------- popup settings ----------

chrome.storage.sync.get({ enabled: true }, s => {
  $('enabled').checked = s.enabled;
});

// Hover preview used to be optional; it's always on now. Drop the old setting.
chrome.storage.sync.remove('hoverPreview');

$('enabled').addEventListener('change', async e => {
  await chrome.storage.sync.set({ enabled: e.target.checked });
  flashSaved();
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
