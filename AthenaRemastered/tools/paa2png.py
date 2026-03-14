"""Convert Arma 3 PAA (DXTn) textures to PNG files.

Usage:
    python paa2png.py <input_dir_of_paas> <output_dir_for_pngs>
"""
import struct, sys, zlib
from pathlib import Path
from PIL import Image

PAA_TYPE_DXT1 = 0xFF01
PAA_TYPE_DXT5 = 0xFF05
PAA_TYPE_RGBA4 = 0x4444
PAA_TYPE_RGBA5 = 0x1555
PAA_TYPE_RGBA8 = 0x8888
PAA_TYPE_AI88 = 0x8080


def _read_taggs(f):
    """Read PAA TAGG sections. Format: 'GGAT' + 4-char name + u32 len + data."""
    while True:
        sig = f.read(4)
        if len(sig) < 4 or sig != b'GGAT':
            f.seek(-len(sig), 1)
            break
        f.read(4)  # tag name (4 chars)
        data_len = struct.unpack('<I', f.read(4))[0]
        f.read(data_len)  # skip tag data


def _decode_dxt1_block(block):
    c0, c1 = struct.unpack_from('<HH', block, 0)
    bits = struct.unpack_from('<I', block, 4)[0]

    def exp565(c):
        return (((c>>11)&0x1F)*255//31, ((c>>5)&0x3F)*255//63, (c&0x1F)*255//31, 255)

    colors = [exp565(c0), exp565(c1)]
    if c0 > c1:
        colors.append(tuple((2*colors[0][i]+colors[1][i])//3 for i in range(3))+(255,))
        colors.append(tuple((colors[0][i]+2*colors[1][i])//3 for i in range(3))+(255,))
    else:
        colors.append(tuple((colors[0][i]+colors[1][i])//2 for i in range(3))+(255,))
        colors.append((0, 0, 0, 0))

    return [colors[(bits>>(2*i))&3] for i in range(16)]


def _decode_dxt5_block(block):
    a0, a1 = block[0], block[1]
    alphas = [a0, a1]
    if a0 > a1:
        for i in range(1, 7):
            alphas.append(((7-i)*a0 + i*a1) // 7)
    else:
        for i in range(1, 5):
            alphas.append(((5-i)*a0 + i*a1) // 5)
        alphas += [0, 255]

    abits = int.from_bytes(block[2:8], 'little')
    ai = [(abits>>(3*i))&7 for i in range(16)]

    c0, c1 = struct.unpack_from('<HH', block, 8)
    bits = struct.unpack_from('<I', block, 12)[0]

    def exp565(c):
        return (((c>>11)&0x1F)*255//31, ((c>>5)&0x3F)*255//63, (c&0x1F)*255//31)

    cl = [exp565(c0), exp565(c1)]
    cl.append(tuple((2*cl[0][i]+cl[1][i])//3 for i in range(3)))
    cl.append(tuple((cl[0][i]+2*cl[1][i])//3 for i in range(3)))

    return [cl[(bits>>(2*i))&3] + (alphas[ai[i]],) for i in range(16)]


def _place_block(img_data, bx, by, pixels, w, h):
    for py in range(4):
        for px in range(4):
            x, y = bx*4+px, by*4+py
            if x < w and y < h:
                img_data[y*w+x] = pixels[py*4+px]


def decode_paa(filepath):
    with open(filepath, 'rb') as f:
        paa_type = struct.unpack('<H', f.read(2))[0]
        _read_taggs(f)

        pal_count = struct.unpack('<H', f.read(2))[0]
        if pal_count > 0:
            f.read(pal_count * 4)

        w = struct.unpack('<H', f.read(2))[0]
        h = struct.unpack('<H', f.read(2))[0]
        dl = f.read(3)
        data_len = dl[0] | (dl[1] << 8) | (dl[2] << 16)

        if w == 0 or h == 0:
            raise ValueError("Zero-size mipmap")

        data = f.read(data_len)

    if paa_type in (PAA_TYPE_DXT1, PAA_TYPE_DXT5):
        bw, bh = (w+3)//4, (h+3)//4
        bs = 8 if paa_type == PAA_TYPE_DXT1 else 16
        expected = bw * bh * bs

        if len(data) != expected and len(data) > 4:
            for trial in [data[4:], data]:
                try:
                    data = zlib.decompress(trial)
                    break
                except zlib.error:
                    continue

        decode_fn = _decode_dxt1_block if paa_type == PAA_TYPE_DXT1 else _decode_dxt5_block
        img_data = [(0,0,0,0)] * (w*h)

        for by_i in range(bh):
            for bx_i in range(bw):
                off = (by_i*bw+bx_i)*bs
                if off+bs > len(data):
                    break
                _place_block(img_data, bx_i, by_i, decode_fn(data[off:off+bs]), w, h)

        img = Image.new('RGBA', (w, h))
        img.putdata(img_data)
        return img

    else:
        raise ValueError(f"Unsupported PAA type: 0x{paa_type:04X}")


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <input_dir> <output_dir>")
        sys.exit(1)

    input_dir = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    paa_files = sorted(input_dir.glob("*.paa"))
    print(f"Converting {len(paa_files)} PAA files...")

    ok = 0
    for p in paa_files:
        stem = p.stem.replace('_ca', '')
        out = output_dir / f"{stem}.png"
        try:
            img = decode_paa(str(p))
            img.save(str(out))
            ok += 1
            print(f"  OK: {p.name} -> {out.name} ({img.width}x{img.height})")
        except Exception as e:
            print(f"  FAIL: {p.name}: {e}")

    print(f"\nConverted {ok}/{len(paa_files)} files to {output_dir}")


if __name__ == '__main__':
    main()
