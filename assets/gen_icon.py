import struct
import zlib

def write_png(filename, width, height, pixels):
    def make_chunk(name, data):
        crc = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)

    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)

    raw = b''
    for y in range(height):
        raw += b'\x00'
        for x in range(width):
            raw += pixels[y][x]

    idat_data = zlib.compress(raw, 9)

    with open(filename, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(make_chunk(b'IHDR', ihdr_data))
        f.write(make_chunk(b'IDAT', idat_data))
        f.write(make_chunk(b'IEND', b''))

size = 18
pixels = []
for y in range(size):
    row = []
    for x in range(size):
        cx = x - size / 2 + 0.5
        cy = y - size / 2 + 0.5
        dist = (cx**2 + cy**2) ** 0.5
        r = size / 2
        if dist <= r - 1:
            row.append(bytes([108, 99, 255, 255]))
        elif dist <= r:
            alpha = int((r - dist) * 255)
            row.append(bytes([108, 99, 255, alpha]))
        else:
            row.append(bytes([0, 0, 0, 0]))
    pixels.append(row)

write_png('/Users/samehgeorge/Bannerflow/Repositories/claude-hack/hacks/neura-focus/assets/tray-icon.png', size, size, pixels)
print('tray icon created')
