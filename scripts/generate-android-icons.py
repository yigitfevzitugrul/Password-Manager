"""Generates the Android launcher icons and splash screens from Image/icon.png.

Usage: python scripts/generate-android-icons.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
SPLASH_BACKGROUND = (6, 7, 10, 255)  # the app's dark background

icon = Image.open(ROOT / 'Image' / 'icon.png').convert('RGBA')
# The icon's own background colour fills the area around it in adaptive icons
background = icon.getpixel((icon.width // 2, 6))

DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def centered(size, canvas_color, icon_share):
    canvas = Image.new('RGBA', size, canvas_color)
    side = round(min(size) * icon_share)
    scaled = icon.resize((side, side), Image.LANCZOS)
    canvas.alpha_composite(scaled, ((size[0] - side) // 2, (size[1] - side) // 2))
    return canvas


for name, scale in DENSITIES.items():
    folder = RES / f'mipmap-{name}'
    legacy = round(48 * scale)
    icon.resize((legacy, legacy), Image.LANCZOS).save(folder / 'ic_launcher.png')
    icon.resize((legacy, legacy), Image.LANCZOS).save(folder / 'ic_launcher_round.png')
    adaptive = round(108 * scale)
    centered((adaptive, adaptive), (0, 0, 0, 0), 0.6).save(folder / 'ic_launcher_foreground.png')

(RES / 'values' / 'ic_launcher_background.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    f'    <color name="ic_launcher_background">#{background[0]:02X}{background[1]:02X}{background[2]:02X}</color>\n'
    '</resources>\n', encoding='utf-8')

for splash in RES.glob('drawable*/splash.png'):
    size = Image.open(splash).size
    centered(size, SPLASH_BACKGROUND, 0.28).convert('RGB').save(splash)

print('background', background)
