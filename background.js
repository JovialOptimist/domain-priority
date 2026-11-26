// Toolbar badge: "OFF" when the extension is switched off, otherwise the
// number of section types hidden on that tab (reported by the content script).
// Text carries the meaning, so the badge colour is only decoration.

chrome.action.setBadgeBackgroundColor({ color: '#5f6368' });

async function syncGlobalBadge() {
  const { enabled } = await chrome.storage.sync.get({ enabled: true });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  await chrome.action.setTitle({ title: enabled ? 'Domain Priority' : 'Domain Priority (off)' });
}

chrome.runtime.onInstalled.addListener(syncGlobalBadge);
chrome.runtime.onStartup.addListener(syncGlobalBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && 'enabled' in changes) syncGlobalBadge();
});

// Development only: lets a test script reload the unpacked extension from a
// Google tab (Chrome doesn't let automation press Reload on
// chrome://extensions) and change settings. Only an unpacked install
// ("Load unpacked") counts as development; store installs ignore these.
// getSelf needs no "management" permission.
const devMode = chrome.management.getSelf().then(info => info.installType === 'development', () => false);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && typeof msg.type === 'string' && msg.type.startsWith('dp-dev-')) {
    devMode.then(dev => {
      if (msg.type === 'dp-dev-mode') sendResponse(dev);
      else if (dev) handleDev(msg);
    });
    return true;   // sendResponse may be called after this returns
  }
  if (!msg || msg.type !== 'dp-badge' || !sender.tab) return;
  const tabId = sender.tab.id;
  const text = !msg.enabled ? 'OFF' : msg.count ? String(msg.count) : '';
  const title = !msg.enabled ? 'Domain Priority (off)'
    : msg.count ? `Domain Priority: ${msg.count} section type${msg.count === 1 ? '' : 's'} hidden here`
    : 'Domain Priority';
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setTitle({ tabId, title });
});

function handleDev(msg) {
  if (msg.type === 'dp-dev-reload') { chrome.runtime.reload(); return; }
  if (msg.type === 'dp-dev-set' && msg.values && typeof msg.values === 'object') {
    // A "hide" value changes only the sections it names, so a test that
    // hides one section doesn't reset the rest of the user's choices.
    const { hide, ...rest } = msg.values;
    if (hide && typeof hide === 'object') {
      chrome.storage.sync.get({ hide: {} }, raw => chrome.storage.sync.set({ ...rest, hide: { ...raw.hide, ...hide } }));
    } else {
      chrome.storage.sync.set(msg.values);
    }
  }
}
