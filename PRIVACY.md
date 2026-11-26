# Privacy policy for Domain Priority

Last updated: 25 November 2026

Domain Priority is a browser extension that changes how Google Search™
results pages look in your own browser: it puts results from domains you
choose first and hides the result sections you don't want. This policy
describes everything it does with your data.

## What it reads

The extension runs only on Google Search results pages
(`https://www.google.com/search…`). There it reads the page, including your
search and its results, to find results from your preferred domains and the
sections you chose to hide. This happens entirely inside your browser.

## What it stores

Your settings: whether the extension is on, your list of preferred and
starred domains, which sections to hide, and the display options on the
settings page. They are saved with the browser's extension storage
(`chrome.storage.sync`). If you have turned on sync in your browser, the
browser copies them to your other signed-in devices; that copy is handled by
your browser and your browser account, not by this extension.

For starred domains, results already looked up are remembered for the
current tab only, so the same search isn't sent twice.

## What it sends, and to whom

Only one thing ever leaves your browser: when you have starred a domain and
it has no result on the first page, the extension runs one extra Google
search for it, the same as typing `site:example.org` followed by your search
into Google. That search goes to Google (`www.google.com`) from your browser,
like any search you make, so Google's own privacy policy applies to it. It is
sent at most once per starred domain per search, and not at all if you star
no domains.

The extension sends nothing to its developer or to anyone else. It has no
analytics, no advertising, no tracking and no remote code, and it does not
sell or share any data.

## Your choices

- Unstar every domain to stop the extra searches entirely.
- Switch the extension off from its toolbar button, or remove it, to stop it
  reading Google's pages.
- "Show all sections" and clearing your domain list on the settings page
  undo your choices.

## Contact

Questions about this policy: open an issue in the project's repository, or
use the contact details on the extension's Chrome Web Store page.

Google Search is a trademark of Google LLC. Domain Priority is not made,
endorsed or sponsored by Google.
