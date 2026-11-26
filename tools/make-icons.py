# Usage: python tools/make-icons.py icons
# Draws the extension icon: a white crown with ball tips over a band, on a
# blue rounded square. The crown's right half is a paler blue-white, which
# gives it depth. Same geometry as "crown-balls/twotone/blue" in the icon lab,
# on a 128-unit grid.
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
BLUE = (47, 95, 196, 255)          # #2f5fc4
WHITE = (255, 255, 255, 255)
SHADE = (209, 220, 242, 255)       # white mixed 78% into the blue: #d1dcf2

CROWN = [(20, 44), (44, 66), (64, 34), (84, 66), (108, 44), (102, 86), (26, 86)]
BALLS = [(20, 36), (64, 24), (108, 36)]   # radius 11
BAND = (20, 94, 108, 112)                 # x0, y0, x1, y1, corner radius 5
EDGE = 8                                  # rounds the crown's corners, as a stroke of this width would


def glyph(d, k, color):
    """Draws the crown at scale k (units -> pixels) in one colour."""
    pts = [(x * k, y * k) for x, y in CROWN]
    d.polygon(pts, fill=color)
    d.line(pts + [pts[0]], fill=color, width=round(EDGE * k), joint='curve')
    for x, y in pts:   # round each corner
        r = EDGE / 2 * k
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)
    for x, y in BALLS:
        r = 11 * k
        d.ellipse([x * k - r, y * k - r, x * k + r, y * k + r], fill=color)
    x0, y0, x1, y1 = BAND
    d.rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k], radius=5 * k, fill=color)


def art(size):
    S = 1024                     # draw at 8x the 128 grid, then scale down
    k = S / 128
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=28 * k, fill=BLUE)
    glyph(d, k, WHITE)
    # Right half of the crown in the paler shade.
    shade = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    glyph(ImageDraw.Draw(shade), k, SHADE)
    right = Image.new('L', (S, S), 0)
    ImageDraw.Draw(right).rectangle([S // 2, 0, S, S], fill=255)
    im.paste(shade, (0, 0), Image.composite(shade, Image.new('RGBA', (S, S)), right).getchannel('A'))
    return im.resize((size, size), Image.LANCZOS)


for n in (16, 32, 48):
    art(n).save(f'{OUT}/icon{n}.png')
# Store and extensions-page icon: 96x96 artwork inside 16 px of transparent padding.
c = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
c.paste(art(96), (16, 16))
c.save(f'{OUT}/icon128.png')
