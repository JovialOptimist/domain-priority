# Testing Domain Priority

Google's results pages change often, so these are checks you run on live
pages rather than a test suite with fixed inputs.

## What's here

- `queries.json`: the standard searches, one per kind of results page, with
  the sections each usually shows, and a few navigation scenarios.
- `audit.js`: a page check. It asks the extension for its development report
  and returns pass/fail results for one page.

## Running it

1. Load the extension unpacked (`chrome://extensions` → Developer mode → Load
   unpacked). The report is only available in that development build.
2. Search for each query in `queries.json`.
3. On each results page, optionally set `window.DP_EXPECT` to the query's
   `expect` list, then paste `audit.js` into the DevTools console (or run it
   through browser automation). Wait about 6 seconds for the result.

## What fails

- A section's box holds a group of search results (Google heads each group
  with a hidden "Web results" heading) or the page links: hiding it would hide
  more than the section.
- A section set to hidden is visible.
- A preferred result is on the page but isn't first.
- The page is shrunk when Edit layout isn't open.

## What warns

- A heading the extension doesn't recognise (maybe a new Google section).
- Link titles inside a section's box without a "Web results" heading. Usually
  the section's own links, such as sources cited in "Things to know".
- An expected section didn't appear (Google doesn't show every section every
  time).
- The page kept changing after it settled (usually Google loading; a steady
  stream would suggest the extension re-running in a loop).

## Development hooks

From the page's own scripts (development build only):

- `window.dispatchEvent(new Event('dp-dev-reload'))` reloads the extension.
  Wait about 4 seconds before loading a new page.
- `document.documentElement.dataset.dpDevSet = '{"chips":false}'` then
  `window.dispatchEvent(new Event('dp-dev-set'))` changes settings.
- `document.documentElement.dataset.dpDevPreview = 'videos'` then
  `window.dispatchEvent(new Event('dp-dev-preview'))` acts as if the popup
  points at a section (`''` for none).
- `window.dispatchEvent(new Event('dp-dev-report'))` writes the report to
  `document.documentElement.dataset.dpDevReport`.
