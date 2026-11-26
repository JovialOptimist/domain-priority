# Chrome Web Store listing

Text to paste into the Chrome Web Store developer dashboard. Keep it in step
with `manifest.json` and `PRIVACY.md`.

## Store listing tab

**Name** (from the manifest): Domain Priority

**Summary** (from the manifest `description`, 132 characters at most):
Puts results from domains you choose (such as Wikipedia) first on Google Search™ and hides the sections you don’t want, like ads.

**Category:** Productivity (or Search tools, if offered)

**Detailed description:**

> Domain Priority puts the sources you trust first on Google Search™.
>
> Choose your preferred domains, such as wikipedia.org, and whenever one of
> them is on the results page, it moves to the top, marked “★ Preferred
> source”. Star up to three of them, and the extension looks for them with
> one extra search when Google didn’t show them on the first page.
>
> Hide the parts of the results page you don’t want: sponsored results, AI
> Overview, People also ask, top stories, short videos, shopping listings and
> about 30 other section types. Hide a section from the toolbar popup, from a
> small Hide button on the page, or from the settings page.
>
> What it doesn’t do: it collects nothing, sends nothing to its developer, and
> has no ads or tracking. The only network request it makes is the optional
> Google search for a starred domain. See the privacy policy for details.
>
> Works on Google Search in English. Sections are recognised by their English
> headings, so on other interface languages most section toggles have no
> effect.
>
> Google Search is a trademark of Google LLC. Domain Priority is not made,
> endorsed or sponsored by Google.

**Images** (see `store/` for files):
- Store icon: `icons/icon128.png` (inside the package).
- Screenshots: at least one, 1280×800 PNG, full bleed.
- Small promo tile 440×280: optional; listings without one are shown after
  listings that have one.

## Privacy practices tab

**Single purpose:**
Shows Google Search results the way the user chooses: results from the
user’s preferred domains first, and the result sections the user picked
hidden.

**Permission justifications:**
- `storage`: saves the user’s settings (preferred domains, hidden sections,
  display options) and syncs them through the browser.
- Host access to `https://www.google.com/search*` (content script): reads and
  rearranges the results page in the user’s browser, and runs the optional
  Google search for a starred domain that has no result on the page.

**Remote code:** No, I am not using remote code.

**Data usage** (our reading of the user-data FAQ; check the boxes the
dashboard shows):
- Web browsing activity: the extension reads the user’s Google searches and
  results in the browser, and sends one Google search per missing starred
  domain to Google. Used only for those features.
- Website content: it reads the results page to rearrange it.
- Nothing is sold, transferred to third parties, used for unrelated
  purposes, or used for creditworthiness.

**Privacy policy URL:** a public link to `PRIVACY.md` (the repository is
private, so it must be published somewhere public first).
