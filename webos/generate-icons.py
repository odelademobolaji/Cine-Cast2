"""
Generate CineCast PNG icons for webOS without external libraries.
Run: python3 generate-icons.py
"""
import struct
import zlib
import math


def make_icon(size):
    cx = size / 2
    cy = size / 2
    pixels = []

    for y in range(size):
        row = []
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            outer_r = size * 0.42
            inner_r = size * 0.26

            # Round outer bounding box (squircle corners)
            corner = size * 0.18
            in_squircle = (
                x >= corner and x <= size - corner and
                y >= 0 and y <= size
            ) or (
                x >= 0 and x <= size and
                y >= corner and y <= size - corner
            ) or dist < size * 0.47

            # Background colour
            r, g, b = 10, 10, 10

            if in_squircle:
                # Red "C" ring: exclude ~60° gap on the right side
                angle_deg = math.degrees(math.atan2(dy, dx))
                gap = abs(angle_deg) < 28  # right-side opening

                if inner_r < dist < outer_r and not gap:
                    r, g, b = 229, 9, 20          # Netflix red
                elif dist <= inner_r * 0.55:
                    r, g, b = 229, 9, 20          # centre dot

            row.append((r, g, b))
        pixels.extend(row)

    def chunk(name: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(name + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    rows = []
    for y in range(size):
        row_bytes = b'\x00'
        for x in range(size):
            r, g, b = pixels[y * size + x]
            row_bytes += bytes([r, g, b])
        rows.append(row_bytes)

    compressed = zlib.compress(b''.join(rows), 9)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )


for name, size in [('icon.png', 80), ('largeIcon.png', 130), ('splash.png', 540)]:
    with open(name, 'wb') as f:
        f.write(make_icon(size))
    print(f'Created {name} ({size}x{size})')
