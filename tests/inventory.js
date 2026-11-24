// Heading inventory collector. Run it on each Google results page from
// tests/inventory-queries.json, with the unpacked (development) extension
// loaded: paste it into the page's DevTools console, or run it through
// browser automation. It adds every heading on the page to a running total
// kept in google.com's localStorage under "dp-inventory", so the total
// builds up across searches and survives page loads.
//
// When all searches are done, read the total with
//   copy(localStorage.getItem('dp-inventory'))
// and save it as tests/heading-inventory.json. Clear it before a fresh run
// with localStorage.removeItem('dp-inventory').
//
// Each heading is counted under the text the extension matches against
// section names ("match"), with:
//   names   section keys the extension recognised it as (empty: not recognised)
//   inside  section keys whose box it sat in (it may be a sub-heading)
//   levels  heading levels seen (aria-level or tag name)
//   areas   main column, right-hand panel, or other (above the results)
//   seen    how many searches showed it; visible: how many of those it was visible on
//   searches  up to 8 of those searches, as examples
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (location.pathname.startsWith('/sorry')) return { stop: 'Google is showing a CAPTCHA: stop the run' };
  const q = new URLSearchParams(location.search).get('q') || '';

  // Wait for the extension's first pass over the page, then give Google a
  // moment more to add late blocks.
  let r = null;
  for (let tries = 0; tries < 16; tries++) {
    await wait(500);
    window.dispatchEvent(new Event('dp-dev-report'));
    const raw = document.documentElement.dataset.dpDevReport;
    delete document.documentElement.dataset.dpDevReport;
    if (!raw) return { q, error: 'No report: is the development build loaded and reloaded?' };
    r = JSON.parse(raw);
    if (r.applyRuns && tries >= 7) break;
  }
  if (!r.onAllTab) return { q, skipped: 'not the All results tab' };

  const inv = JSON.parse(localStorage.getItem('dp-inventory') || '{"searches":[],"headings":{}}');
  if (inv.searches.includes(q)) return { q, skipped: 'already counted' };
  inv.searches.push(q);

  const add = (set, v) => { if (v && !set.includes(v)) set.push(v); };
  let fresh = 0;
  const seenHere = new Set();
  for (const h of r.headings) {
    if (!h.match || seenHere.has(h.match)) continue;  // count each heading once per search
    seenHere.add(h.match);
    let e = inv.headings[h.match];
    if (!e) {
      e = inv.headings[h.match] = { text: h.text, names: [], inside: [], levels: [], areas: [], seen: 0, visible: 0, searches: [] };
      fresh++;
    }
    add(e.names, h.names);
    add(e.inside, h.inside);
    add(e.levels, String(h.level));
    add(e.areas, h.area);
    e.seen++;
    if (h.visible) e.visible++;
    if (e.searches.length < 8) e.searches.push(q);
  }
  localStorage.setItem('dp-inventory', JSON.stringify(inv));

  // Same rules as tests/audit.js, so a run also catches broken boxes.
  const fail = r.sections.filter(s => s.webGroupsInside || s.pagerInside || (r.enabled && s.hiddenSetting && s.visible))
    .map(s => s.key);
  return {
    q, headings: seenHere.size, newHeadings: fresh, total: Object.keys(inv.headings).length,
    unrecognisedVisible: r.headings.filter(h => h.visible && !h.names && !h.inside).length,
    fail,
  };
})();
