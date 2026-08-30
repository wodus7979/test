#!/usr/bin/env python3
"""사진 폴더를 통째로 훑어 다녀온 국내 시·군·구를 집계합니다 (서울 제외).

사용법:
    python3 scan_photos.py <사진폴더> [<사진폴더> ...] [-o record.json]

표준 라이브러리만 사용하며, 사진을 읽기만 하고 어디에도 전송하지 않습니다.
결과 JSON을 '우리 여행 발자국' 페이지의 [붙여넣기로 복원]에 넣으면 지도가 채워집니다.
"""
import argparse, json, math, os, struct, sys
from collections import OrderedDict

IMG_EXT = {'.jpg', '.jpeg', '.heic', '.heif', '.png', '.tif', '.tiff', '.webp', '.dng'}
TSIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}


# ---------------------------------------------------------------- EXIF
def _tiff_has_exif_tags(buf, base):
    """TIFF 매직 2바이트만으로는 오탐이 나므로 GPS/Exif IFD 포인터 존재까지 확인."""
    if base < 0 or base + 8 > len(buf):
        return None
    bo = buf[base:base + 2]
    if bo == b'II':
        e = '<'
    elif bo == b'MM':
        e = '>'
    else:
        return None
    if struct.unpack_from(e + 'H', buf, base + 2)[0] != 42:
        return None
    off = struct.unpack_from(e + 'I', buf, base + 4)[0]
    if off < 8 or base + off + 2 > len(buf):
        return None
    n = struct.unpack_from(e + 'H', buf, base + off)[0]
    if not (1 <= n <= 512):
        return None
    for i in range(n):
        p = base + off + 2 + i * 12
        if p + 12 > len(buf):
            return None
        if struct.unpack_from(e + 'H', buf, p)[0] in (0x8825, 0x8769):
            return e
    return None


def _exif_bases(buf):
    """Exif TIFF 블록의 시작 위치 후보들."""
    out = []
    if len(buf) > 4 and buf[0:2] == b'\xff\xd8':          # JPEG: APP1 세그먼트를 따라감
        off = 2
        while off + 4 <= len(buf):
            if buf[off] != 0xFF:
                break
            m = buf[off + 1]
            if m == 0x01 or 0xD0 <= m <= 0xD9:
                off += 2
                continue
            if m == 0xDA:
                break
            ln = struct.unpack_from('>H', buf, off + 2)[0]
            if ln < 2:
                break
            if m == 0xE1 and ln >= 10 and buf[off + 4:off + 10] == b'Exif\x00\x00':
                out.append(off + 10)
            off += 2 + ln
        return out
    i = buf.find(b'Exif\x00\x00')                          # HEIC 등: 마커가 있는 형태
    while i != -1 and len(out) < 8:
        if _tiff_has_exif_tags(buf, i + 6):
            out.append(i + 6)
        i = buf.find(b'Exif\x00\x00', i + 1)
    if out:
        return out
    for magic in (b'II\x2a\x00', b'MM\x00\x2a'):           # 마커 없이 TIFF로 바로 시작하는 형태
        i = buf.find(magic)
        while i != -1 and len(out) < 8:
            if _tiff_has_exif_tags(buf, i):
                out.append(i)
            i = buf.find(magic, i + 1)
    return out


def _read_ifd(buf, base, off, e):
    out = {}
    if off < 0 or off + 2 > len(buf):
        return out
    n = struct.unpack_from(e + 'H', buf, off)[0]
    if n > 512:
        return out
    for i in range(n):
        p = off + 2 + i * 12
        if p + 12 > len(buf):
            break
        tag, typ, cnt = struct.unpack_from(e + 'HHI', buf, p)
        size = TSIZE.get(typ, 0) * cnt
        if not size or cnt > 100000:
            continue
        vo = base + struct.unpack_from(e + 'I', buf, p + 8)[0] if size > 4 else p + 8
        if vo < 0 or vo + min(size, 4) > len(buf):
            continue
        out[tag] = (typ, cnt, vo)
    return out


def _read_val(buf, ent, e):
    if not ent:
        return None
    typ, cnt, vo = ent
    try:
        if typ == 2:
            raw = buf[vo:vo + cnt]
            return raw.split(b'\x00')[0].decode('ascii', 'ignore')
        if typ in (5, 10):
            out = []
            for i in range(cnt):
                a = vo + i * 8
                if a + 8 > len(buf):
                    break
                num, den = struct.unpack_from(e + ('II' if typ == 5 else 'ii'), buf, a)
                out.append(num / den if den else 0.0)
            return out
        if typ == 3:
            v = [struct.unpack_from(e + 'H', buf, vo + i * 2)[0] for i in range(cnt)]
            return v[0] if cnt == 1 else v
        if typ in (4, 9):
            f = 'I' if typ == 4 else 'i'
            v = [struct.unpack_from(e + f, buf, vo + i * 4)[0] for i in range(cnt)]
            return v[0] if cnt == 1 else v
    except Exception:
        return None
    return None


def _exif_date(s):
    if not s or len(s) < 19:
        return None
    try:
        import calendar
        y, mo, d = int(s[0:4]), int(s[5:7]), int(s[8:10])
        h, mi, se = int(s[11:13]), int(s[14:16]), int(s[17:19])
        return calendar.timegm((y, mo, d, h, mi, se, 0, 0, 0)) * 1000
    except Exception:
        return None


def _read_point(buf, base):
    e = _tiff_has_exif_tags(buf, base)
    if e is None:
        # JPEG APP1 경로는 이미 Exif 마커로 검증됐으므로 헤더만 다시 확인
        bo = buf[base:base + 2]
        if bo == b'II':
            e = '<'
        elif bo == b'MM':
            e = '>'
        else:
            return None
        if struct.unpack_from(e + 'H', buf, base + 2)[0] != 42:
            return None
    ifd0 = _read_ifd(buf, base, base + struct.unpack_from(e + 'I', buf, base + 4)[0], e)

    lat = lon = None
    gp = _read_val(buf, ifd0.get(0x8825), e)
    if isinstance(gp, int):
        g = _read_ifd(buf, base, base + gp, e)
        la, lo = _read_val(buf, g.get(2), e), _read_val(buf, g.get(4), e)
        lar = _read_val(buf, g.get(1), e) or 'N'
        lor = _read_val(buf, g.get(3), e) or 'E'
        if isinstance(la, list) and isinstance(lo, list) and len(la) >= 2 and len(lo) >= 2:
            dms = lambda a: a[0] + (a[1] if len(a) > 1 else 0) / 60 + (a[2] if len(a) > 2 else 0) / 3600
            lat = dms(la) * (-1 if lar.upper().startswith('S') else 1)
            lon = dms(lo) * (-1 if lor.upper().startswith('W') else 1)
    if lat is None or not (-90 <= lat <= 90) or not (-180 <= lon <= 180) or (lat == 0 and lon == 0):
        return None

    t = None
    ep = _read_val(buf, ifd0.get(0x8769), e)
    if isinstance(ep, int):
        ex = _read_ifd(buf, base, base + ep, e)
        t = _exif_date(_read_val(buf, ex.get(0x9003), e)) or _exif_date(_read_val(buf, ex.get(0x9004), e))
    if not t:
        t = _exif_date(_read_val(buf, ifd0.get(0x0132), e))
    return (lat, lon, t)


def read_photo(path):
    """사진 한 장에서 (위도, 경도, 촬영시각ms) 또는 None."""
    try:
        size = os.path.getsize(path)
        is_jpeg = path.lower().endswith(('.jpg', '.jpeg'))
        head = 262144 if is_jpeg else 2097152
        with open(path, 'rb') as f:
            buf = f.read(head)
        for base in _exif_bases(buf):
            r = _read_point(buf, base)
            if r:
                return r
        if not is_jpeg and size > head and size <= 40 * 1024 * 1024:
            with open(path, 'rb') as f:
                buf = f.read()
            for base in _exif_bases(buf):
                r = _read_point(buf, base)
                if r:
                    return r
    except Exception:
        return None
    return None


def read_takeout(path):
    """구글 테이크아웃 메타데이터 JSON에서 좌표 목록."""
    try:
        with open(path, encoding='utf-8') as f:
            j = json.load(f)
    except Exception:
        return []
    arr = j if isinstance(j, list) else [j]
    out = []
    for it in arr:
        if not isinstance(it, dict):
            continue
        g = it.get('geoData') or {}
        lat, lon = g.get('latitude'), g.get('longitude')
        if not lat and not lon:
            g = it.get('geoDataExif') or {}
            lat, lon = g.get('latitude'), g.get('longitude')
        try:
            lat, lon = float(lat), float(lon)
        except (TypeError, ValueError):
            continue
        if lat == 0 and lon == 0:
            continue
        t = None
        ts = (it.get('photoTakenTime') or {}).get('timestamp')
        if ts:
            try:
                t = int(ts) * 1000
            except ValueError:
                t = None
        out.append((lat, lon, t))
    return out


# ---------------------------------------------------------------- 지역 판정
class Regions:
    KOREA = (124.0, 32.5, 132.3, 39.3)

    def __init__(self, geo):
        self.name, self.short = geo['name'], geo['short']
        self.d = []
        for it in geo['sgg']:
            rings = []
            for flat in it['r']:
                pts, x, y = [], 0, 0
                for i in range(0, len(flat), 2):
                    x += flat[i]; y += flat[i + 1]
                    pts.append((x / 1e4, y / 1e4))
                rings.append(pts)
            self.d.append((it['c'], it['n'], it['b'], rings))
        self.k = math.cos(math.radians(35.9))
        self._cache = {}

    @staticmethod
    def _inside(lon, lat, ring):
        c = False
        n = len(ring)
        j = n - 1
        for i in range(n):
            xi, yi = ring[i]; xj, yj = ring[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                c = not c
            j = i
        return c

    def _seg(self, px, py, a, b):
        x1, y1 = a; x2, y2 = b
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(px - x1, py - y1)
        t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))

    def find(self, lat, lon):
        """(코드, 이름) 또는 None. 좌표를 100m 격자로 묶어 캐시."""
        key = (round(lat, 3), round(lon, 3))
        if key in self._cache:
            return self._cache[key]
        r = self._find(lat, lon)
        self._cache[key] = r
        return r

    def _find(self, lat, lon):
        a, b, c, d = self.KOREA
        if not (a <= lon <= c and b <= lat <= d):
            return None
        for code, nm, bb, rings in self.d:
            if not (bb[0] <= lon <= bb[2] and bb[1] <= lat <= bb[3]):
                continue
            for ring in rings:
                if self._inside(lon, lat, ring):
                    return (code, nm)
        # 해안·섬에서 경계를 살짝 벗어난 좌표는 최근접 시·군·구로 보정
        best, bd = None, float('inf')
        px = lon * self.k
        for code, nm, bb, rings in self.d:
            if not (bb[0] - 0.6 <= lon <= bb[2] + 0.6 and bb[1] - 0.6 <= lat <= bb[3] + 0.6):
                continue
            for ring in rings:
                for i in range(len(ring) - 1):
                    x1, y1 = ring[i]; x2, y2 = ring[i + 1]
                    dd = self._seg(px, lat, (x1 * self.k, y1), (x2 * self.k, y2))
                    if dd < bd:
                        bd, best = dd, (code, nm)
        return best if best and bd * 111 <= 60 else None


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description='사진 폴더에서 다녀온 국내 시·군·구를 집계합니다 (서울 제외).')
    ap.add_argument('folders', nargs='+', help='사진이 있는 폴더 (하위 폴더까지 훑습니다)')
    ap.add_argument('-o', '--out', default='record.json', help='결과 JSON 경로 (기본: record.json)')
    ap.add_argument('--geo', default=None, help='geo.json 경로 (기본: 이 스크립트 옆)')
    args = ap.parse_args()

    geo_path = args.geo or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'geo.json')
    if not os.path.exists(geo_path):
        sys.exit('geo.json 을 찾을 수 없습니다: %s' % geo_path)
    with open(geo_path, encoding='utf-8') as f:
        reg = Regions(json.load(f))

    targets = []
    for folder in args.folders:
        if os.path.isfile(folder):
            targets.append(folder)
            continue
        for root, _dirs, names in os.walk(folder):
            for nm in names:
                ext = os.path.splitext(nm)[1].lower()
                if ext in IMG_EXT or ext == '.json':
                    targets.append(os.path.join(root, nm))
    if not targets:
        sys.exit('사진을 찾지 못했습니다.')

    log = {}
    m = {'files': 0, 'gps': 0, 'seoul': 0, 'abroad': 0}
    for i, path in enumerate(targets, 1):
        if os.path.splitext(path)[1].lower() == '.json':
            pts = read_takeout(path)
            m['files'] += max(len(pts), 1)
        else:
            r = read_photo(path)
            pts = [r] if r else []
            m['files'] += 1
        for lat, lon, t in pts:
            m['gps'] += 1
            hit = reg.find(lat, lon)
            if not hit:
                m['abroad'] += 1
                continue
            code, _nm = hit
            if code.startswith('11'):
                m['seoul'] += 1
                continue
            e = log.setdefault(code, {'n': 0, 'first': None, 'last': None})
            e['n'] += 1
            if t:
                if e['first'] is None or t < e['first']:
                    e['first'] = t
                if e['last'] is None or t > e['last']:
                    e['last'] = t
        if i % 200 == 0 or i == len(targets):
            print('  %d / %d 읽는 중...' % (i, len(targets)), file=sys.stderr)

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump({'d': log, 'm': m}, f, ensure_ascii=False, separators=(',', ':'))

    names = {c: n for c, n, _b, _r in reg.d}
    by_sido = OrderedDict()
    for code, e in sorted(log.items(), key=lambda kv: -kv[1]['n']):
        by_sido.setdefault(code[:2], []).append((code, e))
    print()
    print('다녀온 시·군·구 %d곳 · 시·도 %d곳 (서울 제외)' % (len(log), len(by_sido)))
    print('사진 %d장 중 위치 있는 사진 %d장 · 서울 %d장 제외 · 국내 밖 %d장'
          % (m['files'], m['gps'], m['seoul'], m['abroad']))
    print()
    for sc, items in sorted(by_sido.items(), key=lambda kv: -sum(e['n'] for _c, e in kv[1])):
        tot = sum(e['n'] for _c, e in items)
        print('%-10s %4d장  %s' % (reg.name[sc], tot, ', '.join('%s(%d)' % (names[c], e['n']) for c, e in items)))
    print()
    print('→ %s 를 열어 내용을 복사한 뒤, 지도 페이지의 [붙여넣기로 복원]에 붙여넣으세요.' % args.out)


if __name__ == '__main__':
    main()
