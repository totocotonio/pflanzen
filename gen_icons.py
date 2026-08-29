"""Erzeugt die App-Icons für Grünzeug (PNG + ICO).

Aufruf:  python gen_icons.py
Ergebnis: icon-192.png, icon-512.png, icon-maskable.png, favicon.ico
"""
from PIL import Image, ImageDraw, ImageChops

S = 1024                      # Arbeitsauflösung
GRUEN_HELL = (48, 209, 88)
GRUEN_DUNKEL = (30, 138, 61)
WEISS = (255, 255, 255)


def verlauf(size, oben, unten):
    """Vertikaler Farbverlauf."""
    img = Image.new("RGB", (1, size))
    px = img.load()
    for y in range(size):
        f = y / (size - 1)
        px[0, y] = tuple(round(oben[i] + (unten[i] - oben[i]) * f) for i in range(3))
    return img.resize((size, size))


def blatt_maske(size, scale=1.0):
    """Linsenförmiges Blatt (Schnittmenge zweier Kreise), 45 Grad gedreht."""
    gross = size * 2
    r = int(gross * 0.42 * scale)
    m = size  # Mittelpunkt im vergrößerten Bild
    versatz = int(r * 0.55)

    a = Image.new("L", (gross, gross), 0)
    ImageDraw.Draw(a).ellipse([m - versatz - r, m - r, m - versatz + r, m + r], fill=255)
    b = Image.new("L", (gross, gross), 0)
    ImageDraw.Draw(b).ellipse([m + versatz - r, m - r, m + versatz + r, m + r], fill=255)

    linse = ImageChops.darker(a, b).rotate(-45, resample=Image.BICUBIC, center=(m, m))
    return linse.crop((m - size // 2, m - size // 2, m + size // 2, m + size // 2))


def rippe_maske(size, scale=1.0):
    """Mittelrippe des Blattes: unten-links (Stielansatz) zur Spitze oben-rechts."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    c = size // 2
    laenge = int(size * 0.34 * scale)
    breite = max(3, int(size * 0.030 * scale))
    d.line([c - laenge, c + laenge, c + laenge, c - laenge],
           fill=255, width=breite, joint="curve")
    return m


def icon(size, blatt_scale=1.0, radius_faktor=0.22):
    bg = verlauf(S, GRUEN_HELL, GRUEN_DUNKEL)
    blatt = blatt_maske(S, blatt_scale)
    img = Image.composite(Image.new("RGB", (S, S), WEISS), bg, blatt)
    # Rippen in Grün auf das weiße Blatt
    rippen = ImageChops.darker(rippe_maske(S, blatt_scale), blatt)
    img = Image.composite(Image.new("RGB", (S, S), GRUEN_DUNKEL), img, rippen)

    # abgerundete Ecken
    maske = Image.new("L", (S, S), 0)
    ImageDraw.Draw(maske).rounded_rectangle([0, 0, S - 1, S - 1],
                                           radius=int(S * radius_faktor), fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), maske)
    return out.resize((size, size), Image.LANCZOS)


def maskable(size):
    """Vollflächig, Motiv auf 60 % geschrumpft (Safe Zone der Android-Masken)."""
    bg = verlauf(S, GRUEN_HELL, GRUEN_DUNKEL).convert("RGBA")
    blatt = blatt_maske(S, 0.50)
    bg = Image.composite(Image.new("RGBA", (S, S), WEISS + (255,)), bg, blatt)
    rippen = ImageChops.darker(rippe_maske(S, 0.50), blatt)
    bg = Image.composite(Image.new("RGBA", (S, S), GRUEN_DUNKEL + (255,)), bg, rippen)
    return bg.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    icon(192, 0.68).save("icon-192.png")
    icon(512, 0.68).save("icon-512.png")
    maskable(512).save("icon-maskable.png")
    icon(180, 0.68).save("apple-touch-icon.png")
    icon(256, 0.68).save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (256, 256)])
    print("Icons erzeugt: icon-192.png, icon-512.png, icon-maskable.png, apple-touch-icon.png, favicon.ico")
