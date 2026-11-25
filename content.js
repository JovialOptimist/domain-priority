// Domain Priority for Google — content script.
//
// Core idea: never rely on Google's class names. A result card is identified
// semantically: a link (<a>) that contains a title heading (<h3>). The card's
// outer boundary is the highest ancestor that still contains only that one
// result heading.
//
// Promoting moves just the preferred result itself, in the page (not only
// on screen), so Tab and screen-reader order match what you see. An
// invisible marker remembers its original spot, so it can be put back
// exactly. Everything else (hiding, labels) is reversible styling or our own
// small additions.

(() => {
  'use strict';

  const SECTIONS = globalThis.DP_SECTIONS || [];
  const DEFAULT_HIDE = Object.fromEntries(SECTIONS.map(s => [s.key, !!s.hide]));
  const DEFAULTS = { enabled: true, domains: ['wikipedia.org'], starred: null, highlight: true, fallback: false, inlineButtons: true, sitelinks: true, chips: true, hide: DEFAULT_HIDE };
  const PINNED = 'data-dp-pinned';     // a result found by the background search for a starred domain
  const HIDDEN = 'data-dp-hidden';     // section blocks we hide (value = section key)
  const PREVIEW = 'data-dp-preview';   // blocks faded while the popup row for them is hovered
  const ZOOMED = 'data-dp-zoomed';     // on <html> while the page is shrunk to fit for hover preview
  const MEASURE = 'data-dp-measure';   // on <html> for a moment while measuring with hidden blocks shown
  const EDITING = 'data-dp-editing';   // on <html> while in "Edit layout" mode
  const SITELINKS = 'data-dp-sitelinks'; // a result's list of site links, when hidden
  const CHIPS = 'data-dp-chips';       // a result's row of link chips, when hidden
  const LABEL = 'data-dp-label';       // our "★ Preferred source" label in a promoted result's site-name line
  const EXCLUDE = 'g-scrolling-carousel, [aria-roledescription="carousel"], [' + PINNED + ']';

  let settings = { ...DEFAULTS };

  // ---------- domain matching ----------

  function normalizeDomain(d) {
    return String(d).trim().toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[/?#].*$/, '');
  }

  // Index in the priority list (0 = highest), or -1 if not preferred.
  // "wikipedia.org" matches en.wikipedia.org, de.m.wikipedia.org, etc.
  function rankOf(host) {
    host = host.toLowerCase().replace(/^www\./, '');
    for (let i = 0; i < settings.domains.length; i++) {
      const d = settings.domains[i];
      if (host === d || host.endsWith('.' + d)) return i;
    }
    return -1;
  }

  // Real destination of a result link. Handles Google's /url?q= redirects;
  // returns null for internal Google links.
  function resolveHref(a) {
    const raw = a.getAttribute('href');
    if (!raw) return null;
    let u;
    try { u = new URL(raw, location.href); } catch { return null; }
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname)) {
      if (u.pathname === '/url') {
        const target = u.searchParams.get('q') || u.searchParams.get('url');
        if (target) { try { u = new URL(target); } catch { return null; } }
        else return null;
      } else {
        return null;
      }
    }
    return /^https?:$/.test(u.protocol) ? u : null;
  }

  // ---------- semantic card detection ----------

  function findCards(root) {
    const cards = [];
    const seen = new Set();
    for (const h3 of root.querySelectorAll('a h3')) {
      const link = h3.closest('a');
      if (!link || seen.has(link) || link.closest(EXCLUDE) || link.closest('[' + HIDDEN + ']')) continue;
      seen.add(link);
      const url = resolveHref(link);
      if (!url) continue;
      let card = link;
      while (card.parentElement && card.parentElement !== root &&
             card.parentElement.querySelectorAll('a h3').length === 1) {
        card = card.parentElement;
      }
      cards.push({ card, link, h3, url, host: url.hostname, rank: rankOf(url.hostname) });
    }
    return cards;
  }

  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let anc = nodes[0].parentElement;
    while (anc && !nodes.every(n => anc.contains(n))) anc = anc.parentElement;
    return anc;
  }

  function childOf(anc, node) {
    while (node && node.parentElement !== anc) node = node.parentElement;
    return node;
  }

  function resultsRoot() {
    return document.querySelector('#rso') || document.querySelector('#search');
  }

  // ---------- styling (reversible) ----------

  function restoreAll() {
    for (const el of document.querySelectorAll('[' + HIDDEN + ']')) el.removeAttribute(HIDDEN);
    for (const el of document.querySelectorAll('[' + PREVIEW + ']')) el.removeAttribute(PREVIEW);
    for (const el of document.querySelectorAll('[' + SITELINKS + ']')) el.removeAttribute(SITELINKS);
    for (const el of document.querySelectorAll('[' + CHIPS + ']')) el.removeAttribute(CHIPS);
  }

  // Pointing at a section in the popup outlines it where it is (a thick
  // outline, so it's a shape cue, not only colour). The page never moves
  // or resizes for that; a label at the window's edge covers sections that
  // are off screen or hidden.
  //
  // In "Edit layout" mode <body> is scaled down so the whole page fits in
  // the window. A transform is visual only, so Google's layout doesn't reflow.
  const CSS = 'html:not([' + MEASURE + ']):not([' + EDITING + ']) [' + HIDDEN + ']{display:none!important}' +
    // In edit mode hidden blocks stay in place as faded ghosts; the overlay adds a "Hidden" tag.
    'html[' + EDITING + '] [' + HIDDEN + ']{opacity:.35!important}' +
    '[' + SITELINKS + '],[' + CHIPS + ']{display:none!important}' +
    '[' + PREVIEW + ']{outline:3px solid #1a73e8!important;outline-offset:6px;border-radius:8px}' +
    'html[' + ZOOMED + ']{overflow:hidden!important}' +
    'html[' + ZOOMED + '] body{transform:scale(var(--dp-zoom,1));transform-origin:top center}';

  function injectCss() {
    let s = document.getElementById('dp-css');
    if (!s) {
      s = document.createElement('style');
      s.id = 'dp-css';
      (document.head || document.documentElement).appendChild(s);
    }
    if (s.textContent !== CSS) s.textContent = CSS; // replaces rules left by an older version
  }

  // ---------- section hiding ----------
  //
  // A section starts at a heading whose text names it ("People also ask"), or
  // at a labelled region (role="region" aria-label="Ads"). Its block is the
  // highest ancestor that holds no heading of a *different* known section and
  // stops below the page's structural containers. Google's hidden "Web
  // results" headings count as a different section, so a block never swallows
  // ordinary results.

  const WEB_HEADING = /^web results?$|^web result with site links$/;
  const BOUNDARY = '#rso, #center_col, #rcnt, #rhs, #botstuff, #search, #taw, #main, body, html';

  // A heading's text, as matched against the section names. Parts Google
  // hides from screen readers are left out, and so is trailing punctuation:
  // "Popular products. In-demand favorites" is usually built as "Popular
  // products", an invisible ".", and the subtitle marked aria-hidden, so it
  // reads as "popular products".
  function headingText(el) {
    let text = '';
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const parent = walk.currentNode.parentElement;
      if (parent && parent !== el && el.contains(parent.closest('[aria-hidden="true"]'))) continue;
      text += walk.currentNode.data;
    }
    // Some copies of that heading leave the subtitle visible to screen
    // readers too, so also stop at the first ". " (no section name has one).
    text = text.replace(/\s+/g, ' ').trim().split('. ')[0].replace(/[\s.]+$/, '');
    return (text || el.textContent.replace(/\s+/g, ' ').trim()).toLowerCase();
  }

  // Every known section heading on the page, as { el, key }. Level-3 role
  // headings count too: the panel on the right nests its own "People also
  // search for" as one (search "sounders"). Only known heading texts match,
  // so other level-3 headings ("Main Cast" in an AI Overview) are ignored.
  const HEADING_SEL = 'h2, h3, [role="heading"][aria-level="2"], [role="heading"][aria-level="3"]';

  function sectionHeadings(scope) {
    const found = [];
    for (const el of scope.querySelectorAll(HEADING_SEL)) {
      if (el.closest('a, [role="dialog"], g-menu') || el.parentElement.closest('h2, h3, [role="heading"]')) continue;
      // Sitelinks under a result ("Roster", "News") are <h3 aria-level="4">: not sections.
      if (Number(el.getAttribute('aria-level')) > 3) continue;
      const text = headingText(el);
      if (!text || text.length > 80) continue;
      if (WEB_HEADING.test(text)) { found.push({ el, key: 'web' }); continue; }
      const s = SECTIONS.find(s => s.match && s.match.some(re => re.test(text)));
      if (s) found.push({ el, key: s.key });
    }
    for (const el of scope.querySelectorAll('[role="region"][aria-label]')) {
      const label = el.getAttribute('aria-label');
      const s = SECTIONS.find(s => s.region && s.region.includes(label));
      if (s) found.push({ el, key: s.key });
    }
    return found;
  }

  function isBoundary(el, center) {
    return el.matches(BOUNDARY) || (center && el.contains(center));
  }

  const MINOR = new Set(SECTIONS.filter(s => s.minor).map(s => s.key));

  // A block also never takes in the results pager ("1 2 3 … Next"):
  // "People also search for" shares a parent with it inside #botstuff, so
  // without this check hiding that section hid the pager too. Only the pager
  // counts, not every role="navigation": the AI Overview carries its own
  // hidden "AI Mode history" navigation, and stopping there left most of
  // the overview (and its "Show more" button) on the page.
  function isPager(nav) {
    if (nav.querySelector('#pnnext, #pnprev')) return true;
    const h = nav.querySelector('h1, h2, [role="heading"]');
    return !!h && /^page navigation$/i.test(h.textContent.trim());
  }

  function hasPager(el) {
    for (const nav of el.querySelectorAll('[role="navigation"]')) if (isPager(nav)) return true;
    return false;
  }

  // nested: a minor heading inside another section's block, such as an AI
  // Overview inside one "People also ask" answer. Its block then stops before
  // taking in any expand/collapse control it didn't already hold, which is
  // the question's own toggle. Without this, while only one answer had
  // loaded an AI Overview, its block grew to the whole list of questions,
  // and hiding AI Overview hid them all a moment after the page loaded.
  //
  // Minor headings (AI Overview, AI Mode) don't normally stop another
  // section's block, since in the main column they also appear inside other
  // sections. In the right-hand panel they don't: there an AI Overview can
  // share a panel with "People also search for" (search "hot dogs"), and the
  // two must get separate blocks.
  const stopsOthers = h => !MINOR.has(h.key) || !!h.el.closest('#rhs');

  function sectionBlock(start, key, heads, center, nested) {
    let block = start;
    for (let p = start.parentElement; p && !isBoundary(p, center); p = p.parentElement) {
      if (heads.some(h => h.key !== key && stopsOthers(h) && p.contains(h.el))) break;
      if (hasPager(p)) break;
      if (nested && [...p.querySelectorAll('[aria-expanded]')].some(t => !block.contains(t))) break;
      block = p;
    }
    return block;
  }

  // Knowledge panel: blocks beside or above the main column that carry
  // Google's entity attributes and no other known section heading. A level-3
  // heading inside one ("People also search for" on "eiffel tower") is part
  // of the panel, not a reason to leave it out.
  const isLevel3 = el => el.getAttribute('aria-level') === '3';

  function knowledgePanelBlocks(heads, center) {
    const out = [];
    const candidates = [];
    const rhs = document.getElementById('rhs');
    // Blocks above the main column first: that's where the panel's title is.
    if (center && center.parentElement) {
      candidates.push(...Array.from(center.parentElement.children).filter(c => c !== center && c.id !== 'rhs'));
    }
    if (rhs) candidates.push(...rhs.children);
    for (const c of candidates) {
      if (!c.querySelector('[data-attrid], [data-kpid]')) continue;
      if (heads.some(h => c.contains(h.el) && !isLevel3(h.el))) continue;
      out.push(c);
    }
    return out;
  }

  // True on the main "All" results and the "Web" filter (udm=14). Other tabs
  // (Images udm=2, Videos, News, Shopping, AI Mode, old tbm= tabs) have their
  // own layouts: on Images, inline "Related searches" strips sit inside the
  // image grid, so hiding that section there blanked the whole grid.
  function onAllResultsTab() {
    const p = new URLSearchParams(location.search);
    if (p.has('tbm')) return false;
    const udm = p.get('udm');
    return !udm || udm === '14';
  }

  // Every known section on the page as { key, block }, one entry per block.
  function collectSections() {
    if (!onAllResultsTab()) return [];
    const scope = document.getElementById('rcnt') || document.getElementById('main') || document.body;
    const center = document.getElementById('center_col');
    const heads = sectionHeadings(scope);
    const panels = knowledgePanelBlocks(heads, center);
    const out = [];
    const seen = new Set();
    // Major sections first, so minor headings inside them can be skipped.
    const ordered = [...heads.filter(h => !MINOR.has(h.key)), ...heads.filter(h => MINOR.has(h.key))];
    for (const h of ordered) {
      if (h.key === 'web') continue;
      // Level-3 headings inside the knowledge panel go with the panel.
      if (isLevel3(h.el) && panels.some(p => p.contains(h.el))) continue;
      const nested = MINOR.has(h.key) && out.some(s => s.block.contains(h.el));
      const block = sectionBlock(h.el, h.key, heads, center, nested);
      // A minor heading inside another section (the AI Mode box at the end of
      // "People also ask") is still its own section, unless its block would
      // take in several of its kind: then it's the shared list of questions
      // that each carry one, which must not be hidden.
      if (nested && heads.filter(o => o.key === h.key && block.contains(o.el)).length > 1) continue;
      // An AI answer to one expandable question belongs to the section around
      // it: Google now often answers "People also ask" questions with an AI
      // Overview alone, and hiding it left every question opening to nothing.
      // Such a block sits beside exactly one toggle (its question); a box at
      // the end of the list sits beside all of them and stays its own section.
      if (nested && block.parentElement &&
          [...block.parentElement.querySelectorAll('[aria-expanded]')].filter(t => !block.contains(t)).length === 1) continue;
      if (seen.has(block)) continue;
      seen.add(block);
      out.push({ key: h.key, block });
    }
    // Keep page order (for the on-page buttons and the popup list).
    out.sort((a, b) => a.block.compareDocumentPosition(b.block) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    for (const block of panels) {
      if (!seen.has(block)) out.push({ key: 'knowledgePanel', block });
    }
    return out;
  }

  // Hides the sections unchecked in settings; returns the ones left showing.
  function hideSections(sections) {
    const shown = [];
    for (const s of sections) {
      if (settings.hide[s.key]) s.block.setAttribute(HIDDEN, s.key);
      else shown.push(s);
    }
    return shown;
  }

  // ---------- "Hide" buttons on the results page ----------
  //
  // The buttons live in our own shadow root, attached to <html> outside
  // <body>, and are positioned over the page. Putting them inside Google's
  // markup would mean editing nodes Google's scripts own and re-render, and
  // our own MutationObserver (which watches <body>) would see every insert.

  let overlay = null;          // { host, layer, toast }
  let buttons = new Map();     // block -> { key, btn }
  let resizeObs = null;

  function ensureOverlay() {
    if (overlay && overlay.host.isConnected) return overlay;
    editBoxes = new Map();   // boxes from a removed overlay are gone with it
    const host = document.createElement('div');
    host.id = 'dp-overlay';
    host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = [
      ':host{all:initial}',
      '.b{position:absolute;transform:translateX(-100%);display:inline-flex;align-items:center;gap:4px;',
      ' font:12px/1 Arial,sans-serif;padding:4px 8px;border-radius:12px;cursor:pointer;white-space:nowrap;',
      ' border:1px solid #747775;background:#fff;color:#3c4043;opacity:.65;transition:opacity .15s}',
      '.b:hover,.b:focus-visible{opacity:1}',
      '.b:focus-visible{outline:2px solid #1a73e8;outline-offset:2px}',
      '.b[hidden]{display:none}',
      '.t{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:flex;gap:14px;align-items:center;',
      ' font:14px/1.4 Arial,sans-serif;padding:10px 16px;border-radius:8px;background:#303134;color:#e8eaed;',
      ' box-shadow:0 2px 10px rgba(0,0,0,.3)}',
      '.t[hidden]{display:none}',
      '.t button{font:inherit;font-weight:bold;background:none;border:none;color:#8ab4f8;cursor:pointer;text-decoration:underline;padding:0}',
      // Edit-mode boxes. Shown: solid border, "✓ Name" tag. Hidden: dashed
      // border, stripes, "× Hidden: Name" tag. Shape, pattern and text carry
      // the state, not just colour.
      '.e{position:absolute;box-sizing:border-box;margin:0;padding:0;font:12px/1.3 Arial,sans-serif;cursor:pointer;',
      ' border:2px solid #1a73e8;border-radius:6px;background:rgba(26,115,232,.06)}',
      '.e[hidden]{display:none}',
      '.e:hover,.e:focus-visible{border-width:3px;background:rgba(26,115,232,.16);outline:none}',
      '.e.h{border:2px dashed #5f6368;background:repeating-linear-gradient(135deg,rgba(60,64,67,.30) 0 6px,transparent 6px 14px)}',
      '.e.h:hover,.e.h:focus-visible{border-width:3px;background:repeating-linear-gradient(135deg,rgba(60,64,67,.45) 0 6px,transparent 6px 14px)}',
      '.tag{position:absolute;top:-2px;left:-2px;max-width:calc(100% + 4px);box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;',
      ' white-space:nowrap;padding:3px 8px;border-radius:6px 0 6px 0;background:#1a73e8;color:#fff;font-weight:bold}',
      '.e.h .tag{background:#3c4043;color:#fff}',
      '.act{display:none;font-weight:normal}',
      '.e:hover .act,.e:focus-visible .act{display:inline}',
      '.t.eb{bottom:24px}',
      // Edge label for the section pointed at in the popup when it's off screen or hidden.
      '.p{position:fixed;left:50%;transform:translateX(-50%);font:14px/1.4 Arial,sans-serif;padding:8px 14px;border-radius:8px;',
      ' background:#303134;color:#e8eaed;box-shadow:0 2px 10px rgba(0,0,0,.3);white-space:nowrap;pointer-events:none}',
      '.p.top{top:16px}.p.bottom{bottom:24px}.p[hidden]{display:none}',
      '@media (prefers-color-scheme:dark){.b{background:#303134;color:#e8eaed;border-color:#8e918f}',
      ' .e{border-color:#8ab4f8;background:rgba(138,180,248,.08)} .e:hover,.e:focus-visible{background:rgba(138,180,248,.18)}',
      ' .tag{background:#8ab4f8;color:#202124}',
      ' .e.h{border-color:#9aa0a6;background:repeating-linear-gradient(135deg,rgba(232,234,237,.22) 0 6px,transparent 6px 14px)}',
      ' .e.h .tag{background:#e8eaed;color:#202124}}',
    ].join('\n');
    const layer = document.createElement('div');
    const edit = document.createElement('div');
    const toast = document.createElement('div');
    toast.className = 't';
    toast.hidden = true;
    toast.setAttribute('role', 'status');
    watchToast(toast);
    const bar = document.createElement('div');
    bar.className = 't eb';
    bar.hidden = true;
    bar.setAttribute('role', 'status');
    const barMsg = document.createElement('span');
    barMsg.textContent = 'Editing layout. Click a section to hide or show it on every search.';
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Done (Esc)';
    done.addEventListener('click', () => setEditing(false));
    bar.append(barMsg, done);
    const peek = document.createElement('div');
    peek.className = 'p';
    peek.hidden = true;
    root.append(style, layer, edit, toast, bar, peek);
    document.documentElement.appendChild(host);
    overlay = { host, root, layer, edit, toast, bar, peek };
    return overlay;
  }

  function removeOverlay() {
    if (overlay) overlay.host.remove();
    overlay = null;
    buttons = new Map();
    editBoxes = new Map();
    if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
  }

  function labelOf(key) {
    const s = SECTIONS.find(x => x.key === key);
    return s ? s.label : key;
  }

  function renderHideButtons(shown) {
    // The knowledge panel can be split into several blocks; one button covers it.
    let kp = false;
    const deduped = shown.filter(s => s.key !== 'knowledgePanel' || (!kp && (kp = true)));
    const list = settings.inlineButtons ? deduped : [];
    if (!list.length) {
      if (overlay) { overlay.layer.replaceChildren(); buttons = new Map(); }
      return;
    }
    const { layer } = ensureOverlay();

    // Rebuild only when the set of sections changed, so keyboard focus survives re-runs.
    const same = list.length === buttons.size && list.every(s => buttons.get(s.block)?.key === s.key);
    if (!same) {
      buttons = new Map();
      layer.replaceChildren();
      for (const s of list) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'b';
        btn.textContent = '× Hide';
        btn.title = 'Hide “' + labelOf(s.key) + '” on every search';
        btn.setAttribute('aria-label', 'Hide section: ' + labelOf(s.key));
        btn.addEventListener('click', () => setHidden(s.key, true, true));
        layer.appendChild(btn);
        buttons.set(s.block, { key: s.key, btn });
      }
      if (resizeObs) resizeObs.disconnect();
      resizeObs = new ResizeObserver(() => requestAnimationFrame(positionButtons));
      for (const b of buttons.keys()) resizeObs.observe(b);
      const center = document.getElementById('center_col');
      if (center) resizeObs.observe(center);
    }
    positionButtons();
  }

  // In the empty left margin beside the block's top when there's room, so it
  // never covers Google's own controls and can't be mistaken for part of the
  // right-hand column. Otherwise (right column, narrow windows) just inside
  // the block's top-right corner.
  function positionButtons() {
    for (const [block, { btn }] of buttons) {
      const r = block.getBoundingClientRect();
      // Hidden while zoomed: they'd sit full-size over a shrunken page.
      const visible = !zoomed && block.isConnected && r.width > 40 && r.height > 16;
      btn.hidden = !visible;
      if (!visible) continue;
      const inMargin = r.left >= 90 && !block.closest('#rhs');
      btn.style.top = (r.top + window.scrollY + 4) + 'px';
      btn.style.left = ((inMargin ? r.left - 10 : r.right - 4) + window.scrollX) + 'px';
    }
    positionEdit();
  }

  // ---------- "Edit layout" mode ----------
  //
  // Started from the popup. The page is shrunk to fit, Google's own page is
  // made inert, and every known section gets a box over it in our overlay.
  // Clicking a box (or Enter/Space on it) hides or shows that section on
  // every search. Hidden sections stay in place as striped ghosts, so nothing
  // appears or vanishes while you work. Esc or Done leaves.

  let editing = false;
  let editBoxes = new Map();   // block -> { key, btn, tag, act }

  function onEditKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(false); }
  }

  function setEditing(on) {
    on = !!on && settings.enabled;
    if (on === editing) return;
    editing = on;
    const html = document.documentElement;
    if (on) {
      html.setAttribute(EDITING, '');
      document.body.inert = true;   // no clicks or focus reach Google's links while editing
      document.addEventListener('keydown', onEditKey, true);
      hideToast();
    } else {
      html.removeAttribute(EDITING);
      document.body.inert = false;
      document.removeEventListener('keydown', onEditKey, true);
    }
    updateZoom();
    renderEdit();
    if (on) {
      const first = [...editBoxes.values()].find(b => !b.btn.hidden);
      (first ? first.btn : overlay.bar.querySelector('button')).focus({ preventScroll: true });
    }
  }

  function updateBox(entry) {
    const hidden = !!settings.hide[entry.key];
    const label = labelOf(entry.key);
    entry.btn.classList.toggle('h', hidden);
    entry.tag.firstChild.textContent = (hidden ? '× Hidden: ' : '✓ ') + label;
    entry.act.textContent = hidden ? ' · click to show' : ' · click to hide';
    entry.btn.setAttribute('aria-label', label + ', ' + (hidden ? 'hidden' : 'shown') +
      '. Press to ' + (hidden ? 'show' : 'hide') + ' it on every search.');
  }

  function renderEdit() {
    if (!editing) {
      if (overlay) { overlay.edit.replaceChildren(); overlay.bar.hidden = true; }
      editBoxes = new Map();
      return;
    }
    const { root, edit, bar } = ensureOverlay();
    bar.hidden = false;
    const list = lastSections;
    const same = list.length === editBoxes.size && list.every(s => editBoxes.get(s.block)?.key === s.key);
    if (!same) {
      // Keep keyboard focus on the same block across the rebuild.
      const focused = [...editBoxes].find(([, b]) => b.btn === root.activeElement)?.[0];
      editBoxes = new Map();
      edit.replaceChildren();
      // Biggest first, so a section nested inside another sits on top of it.
      const area = b => { const r = b.getBoundingClientRect(); return r.width * r.height; };
      for (const s of [...list].sort((a, b) => area(b.block) - area(a.block))) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'e';
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.setAttribute('aria-hidden', 'true');
        const act = document.createElement('span');
        act.className = 'act';
        tag.append(document.createTextNode(''), act);
        btn.append(tag);
        const entry = { key: s.key, btn, tag, act };
        btn.addEventListener('click', () => setHidden(s.key, !settings.hide[s.key], false));
        edit.appendChild(btn);
        editBoxes.set(s.block, entry);
      }
      if (focused && editBoxes.has(focused)) editBoxes.get(focused).btn.focus({ preventScroll: true });
    }
    for (const entry of editBoxes.values()) updateBox(entry);
    positionEdit();
  }

  function positionEdit() {
    for (const [block, { btn }] of editBoxes) {
      const r = block.getBoundingClientRect();
      const ok = block.isConnected && r.width >= 4 && r.height >= 4;
      btn.hidden = !ok;
      if (!ok) continue;
      btn.style.top = (r.top + window.scrollY) + 'px';
      btn.style.left = (r.left + window.scrollX) + 'px';
      btn.style.width = r.width + 'px';
      btn.style.height = r.height + 'px';
    }
  }

  // The "hidden on every search · Undo" toast stays 8 s. While the pointer
  // is on it, or someone is using it from the keyboard, the clock stops;
  // leaving it restarts a 4 s countdown (WCAG 2.2.1: time limits can be
  // extended). Esc closes it.
  let toastTimer = null;
  let toastHeld = { pointer: false, keys: false };

  function hideToast() {
    clearTimeout(toastTimer);
    if (overlay) overlay.toast.hidden = true;
  }

  function scheduleToastHide(ms) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (!toastHeld.pointer && !toastHeld.keys) hideToast(); }, ms);
  }

  function watchToast(toast) {
    toast.addEventListener('mouseenter', () => { toastHeld.pointer = true; clearTimeout(toastTimer); });
    toast.addEventListener('mouseleave', () => { toastHeld.pointer = false; scheduleToastHide(4000); });
    // Focus alone doesn't hold it, since Undo is focused for you when it
    // appears; pressing a key in it does, until focus leaves.
    toast.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); hideToast(); return; }
      toastHeld.keys = true;
      clearTimeout(toastTimer);
    });
    toast.addEventListener('focusout', e => {
      if (toast.contains(e.relatedTarget)) return;
      toastHeld.keys = false;
      if (!toast.hidden) scheduleToastHide(4000);
    });
  }

  function showUndo(key) {
    const { toast } = ensureOverlay();
    toast.replaceChildren();
    const msg = document.createElement('span');
    msg.textContent = '“' + labelOf(key) + '” hidden on every search.';
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Undo';
    undo.addEventListener('click', () => { hideToast(); setHidden(key, false, false); });
    toast.append(msg, undo);
    toast.hidden = false;
    toastHeld = { pointer: toast.matches(':hover'), keys: false };
    undo.focus({ preventScroll: true });
    scheduleToastHide(8000);
  }

  function setHidden(key, value, withUndo) {
    chrome.storage.sync.get({ hide: {} }, raw => {
      const hide = { ...DEFAULT_HIDE, ...raw.hide, [key]: value };
      chrome.storage.sync.set({ hide }, () => {
        if (withUndo && !chrome.runtime.lastError) showUndo(key);
      });
    });
  }

  // ---------- toolbar badge and popup ----------

  let lastHidden = [];
  let lastSections = [];       // every section found on the page, hidden or not
  let lastPromoted = 0;        // preferred results on the page, for the popup's summary
  let lastReport = '';
  function report() {
    const msg = { type: 'dp-badge', enabled: settings.enabled, count: new Set(lastHidden).size };
    const key = JSON.stringify(msg);
    if (key === lastReport) return;
    lastReport = key;
    try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch { /* extension was reloaded */ }
  }

  // ---------- popup connection ----------
  //
  // The popup keeps a port open while it's showing. It asks for the sections
  // on this page and sends the key of the row under the pointer; when the
  // popup closes the port disconnects and the preview is cleared.

  const ports = new Set();
  let previewKey = null;
  let lastStatus = '';

  function status() {
    const keys = [...new Set(lastSections.map(s => s.key))];
    return {
      type: 'status',
      enabled: settings.enabled,
      onAllTab: onAllResultsTab(),
      promoted: lastPromoted,
      sections: keys.map(k => ({ key: k, label: labelOf(k), hidden: !!settings.hide[k] })),
    };
  }

  function sendStatus(force) {
    if (!ports.size) return;
    const msg = status();
    const key = JSON.stringify(msg);
    if (!force && key === lastStatus) return;
    lastStatus = key;
    for (const port of ports) { try { port.postMessage(msg); } catch { ports.delete(port); } }
  }

  // The section being pointed at in the popup: outlined in place when it's
  // on screen; otherwise a label at the top or bottom edge says where it is,
  // or that it's hidden. Nothing scrolls, resizes or reappears.
  function applyPreview() {
    for (const el of document.querySelectorAll('[' + PREVIEW + ']')) el.removeAttribute(PREVIEW);
    showPeek(null);
    if (!previewKey || !settings.enabled || editing) return;
    const blocks = lastSections.filter(s => s.key === previewKey).map(s => s.block);
    if (!blocks.length) return;
    const label = labelOf(previewKey);
    if (settings.hide[previewKey]) return showPeek('top', label + ' is hidden on this page');
    for (const b of blocks) b.setAttribute(PREVIEW, '');
    const rects = blocks.map(b => b.getBoundingClientRect()).filter(r => r.width && r.height);
    if (!rects.length) return;
    const top = Math.min(...rects.map(r => r.top));
    const bottom = Math.max(...rects.map(r => r.bottom));
    if (bottom < 0) showPeek('top', '↑ ' + label + ' is above');
    else if (top > window.innerHeight) showPeek('bottom', '↓ ' + label + ' is below');
  }

  // edge: 'top' | 'bottom' | null (hide).
  // Hiding waits 250 ms (unless now is set): moving the pointer from one
  // popup row to the next briefly points at nothing, and the label would
  // blink off and on. A new label in that time just replaces the text.
  let peekHideTimer = 0;
  function showPeek(edge, text, now) {
    clearTimeout(peekHideTimer);
    if (!edge) {
      if (!overlay) return;
      if (now) overlay.peek.hidden = true;
      else peekHideTimer = setTimeout(() => { if (overlay) overlay.peek.hidden = true; }, 250);
      return;
    }
    const { peek } = ensureOverlay();
    peek.className = 'p ' + edge;
    peek.textContent = text;
    peek.hidden = false;
  }

  // Scrolling while pointing at a section can bring it on or off screen.
  let peekFrame = 0;
  window.addEventListener('scroll', () => {
    if (!previewKey || peekFrame) return;
    peekFrame = requestAnimationFrame(() => { peekFrame = 0; applyPreview(); });
  }, { passive: true });

  // Shrink the page to fit the window in "Edit layout" mode. The fit is
  // measured with hidden sections shown, since edit mode shows them as ghosts.
  let zoomed = false;
  let savedScroll = null;

  function updateZoom() {
    const html = document.documentElement;
    const want = settings.enabled && editing;
    if (want) {
      if (!zoomed) savedScroll = { x: window.scrollX, y: window.scrollY };
      html.style.setProperty('--dp-zoom', '1');
      html.setAttribute(MEASURE, '');
      const height = html.scrollHeight;
      html.removeAttribute(MEASURE);
      const scale = Math.max(0.15, Math.min(1, window.innerHeight / height));
      html.style.setProperty('--dp-zoom', String(scale));
      html.setAttribute(ZOOMED, '');
      zoomed = true;
      window.scrollTo(0, 0);
    } else if (zoomed) {
      html.removeAttribute(ZOOMED);
      html.style.removeProperty('--dp-zoom');
      zoomed = false;
      if (savedScroll) window.scrollTo(savedScroll.x, savedScroll.y);
      savedScroll = null;
    }
    positionButtons();
  }

  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'dp-popup') return;
    ports.add(port);
    port.onMessage.addListener(msg => {
      if (msg.type === 'status') sendStatus(true);
      if (msg.type === 'preview') { previewKey = msg.key || null; applyPreview(); }
      if (msg.type === 'edit') {
        previewKey = null; applyPreview(); showPeek(null, null, true); setEditing(true);
        try { port.postMessage({ type: 'editing' }); } catch { /* popup already gone */ }
      }
    });
    port.onDisconnect.addListener(() => {
      ports.delete(port);
      if (!ports.size) { previewKey = null; applyPreview(); showPeek(null, null, true); updateZoom(); }
    });
    updateZoom();
  });

  // ---------- main pass ----------

  let applyRuns = 0;          // for the development report: has the page been handled yet?
  function apply() {
    applyRuns++;
    restoreAll();
    if (!settings.enabled) {
      setEditing(false); updateZoom();
      removePinned(); removeOverlay(); removeMarks(); promote(null, []); lastHidden = []; lastSections = []; lastPromoted = 0;
      report(); sendStatus(); return;
    }
    injectCss();
    const sections = collectSections();
    const shown = hideSections(sections);
    if (!settings.sitelinks) hideSitelinks();
    if (!settings.chips) hideChips();
    lastSections = sections;
    lastHidden = sections.filter(s => !shown.includes(s)).map(s => s.key);
    report();
    promoteAndPin();
    sendStatus();             // after promotion, so the popup's "moved up" count is current
    applyPreview();
    renderHideButtons(shown); // after promotion, which moves blocks around
    updateZoom();             // after layout changes, so the fit is measured on the final layout
    renderEdit();
  }

  // Site links: the list of a site's pages under its result ("Login",
  // "Pricing" under github.com, then "More results from github.com »").
  // Google marks each one as <h3 aria-level="4">, outside the result's own
  // title link. The list is the highest box around a site link that doesn't
  // also hold a result title, which takes in the "More results" row too.
  function hideSitelinks() {
    const root = resultsRoot();
    if (!root) return;
    for (const h of root.querySelectorAll('h3[aria-level="4"]')) {
      if (h.closest('a')) continue;
      let list = h;
      while (list.parentElement && list.parentElement !== root && !mainTitles(list.parentElement).length) list = list.parentElement;
      if (list !== h) list.setAttribute(SITELINKS, '');
    }
  }

  // Link chips: a row of small links under a result, outside its title link
  // ("Markets", "Research & Tools" under Yahoo Finance; "English",
  // "Deutsch" under wikipedia.org). Google builds them as a role="list" of
  // links, unlike the site links above, which have their own headings.
  function hideChips() {
    const root = resultsRoot();
    if (!root) return;
    for (const c of findCards(root)) {
      for (const list of c.card.querySelectorAll('[role="list"], ul')) {
        if (list.contains(c.link) || list.querySelector('h3')) continue;
        const links = list.querySelectorAll('a');
        if (links.length >= 2 && [...links].every(a => a.textContent.trim().length <= 40)) list.setAttribute(CHIPS, '');
      }
    }
  }

  function promoteAndPin() {
    lastPromoted = 0;
    const root = resultsRoot();
    if (!root) return;

    const cards = findCards(root);
    const preferred = cards.filter(c => c.rank >= 0);
    lastPromoted = preferred.length;

    syncLabels(settings.highlight ? preferred : []);

    if (preferred.length) {
      const anc = commonAncestor(cards.map(c => c.card));
      promote(anc, preferred);
    } else {
      promote(null, []);
    }
    lookForStarred(cards, root);
  }

  // ---------- marking promoted results ----------
  //
  // Modelled on Google's own "Preferred sources" feature, which stars a
  // source next to its site name. The label inherits the site name's font
  // and colour rather than using Google's generated class names, and the
  // star and the words carry the meaning, not colour. Labels are only added
  // or removed when something changed, since our MutationObserver would
  // otherwise re-run apply() forever.

  function removeMarks() {
    syncLabels([]);
  }

  // The site name ("Wikipedia") sits in the row just above the URL line
  // (<cite>). Falls back to the URL line itself.
  function labelTarget(c) {
    const cite = c.link.querySelector('cite') || c.card.querySelector('cite');
    if (!cite) return null;
    const row = cite.parentElement;
    let el = row && row.previousElementSibling;
    if (!el || !el.textContent.trim()) return row;
    // Down to the element that holds the name text itself.
    for (;;) {
      const kids = [...el.children].filter(k => !k.hasAttribute(LABEL));
      const ownText = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (kids.length !== 1 || ownText) break;
      el = kids[0];
    }
    return el;
  }

  function syncLabels(preferred) {
    const keep = new Set();
    for (const c of preferred) {
      const target = labelTarget(c);
      if (!target) continue;
      let label = [...target.children].find(k => k.hasAttribute(LABEL));
      if (!label) {
        label = document.createElement('span');
        label.setAttribute(LABEL, '');
        label.style.cssText = 'font:inherit;color:inherit;white-space:nowrap';
        const star = document.createElement('span');
        star.setAttribute('aria-hidden', 'true');
        star.textContent = '★';
        label.append(' · ', star, ' Preferred source');
        target.appendChild(label);
      }
      keep.add(label);
    }
    for (const el of document.querySelectorAll('[' + LABEL + ']')) if (!keep.has(el)) el.remove();
  }

  // ---------- promoting ----------
  //
  // Each preferred result is moved to just above the first other result,
  // ordered by priority rank, then by original order. Only the result itself
  // moves: Google sometimes groups several results (and "People also ask",
  // Videos...) in one container, and moving the container dragged them all
  // above the real top result.
  //
  // A result is only moved when it isn't already in place, and only put back
  // when it stops being preferred or the extension is turned off: apply()
  // re-runs on every page change, including our own moves, so anything else
  // would move it back and forth forever.

  const moved = new Map();   // moved result -> comment marking its original spot

  // Result titles, not counting sitelinks under a result (<h3 aria-level="4">).
  function mainTitles(el) {
    return [...el.querySelectorAll('a h3')].filter(h => !(Number(h.getAttribute('aria-level')) > 3));
  }

  // The whole result: its card, widened to take in its sitelinks and wrapper
  // as long as no other result comes with it.
  function unitOf(card, anc) {
    let u = card;
    while (u.parentElement && u.parentElement !== anc && mainTitles(u.parentElement).length === 1) u = u.parentElement;
    return u;
  }

  function promote(anc, preferred) {
    const best = new Map();   // unit -> best rank, in page order
    for (const c of preferred) {
      const u = unitOf(c.card, anc);
      best.set(u, Math.min(best.get(u) ?? Infinity, c.rank));
    }
    const units = [...best.keys()].sort((a, b) => best.get(a) - best.get(b));   // stable: page order within a rank
    const want = new Set(units);

    // Put back results that are no longer preferred.
    for (const [u, marker] of moved) {
      if (want.has(u)) continue;
      if (marker.isConnected) marker.parentNode.insertBefore(u, marker);
      marker.remove();
      moved.delete(u);
    }
    if (!anc || !units.length) return;

    // The first block holding a result that isn't one we're promoting.
    const ours = h => units.some(u => u.contains(h));
    const ref = [...anc.children].find(k => !want.has(k) && mainTitles(k).some(h => !ours(h)));
    if (!ref) return;

    // Last to first, so each goes just before the one after it. Results found
    // by a background search (pinned) sit between the promoted results and
    // the rest; they don't count as being in the way, or the two would keep
    // moving each other.
    const nextOf = el => { let n = el.nextElementSibling; while (n && n.hasAttribute(PINNED)) n = n.nextElementSibling; return n; };
    let next = ref;
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      if (!(u.parentElement === anc && nextOf(u) === next)) {
        if (!moved.has(u)) {
          const marker = document.createComment('dp: promoted result moved from here');
          u.parentNode.insertBefore(marker, u);
          moved.set(u, marker);
        }
        let at = next;
        while (at.previousElementSibling && at.previousElementSibling.hasAttribute(PINNED)) at = at.previousElementSibling;
        anc.insertBefore(u, at);
      }
      next = u;
    }
  }

  // ---------- background search for starred domains ----------

  function removePinned() {
    for (const el of document.querySelectorAll('[' + PINNED + ']')) el.remove();
  }

  function currentQuery() {
    const p = new URLSearchParams(location.search);
    const q = p.get('q');
    if (!q) return null;
    if ((p.get('start') || '0') !== '0') return null; // first page only
    if (!onAllResultsTab()) return null;               // skip images/news/etc.
    if (/\bsite:/i.test(q)) return null;               // user already scoped the search
    return q;
  }

  function snippetOf(card, link) {
    let best = '';
    for (const el of card.querySelectorAll('div, span')) {
      if (el.contains(link) || link.contains(el)) continue;
      const t = el.textContent.replace(/\s+/g, ' ').trim();
      if (t.length > best.length && t.length < 600) best = t;
    }
    return best.slice(0, 300);
  }

  // Image data we'll draw: a plain raster image embedded in the page, so it
  // needs no request and can't carry script. Capped so the session cache
  // stays small.
  const IMAGE_DATA = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
  const okImage = src => typeof src === 'string' && src.length < 200000 && IMAGE_DATA.test(src) ? src : null;

  // The site name sits in the row above the URL line (<cite>), as for the
  // label on promoted results.
  function siteNameOf(card, link) {
    const cite = link.querySelector('cite') || card.querySelector('cite');
    const row = cite && cite.parentElement && cite.parentElement.previousElementSibling;
    const name = row && row.textContent.replace(/\s+/g, ' ').trim();
    return name && name.length <= 60 ? name : null;
  }

  // Google gives result thumbnails a placeholder and fills them in from a
  // script string elsewhere in the page: 'data:image/…' followed shortly by
  // the image's id. Read it from the raw HTML when we have it; in a rendered
  // page (the iframe path) the image already has its real source.
  function thumbnailOf(card, html) {
    const img = card.querySelector('img[id]');
    if (!img) return null;
    const own = okImage(img.getAttribute('src'));
    if (own && !own.startsWith('data:image/gif')) return own;
    if (!html) return null;
    const re = /'(data:image\/(?:png|jpeg|webp);base64,[^']{50,})'/g;
    let m;
    while ((m = re.exec(html))) {
      if (!html.slice(re.lastIndex, re.lastIndex + 300).includes(img.id)) continue;
      // Undo the script string's escapes (\x3d for "=", "\/" for "/").
      const src = m[1].replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, '/');
      return okImage(src);
    }
    return null;
  }

  // The result for `domain` in a background-search page: everything the
  // pinned card draws. html is the page's raw HTML, when we have it.
  function extractHit(doc, domain, html) {
    const root = doc.querySelector('#rso') || doc.querySelector('#search') || doc.body;
    if (!root) return null;
    const c = findCards(root).find(x => x.host === domain || x.host.endsWith('.' + domain));
    if (!c) return null;
    const icon = [...c.link.querySelectorAll('img')].map(i => okImage(i.getAttribute('src')))
      .find(src => src && !src.startsWith('data:image/gif'));
    return {
      title: c.h3.textContent.trim(), href: c.url.href, snippet: snippetOf(c.card, c.link),
      siteName: siteNameOf(c.card, c.link), icon: icon || null, thumbnail: thumbnailOf(c.card, html),
    };
  }

  async function fetchHit(q, domain) {
    const url = '/search?q=' + encodeURIComponent('site:' + domain + ' ' + q);

    // 1) Cheap path: fetch the HTML and parse it.
    const res = await fetch(url, { credentials: 'include' });
    if (res.url.includes('/sorry/') || !res.ok) throw new Error('blocked');
    // Inline handlers (onclick="…") are stripped first: the parsed document
    // gets this page's CSP, and Chrome logs a violation for every handler
    // attribute it parses, even though nothing in a parsed document runs.
    const html = (await res.text()).replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
    const hit = extractHit(new DOMParser().parseFromString(html, 'text/html'), domain, html);
    if (hit) return hit;

    // 2) If Google's HTML needs JavaScript to render results, load it in a
    //    hidden same-origin iframe and read the rendered DOM.
    return await new Promise(resolve => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;opacity:0';
      f.setAttribute('aria-hidden', 'true');
      const done = v => { clearTimeout(t); f.remove(); resolve(v); };
      const t = setTimeout(() => done(null), 8000);
      f.addEventListener('load', () => {
        setTimeout(() => {
          try { done(extractHit(f.contentDocument, domain)); } catch { done(null); }
        }, 600);
      });
      f.src = url;
      document.body.appendChild(f);
    });
  }

  // Starred domains (up to 3, chosen in the popup) are looked for in the
  // background when they have no result on page 1: one extra Google search
  // each, cached per search for the tab session. What's found is pinned
  // just below the promoted results, in priority order. A CAPTCHA or error
  // stops all looking for the rest of the tab session.
  const MAX_STARRED = 3;
  const SEP = '\u001f';                // between query and domain in a pinned result's id
  const fetching = new Set();          // ids being searched now

  const hostMatches = (host, d) => host === d || host.endsWith('.' + d);

  async function lookForStarred(cards, root) {
    const q = currentQuery();
    const starred = settings.starred
      .filter(d => settings.domains.includes(d))
      .sort((a, b) => settings.domains.indexOf(a) - settings.domains.indexOf(b));
    const missing = q ? starred.filter(d => !cards.some(c => hostMatches(c.host.replace(/^www\./, ''), d))) : [];

    // Drop pinned results that are no longer wanted (unstarred, now on the
    // page, or from an earlier search).
    for (const el of document.querySelectorAll('[' + PINNED + ']')) {
      const [pq, pd] = el.getAttribute(PINNED).split(SEP);
      if (pq !== q || !missing.includes(pd)) el.remove();
    }
    if (!missing.length || sessionStorage.getItem('dp-blocked')) return;

    for (const domain of missing) {
      const id = q + SEP + domain;
      if (fetching.has(id) || pinnedFor(id)) continue;
      const key = 'dp-hit:' + domain + ':' + q;
      let hit;
      const cached = sessionStorage.getItem(key);
      if (cached) {
        hit = JSON.parse(cached);
      } else {
        fetching.add(id);
        try {
          hit = (await fetchHit(q, domain)) || { none: true };
          sessionStorage.setItem(key, JSON.stringify(hit));
        } catch {
          // Google served a CAPTCHA or error: stop trying for this tab session.
          sessionStorage.setItem('dp-blocked', '1');
          return;
        } finally {
          fetching.delete(id);
        }
      }
      if (hit.none || currentQuery() !== q || pinnedFor(id)) continue;
      insertPinned(hit, id, domain);
    }
  }

  function pinnedFor(id) {
    return [...document.querySelectorAll('[' + PINNED + ']')].find(el => el.getAttribute(PINNED) === id);
  }

  // Below the promoted results and any earlier pinned ones (priority order),
  // above the first result that isn't preferred.
  function insertPinned(hit, id, domain) {
    const host = document.createElement('div');
    host.setAttribute(PINNED, id);
    host.style.margin = '0 0 24px';
    const shadow = host.attachShadow({ mode: 'open' });
    const u = new URL(hit.href);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

    // Laid out like a Google result: icon, site name and address, title,
    // then the snippet with the thumbnail beside it. Google's own menu (⋮)
    // can't be copied; the label on the name line says where it came from.
    const style = document.createElement('style');
    style.textContent = `
      :host{display:block}
      .wrap{font-family:Arial,sans-serif;max-width:652px;color:#202124}
      a{text-decoration:none;color:inherit;display:block}
      .head{display:flex;align-items:center;gap:12px;margin-bottom:4px}
      .icon{width:28px;height:28px;flex:none;border-radius:50%;background:#f1f3f4;display:flex;align-items:center;justify-content:center;overflow:hidden;font:bold 13px/1 Arial,sans-serif;color:#4d5156}
      .icon img{width:100%;height:100%;object-fit:cover}
      .who{display:flex;flex-direction:column;min-width:0}
      .name{font-size:14px;line-height:20px;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .url{font-size:12px;line-height:18px;color:#4d5156;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      h3{font:400 22px/28px "Google Sans",Arial,sans-serif;color:#1a0dab;margin:0 0 3px}
      a:hover h3{text-decoration:underline}
      a:focus-visible{outline:2px solid #1a73e8;outline-offset:2px;border-radius:4px}
      .body{display:flex;gap:16px;align-items:flex-start}
      .snip{flex:1;font-size:14px;line-height:22px;color:#4d5156}
      .thumb{width:92px;height:92px;flex:none;border-radius:8px;object-fit:cover}
      @media (prefers-color-scheme:dark){
        .wrap,.name{color:#dadce0}.url,.snip{color:#bdc1c6}h3{color:#99c3ff}
        .icon{background:#303134;color:#bdc1c6}}`;
    const wrap = el('div', 'wrap');
    const a = el('a');
    a.href = hit.href;
    const head = el('div', 'head');
    const icon = el('span', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    if (hit.icon) {
      const img = el('img');
      img.src = hit.icon;
      img.alt = '';
      icon.append(img);
    } else {
      icon.textContent = (hit.siteName || u.hostname.replace(/^www\./, ''))[0].toUpperCase();
    }
    const who = el('span', 'who');
    const name = el('span', 'name', (hit.siteName || u.hostname.replace(/^www\./, '')) + ' · ');
    const star = el('span', '', '★');
    star.setAttribute('aria-hidden', 'true');
    name.append(star, ' Preferred source · found by Domain Priority');
    const path = u.pathname.split('/').filter(Boolean).slice(0, 2).map(seg => { try { return decodeURIComponent(seg); } catch { return seg; } });
    who.append(name, el('span', 'url', [u.origin, ...path].join(' › ')));
    head.append(icon, who);
    a.append(head, el('h3', '', hit.title));
    wrap.append(a);
    if (hit.snippet || hit.thumbnail) {
      const body = el('div', 'body');
      body.append(el('div', 'snip', hit.snippet || ''));
      if (hit.thumbnail) {
        const thumb = el('img', 'thumb');
        thumb.src = hit.thumbnail;
        thumb.alt = '';
        body.append(thumb);
      }
      wrap.append(body);
    }
    shadow.append(style, wrap);

    const root = resultsRoot();
    if (!root) return;
    const cards = findCards(root);
    const anc = commonAncestor(cards.map(c => c.card)) || root;
    const firstOther = cards.find(c => c.rank < 0);
    let ref = firstOther ? childOf(anc, firstOther.card) : null;
    // Keep pinned results in priority order among themselves.
    const rank = d => settings.domains.indexOf(d);
    const after = [...anc.querySelectorAll(':scope > [' + PINNED + ']')]
      .find(el => rank(el.getAttribute(PINNED).split(SEP)[1]) > rank(domain));
    if (after) ref = after;
    if (ref) anc.insertBefore(host, ref);
    else anc.append(host);
  }

  // ---------- wiring ----------

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 150);
  }

  function loadSettings(raw) {
    const domains = (raw.domains || DEFAULTS.domains).map(normalizeDomain).filter(Boolean);
    settings = {
      enabled: raw.enabled ?? DEFAULTS.enabled,
      domains,
      highlight: raw.highlight ?? DEFAULTS.highlight,
      // Starred domains: those in the list, at most 3. Before stars existed,
      // the "Pin a result" option looked for the top domain only.
      starred: (Array.isArray(raw.starred) ? raw.starred.map(normalizeDomain)
        : raw.fallback && domains.length ? [domains[0]] : [])
        .filter(d => domains.includes(d)).slice(0, MAX_STARRED),
      inlineButtons: raw.inlineButtons ?? DEFAULTS.inlineButtons,
      sitelinks: raw.sitelinks ?? DEFAULTS.sitelinks,
      chips: raw.chips ?? DEFAULTS.chips,
      hide: { ...DEFAULT_HIDE, ...(raw.hide || {}) },
    };
  }

  chrome.storage.sync.get(DEFAULTS, raw => {
    loadSettings(raw);
    apply();
    // Re-run when Google adds results (continuous scroll, in-page navigation).
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', () => requestAnimationFrame(() => { if (zoomed) updateZoom(); else positionButtons(); }));
  });

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== 'sync') return;
    chrome.storage.sync.get(DEFAULTS, raw => {
      loadSettings(raw);
      removePinned();
      apply();
    });
  });

  // Development only (the background ignores these in store installs). A
  // test script on the page can:
  //   window.dispatchEvent(new Event('dp-dev-reload'))   reload the unpacked extension
  //   document.documentElement.dataset.dpDevSet = '{"sitelinks":false}';
  //   window.dispatchEvent(new Event('dp-dev-set'))      change settings ("hide"
  //                                                      changes only the sections it names)
  // (The values travel in an attribute because event details don't cross
  // from the page's scripts to this one.)
  const devSend = msg => { try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch { /* already reloaded */ } };
  window.addEventListener('dp-dev-reload', () => devSend({ type: 'dp-dev-reload' }));
  //   document.documentElement.dataset.dpDevPreview = 'aiOverview';
  //   window.dispatchEvent(new Event('dp-dev-preview'))  act as if the popup points at a section ('' = none)
  //   window.dispatchEvent(new Event('dp-dev-report'))   writes a JSON audit of this page to
  //   document.documentElement.dataset.dpDevReport (see devReport below)
  if (!('update_url' in chrome.runtime.getManifest())) {
    window.addEventListener('dp-dev-preview', () => {
      const html = document.documentElement;
      previewKey = html.dataset.dpDevPreview || null;
      delete html.dataset.dpDevPreview;
      applyPreview();
    });
    window.addEventListener('dp-dev-report', () => {
      document.documentElement.dataset.dpDevReport = JSON.stringify(devReport());
    });
  }

  // A survey of the page for testing: what the extension recognised, how big
  // each section's box is (and whether it swallowed results or the pager),
  // which headings it didn't recognise, and what promotion did.
  function devReport() {
    const text = el => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60);
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const root = resultsRoot();
    const scope = document.getElementById('rcnt') || document.getElementById('main') || document.body;
    const cards = root ? findCards(root) : [];
    const known = new Set(sectionHeadings(scope).map(h => h.el));
    const blocks = lastSections.map(s => s.block);
    const candidates = [...scope.querySelectorAll(HEADING_SEL + ', [role="region"][aria-label]')]
      .filter(el => !el.closest('a, [role="dialog"], g-menu') && !(Number(el.getAttribute('aria-level')) > 3))
      .filter(el => !el.parentElement.closest('h2, h3, [role="heading"]'));
    const unknown = candidates
      .filter(el => !known.has(el) && !blocks.some(b => b.contains(el)) && !cards.some(c => c.card.contains(el)))
      .map(el => ({ text: el.getAttribute('aria-label') || text(el), tag: el.tagName.toLowerCase(), visible: vis(el), el }))
      // Not sections: the pager's "Next"/"Previous", and Google's location
      // line above local results ("Seattle, WA ∙ Choose area").
      .filter(u => u.text && !/^(next|previous)$/i.test(u.text) &&
        !/choose area$/i.test((u.el.parentElement?.parentElement?.textContent || '').trim()))
      .map(({ el, ...u }) => u);
    let markers = 0;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    while (walk.nextNode()) if (/^dp: promoted/.test(walk.currentNode.data)) markers++;
    return {
      applyRuns,
      domains: settings.domains, starred: settings.starred,
      pinned: [...document.querySelectorAll('[' + PINNED + ']')].map(el => el.getAttribute(PINNED).split(SEP)[1]),
      onAllTab: onAllResultsTab(),
      enabled: settings.enabled,
      hide: settings.hide,
      sections: lastSections.map(s => ({
        key: s.key, hiddenSetting: !!settings.hide[s.key], visible: vis(s.block),
        height: Math.round(s.block.getBoundingClientRect().height) || null,
        resultsInside: mainTitles(s.block).length, pagerInside: hasPager(s.block), text: text(s.block),
        // Google heads each group of real search results with a (hidden)
        // "Web results" heading; titles without one are the section's own
        // links, such as sources cited in "Things to know".
        webGroupsInside: [...s.block.querySelectorAll(HEADING_SEL)].filter(h => WEB_HEADING.test(headingText(h))).length,
      })),
      unknownHeadings: unknown,
      // Every heading on the page (not inside a result's title link), for
      // the heading inventory: its text, the text matched against section
      // names, which section it names (if any), which section's box it sits
      // in (if any), and where on the page it is.
      headings: [...scope.querySelectorAll('h1, h2, h3, h4, [role="heading"]')]
        .filter(el => !el.closest('a') && !el.parentElement.closest('h1, h2, h3, h4, [role="heading"]'))
        .map(el => {
          const known = sectionHeadings(el.parentElement).find(h => h.el === el);
          return {
            text: text(el), match: headingText(el).slice(0, 80),
            level: el.getAttribute('aria-level') || el.tagName.toLowerCase(),
            visible: vis(el),
            names: known ? known.key : null,
            inside: (lastSections.find(s => s.block.contains(el)) || {}).key || null,
            area: el.closest('#rhs') ? 'right' : el.closest('#center_col') ? 'main' : 'other',
          };
        })
        .filter(h => h.text),
      cards: cards.length,
      gotoLinks: root ? root.querySelectorAll('a[href^="/goto?"]').length : 0,
      firstHosts: cards.filter(c => vis(c.card)).slice(0, 6).map(c => c.host.replace(/^www\./, '') + (c.rank >= 0 ? ' ★' : '')),
      preferredOnPage: lastPromoted, moved: markers,
      labels: document.querySelectorAll('[' + LABEL + ']').length,
      sitelinksHidden: document.querySelectorAll('[' + SITELINKS + ']').length,
      chipsHidden: document.querySelectorAll('[' + CHIPS + ']').length,
      zoomed,
    };
  }
  window.addEventListener('dp-dev-set', () => {
    const html = document.documentElement;
    let values = null;
    try { values = JSON.parse(html.dataset.dpDevSet || 'null'); } catch { /* ignore bad JSON */ }
    delete html.dataset.dpDevSet;
    if (values) devSend({ type: 'dp-dev-set', values });
  });

  // Exposed for tests only (harmless in production).
  globalThis.__domainPriority = { findCards, rankOf, resolveHref, apply, normalizeDomain, extractHit,
    sectionHeadings, collectSections, hideSections, loadSettings, positionButtons, get settings() { return settings; } };
})();
