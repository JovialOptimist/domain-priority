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
// chrome://extensions). Store installs carry an update_url and ignore it.
const DEV = !('update_url' in chrome.runtime.getManifest());

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (DEV && msg && msg.type === 'dp-dev-reload') { chrome.runtime.reload(); return; }
  if (DEV && msg && msg.type === 'dp-dev-set' && msg.values && typeof msg.values === 'object') {
    chrome.storage.sync.set(msg.values);
    return;
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
