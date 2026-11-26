# Builds the zip to upload to the Chrome Web Store: only the files the
# extension loads, nothing from tests/, tools/ or store/.
# Usage: python tools/package.py   ->  dist/domain-priority-<version>.zip
import json
import pathlib
import re
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ['manifest.json', 'background.js', 'sections.js', 'content.js', 'early.css',
         'popup.html', 'popup.js', 'options.html', 'options.js', 'ui.css',
         'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png']

manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))

# Every file the manifest or the pages name must be in the package.
named = set()
def walk(v):
    if isinstance(v, str) and re.search(r'\.(js|css|html|png)$', v): named.add(v)
    elif isinstance(v, dict): [walk(x) for x in v.values()]
    elif isinstance(v, list): [walk(x) for x in v]
walk(manifest)
for page in ('popup.html', 'options.html'):
    named.update(re.findall(r'(?:src|href)="([^":]+\.(?:js|css))"', (ROOT / page).read_text(encoding='utf-8')))
missing = sorted(n for n in named if n not in FILES)
if missing: raise SystemExit(f'Named but not packaged: {missing}')
for f in FILES:
    if not (ROOT / f).is_file(): raise SystemExit(f'Missing file: {f}')
if len(manifest['description']) > 132: raise SystemExit('Manifest description is over 132 characters')

out = ROOT / 'dist' / f"domain-priority-{manifest['version']}.zip"
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in FILES: z.write(ROOT / f, f)
print(f'{out.relative_to(ROOT)}: {len(FILES)} files, {out.stat().st_size // 1024} KB')
