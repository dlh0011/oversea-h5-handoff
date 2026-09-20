#!/usr/bin/env python3
"""TinyPNG-style PNG palette compression for web delivery assets.

The default 128-colour preset keeps the original pixel dimensions and alpha
channel while producing a much smaller, visually acceptable PNG for H5
delivery. Pass a different colour count when a project needs a stronger or
more conservative trade-off.
"""

from pathlib import Path
from PIL import Image
import os
import sys
import tempfile


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("用法：python3 scripts/optimize-pngs-visual.py <交付目录> [颜色数]")
    root = Path(sys.argv[1]).resolve()
    colors = int(sys.argv[2]) if len(sys.argv) > 2 else 128
    if not 2 <= colors <= 256:
        raise SystemExit("颜色数必须在 2 到 256 之间")

    files = sorted(root.rglob("*.png"))
    before = after = changed = 0
    for file in files:
        original_size = file.stat().st_size
        with Image.open(file) as image:
            rgba = image.convert("RGBA")
            optimized = rgba.quantize(
                colors=colors,
                method=Image.Quantize.FASTOCTREE,
                dither=Image.Dither.FLOYDSTEINBERG,
            )
            fd, temporary = tempfile.mkstemp(
                prefix=f"{file.name}.", suffix=".png", dir=file.parent
            )
            os.close(fd)
            try:
                optimized.save(temporary, format="PNG", optimize=True)
                with Image.open(temporary) as check:
                    if check.size != rgba.size or check.mode not in {"P", "RGBA", "LA"}:
                        raise RuntimeError(f"尺寸校验失败：{file}")
                optimized_size = Path(temporary).stat().st_size
                before += original_size
                if optimized_size < original_size:
                    Path(temporary).replace(file)
                    after += optimized_size
                    changed += 1
                else:
                    Path(temporary).unlink()
                    after += original_size
            except Exception:
                try:
                    Path(temporary).unlink()
                except FileNotFoundError:
                    pass
                raise
    print(
        {
            "files": len(files),
            "changed": changed,
            "before": before,
            "after": after,
            "reduction": before - after,
            "reduction_percent": round((before - after) * 100 / before, 2)
            if before
            else 0,
            "colors": colors,
        }
    )


if __name__ == "__main__":
    main()
