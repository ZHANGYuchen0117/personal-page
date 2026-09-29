#!/usr/bin/env python3
"""把整站打包成一个独立 HTML 文件（单文件版）。

用途：发到微信 / 邮件 / AirDrop 里的一个文件，双击就能看，
不需要服务器、不需要网络托管；联网时 AI 问答、社区、反馈照常可用。

用法：
  python3 tools/build-single.py -o share.html
  python3 tools/build-single.py -o share.html --also ../path/to/copy.html
"""

import argparse
import base64
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AVATAR_SRC = ROOT / "assets" / "img" / "avatar.jpg"
AVATAR_MAX = 256          # 单文件版头像压到这个边长以内，控制体积
AVATAR_QUALITY = 82


def avatar_data_url() -> str:
    """头像转成内嵌 data URL（压缩后），失败就返回空串。"""
    if not AVATAR_SRC.exists():
        return ""
    try:
        from PIL import Image  # type: ignore

        img = Image.open(AVATAR_SRC)
        img = img.convert("RGB")
        img.thumbnail((AVATAR_MAX, AVATAR_MAX))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=AVATAR_QUALITY, optimize=True)
        data = buf.getvalue()
    except Exception:
        data = AVATAR_SRC.read_bytes()
    return "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", required=True, help="输出文件（相对仓库根目录）")
    ap.add_argument("--also", action="append", default=[], help="额外再写一份（可多次）")
    args = ap.parse_args()

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    avatar = avatar_data_url()

    # 1) 内联样式
    css_dir = ROOT / "assets" / "css"

    def inline_css(m: "re.Match") -> str:
        name = Path(m.group(1)).name
        css = (css_dir / name).read_text(encoding="utf-8")
        if "</style" in css.lower():
            raise SystemExit("CSS 里含 </style，需要转义：" + name)
        return "<style>\n/* " + name + " */\n" + css + "\n</style>"

    html, n_css = re.subn(
        r'<link rel="stylesheet" href="\./assets/css/([^"]+)">', inline_css, html
    )

    # 2) 内联脚本（data.js 的头像换成内嵌图）
    js_dir = ROOT / "assets" / "js"

    def inline_js(m: "re.Match") -> str:
        name = Path(m.group(1)).name
        js = (js_dir / name).read_text(encoding="utf-8")
        if "</script" in js.lower():
            raise SystemExit("JS 里含 </script，需要转义：" + name)
        if name == "data.js" and avatar:
            js = re.sub(r'avatar:\s*"[^"]*"', 'avatar: "' + avatar + '"', js, count=1)
        return "<script>\n/* " + name + " */\n" + js + "\n</script>"

    html, n_js = re.subn(
        r'<script src="\./assets/js/([^"]+)"></script>', inline_js, html
    )

    # 3) 兜底检查：不能有任何残留外链
    left = re.findall(r'(?:src|href)="\./assets/[^"]*"', html)
    if left:
        print("仍有未内联的资源：", left, file=sys.stderr)
        return 1

    header = (
        "<!-- 单文件版：由 tools/build-single.py 自动生成，请勿直接修改；"
        "改源码后重新生成 -->\n"
    )
    out_html = header + html

    for target in [args.out] + args.also:
        p = Path(target)
        if not p.is_absolute():
            p = ROOT / p
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(out_html, encoding="utf-8")
        print(
            "已生成 %s（%.0f KB，内联 %d 个样式 + %d 个脚本%s）"
            % (
                p,
                p.stat().st_size / 1024,
                n_css,
                n_js,
                "，头像已内嵌" if avatar else "，无头像文件",
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
