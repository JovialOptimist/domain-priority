# Usage: python tools/make-icons.py icons
# Draws the extension icon: a blue rounded square holding three result lines,
# the top one led by a star (the "preferred source" that goes first).
import math, sys
from PIL import Image, ImageDraw
OUT = sys.argv[1]
BLUE = (47, 95, 196, 255); WHITE = (255, 255, 255, 255); PALE = (171, 191, 231, 255)   # white at 60% over the blue, solid

def star(cx, cy, r):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts

def art(size):
    S = 1024
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=BLUE)
    h = S * 0.11
    d.polygon(star(S * 0.27, S * 0.30, S * 0.15), fill=WHITE)
    d.rounded_rectangle([S * 0.46, S * 0.30 - h / 2, S * 0.82, S * 0.30 + h / 2], radius=h / 2, fill=WHITE)
    for y in (0.55, 0.76):
        d.rounded_rectangle([S * 0.18, S * y - h / 2, S * 0.82, S * y + h / 2], radius=h / 2, fill=PALE)
    return im.resize((size, size), Image.LANCZOS)

for n in (16, 32, 48):
    art(n).save(f'{OUT}/icon{n}.png')
# Store and extensions-page icon: 96x96 artwork inside 16 px of transparent padding.
c = Image.new('RGBA', (128, 128), (0, 0, 0, 0)); c.paste(art(96), (16, 16)); c.save(f'{OUT}/icon128.png')
