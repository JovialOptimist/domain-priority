// Page check for Domain Priority. Run it on a Google results page with the
// unpacked (development) extension loaded: paste it into the page's DevTools
// console, or run it through browser automation. It asks the extension for
// its development report (see devReport in content.js) and turns it into
// pass/fail results.
//
// Set window.DP_EXPECT = ['weather', 'products'] first to also check that
// those section keys were found (from tests/queries.json).
//
// Failures are things that must never happen. Warnings are worth a look but
// can be Google's doing (a section that didn't show up today, a new heading).
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(3500); // let Google and the extension settle

  // Changes to the page over 2 s after settling. A steady stream suggests the
  // extension is re-running in a loop; a short burst is usually Google loading.
  let changes = 0;
  const watch = new MutationObserver(m => { changes += m.length; });
  watch.observe(document.body, { childList: true, subtree: true });
  await wait(2000);
  watch.disconnect();

  // The extension handles the page once its settings have loaded; right
  // after a page load (or Back) that may not have happened yet, and an empty
  // report would pass. Wait for it, up to about 5 s more.
  let r = null;
  for (let tries = 0; tries < 10; tries++) {
    window.dispatchEvent(new Event('dp-dev-report'));
    const raw = document.documentElement.dataset.dpDevReport;
    delete document.documentElement.dataset.dpDevReport;
    if (!raw) return { query: document.title, fail: ['No report: is the development build loaded and reloaded?'], warn: [] };
    r = JSON.parse(raw);
    if (r.applyRuns) break;
    await wait(500);
  }
  if (!r.applyRuns) return { query: document.title, fail: ['The extension never handled this page'], warn: [] };

  const fail = [];
  const warn = [];
  for (const s of r.sections) {
    if (s.webGroupsInside) fail.push(`${s.key}: its box holds ${s.webGroupsInside} group(s) of search results`);
    else if (s.resultsInside) warn.push(`${s.key}: ${s.resultsInside} link title(s) inside (often the section's own sources)`);
    if (s.pagerInside) fail.push(`${s.key}: its box holds the page links`);
    if (r.enabled && s.hiddenSetting && s.visible) fail.push(`${s.key}: set to hidden but visible`);
  }
  if (r.enabled && r.preferredOnPage && !(r.firstHosts[0] || '').endsWith('★')) {
    fail.push(`a preferred result is on the page but ${r.firstHosts[0]} is first`);
  }
  if (r.zoomed) fail.push('page is shrunk while Edit layout is not open');
  if (changes > 200) warn.push(`${changes} page changes in 2 s after settling`);
  for (const u of r.unknownHeadings.filter(u => u.visible)) warn.push(`unrecognised heading: “${u.text}”`);
  for (const key of window.DP_EXPECT || []) {
    if (!r.sections.some(s => s.key === key)) warn.push(`expected section not found: ${key}`);
  }

  return {
    query: document.title.replace(/ - Google Search$/, ''),
    pass: fail.length === 0,
    fail, warn,
    found: [...new Set(r.sections.map(s => s.key))],
    first: r.firstHosts.slice(0, 3),
    chipsHidden: r.chipsHidden, sitelinksHidden: r.sitelinksHidden,
  };
})();
