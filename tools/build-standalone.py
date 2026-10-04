#!/usr/bin/env python3
"""把个人主页打包成一个"单文件 HTML"：CSS / JS / 头像全部内联，零外部依赖。

用途：发给别人时对方双击就能看，也可以直接丢到任意静态托管（不依赖 GitHub Pages）。

用法：
    python3 tools/build-standalone.py                 # 输出 dist/personal-page.html
    python3 tools/build-standalone.py /tmp/preview.html

说明：
- 头像会尝试用 macOS 自带 sips 压到 320px 再内联（体积小很多）；压不了就内联原图。
- 生成后会自检：不能残留 ./assets/ 外部引用，也不能有会截断 <script>/<style> 的字符串。
"""
import base64
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO / 'dist' / 'personal-page.html'
AVATAR = REPO / 'assets' / 'img' / 'avatar.jpg'
AVATAR_MAX = 320
AVATAR_QUALITY = 82


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def shrink_jpeg(src: Path, tmpdir: Path) -> Path:
    """尽量把头像压小；失败就返回原图。"""
    if not shutil.which('sips'):
        return src
    dst = tmpdir / ('avatar-%d.jpg' % AVATAR_MAX)
    try:
        subprocess.run(
            ['sips', '-Z', str(AVATAR_MAX), '-s', 'format', 'jpeg',
             '-s', 'formatOptions', str(AVATAR_QUALITY), str(src), '--out', str(dst)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if dst.exists() and 0 < dst.stat().st_size < src.stat().st_size:
            return dst
    except Exception:
        pass
    return src


def jpeg_size(data: bytes):
    """从 JPEG 字节流里读宽高（只解析标记，不依赖第三方库）。"""
    i = 2
    while i < len(data) - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3):
            h, w = struct.unpack('>HH', data[i + 5:i + 9])
            return w, h
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seg = struct.unpack('>H', data[i + 2:i + 4])[0]
        i += 2 + seg
    return None


def main() -> int:
    out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUT
    html = read(REPO / 'index.html')

    inlined_css, inlined_js = [], []

    def css_repl(m: re.Match) -> str:
        href = m.group(1)
        text = read(REPO / href.lstrip('./'))
        inlined_css.append(href)
        return '<style>/* ' + href + ' */\n' + text + '\n</style>'

    def js_repl(m: re.Match) -> str:
        src = m.group(1)
        text = read(REPO / src.lstrip('./'))
        inlined_js.append(src)
        return '<script>/* ' + src + ' */\n' + text + '\n</script>'

    html, n_css = re.subn(r'<link rel="stylesheet" href="([^"]+)">', css_repl, html)
    html, n_js = re.subn(r'<script src="([^"]+)"></script>', js_repl, html)

    # 单文件版是本地双击打开的：预加载没意义，桌面图标也用不上，
    # 去掉它们能让内联头像只出现一次，体积少一半
    html = re.sub(r'\n<link rel="preload" as="image" href="\./assets/img/avatar\.jpg">', '', html)
    html = re.sub(r'\n<link rel="apple-touch-icon" href="\./assets/img/avatar\.jpg">', '', html)

    with tempfile.TemporaryDirectory() as td:
        avatar_path = shrink_jpeg(AVATAR, Path(td))
        raw = avatar_path.read_bytes()
        avatar_name = avatar_path.name
    b64 = base64.b64encode(raw).decode()
    data_uri = 'data:image/jpeg;base64,' + b64

    # 头像引用可能在 HTML 双引号里，也可能在 JS 单引号里，两种都要换
    n_avatar = 0
    for q in ('"', "'"):
        needle = q + './assets/img/avatar.jpg' + q
        n_avatar += html.count(needle)
        html = html.replace(needle, q + data_uri + q)

    # 联系我二维码：单文件版要么把它内联进来，要么干脆不指向外部路径。
    # （否则双击打开时会去 assets/img/ 找图，找不到就只剩半截信息框）
    n_qr = 0
    for name in ('wechat-qr.png', 'wechat-qr.jpg', 'wechat-qr.jpeg', 'wechat-qr.webp'):
        rel = './assets/img/' + name
        f = REPO / rel.lstrip('./')
        if not f.exists():
            continue
        ext = name.rsplit('.', 1)[1].lower()
        mime = 'image/jpeg' if ext in ('jpg', 'jpeg') else ('image/webp' if ext == 'webp' else 'image/png')
        uri = 'data:%s;base64,%s' % (mime, base64.b64encode(f.read_bytes()).decode())
        for q in ('"', "'"):
            needle = q + rel + q
            if needle in html:
                n_qr += html.count(needle)
                html = html.replace(needle, q + uri + q)
        break
    if n_qr == 0:
        # 二维码文件还没放进仓库：把引用清空，页面会自动隐藏二维码块
        html = re.sub(r"qr:\s*['\"]\./assets/img/[^'\"]+['\"]", "qr: ''", html)

    html = html.replace(
        '<!DOCTYPE html>',
        '<!DOCTYPE html>\n<!--\n'
        '  单文件版：CSS / JS / 头像已全部内联，双击即可打开，也可丢到任意静态托管。\n'
        '  由 personal-page 仓库生成（python3 tools/build-standalone.py），请勿直接手改。\n'
        '-->', 1)

    leftovers = re.findall(r'(?:src|href)="(\./assets/[^"]+)"', html)
    leftovers += re.findall(r'url\([\'"]?\./assets/', html)
    leftovers += re.findall(r'''[\'"]\./assets/[^\'"]+[\'"]''', html)   # JS 里的路径字符串
    breaks = []
    if '</script>' in ''.join(read(REPO / p.lstrip('./')) for p in inlined_js):
        breaks.append('JS 里出现 </script>')
    if '</style>' in ''.join(read(REPO / p.lstrip('./')) for p in inlined_css):
        breaks.append('CSS 里出现 </style>')

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')

    size = jpeg_size(raw)
    print('CSS 内联 %d 个: %s' % (n_css, ', '.join(inlined_css)))
    print('JS  内联 %d 个: %s' % (n_js, ', '.join(inlined_js)))
    print('头像替换 %d 处（%s，%d 字节%s）' % (
        n_avatar, avatar_name, len(raw), '，%dx%d' % size if size else ''))
    print('二维码内联 %d 处%s' % (n_qr, '' if n_qr else '（仓库里还没有二维码图片，已置空避免指向失效路径）'))
    print('残留外部引用: %s' % (leftovers or '无'))
    print('会截断标签的字符串: %s' % (breaks or '无'))
    print('输出: %s  %d 字节 (%.1f KB)' % (out, out.stat().st_size, out.stat().st_size / 1024))
    return 1 if (leftovers or breaks) else 0


if __name__ == '__main__':
    sys.exit(main())