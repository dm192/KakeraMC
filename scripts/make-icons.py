"""
Generates the launcher icon from the same shard geometry the UI uses, so the
packaging resources never drift from the product mark.

Usage: python scripts/make-icons.py
Writes build/icon.png (1024x1024, alpha) which electron-builder converts to
.ico/.icns for each target.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
SCALE = SIZE / 24  # the mark is authored in a 24x24 viewBox
BG = (11, 12, 14, 255)
BORDER = (36, 39, 46, 255)
ACCENT = (226, 162, 75, 255)
FACET = (226, 162, 75, 140)


def p(x: float, y: float) -> tuple[float, float]:
    return (x * SCALE, y * SCALE)


def main() -> None:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    radius = int(0.22 * SIZE)
    draw.rounded_rectangle(
        (0, 0, SIZE - 1, SIZE - 1), radius=radius, fill=BG, outline=BORDER, width=6
    )

    shard = [p(12, 2.5), p(20, 9), p(16.5, 21), p(7.5, 21), p(4, 9)]
    draw.line(shard + [shard[0]], fill=ACCENT, width=18, joint="curve")

    inner = [
        (p(4, 9), p(20, 9)),
        (p(12, 2.5), p(8.5, 21)),
        (p(12, 2.5), p(15.5, 21)),
    ]
    for start, end in inner:
        draw.line([start, end], fill=FACET, width=8)

    build = Path(__file__).resolve().parent.parent / "build"
    build.mkdir(parents=True, exist_ok=True)
    image.save(build / "icon.png", format="PNG")
    print(f"wrote {build / 'icon.png'} ({image.size[0]}x{image.size[1]})")


if __name__ == "__main__":
    main()
