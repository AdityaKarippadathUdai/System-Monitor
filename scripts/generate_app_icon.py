import os
import math
import zlib
import struct
import subprocess

def make_png(width, height, rgba):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    raw = bytearray()
    row_bytes = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * row_bytes : (y + 1) * row_bytes])
    idat = chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def dist_segment(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    l2 = dx*dx + dy*dy
    if l2 == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1)*dx + (py - y1)*dy) / l2))
    projx = x1 + t * dx
    projy = y1 + t * dy
    return math.hypot(px - projx, py - projy)

def rounded_box_dist(px, py, bx0, by0, bx1, by1, r):
    cx = (bx0 + bx1) / 2.0
    cy = (by0 + by1) / 2.0
    hw = (bx1 - bx0) / 2.0 - r
    hh = (by1 - by0) / 2.0 - r
    dx = abs(px - cx) - hw
    dy = abs(py - cy) - hh
    outside = math.hypot(max(0.0, dx), max(0.0, dy))
    inside = min(0.0, max(dx, dy))
    return (outside + inside) - r

def blend_pixel(rgba, idx, r, g, b, a):
    if a <= 0.0:
        return
    br = rgba[idx]
    bg = rgba[idx + 1]
    bb = rgba[idx + 2]
    ba = rgba[idx + 3] / 255.0
    
    out_a = a + ba * (1.0 - a)
    if out_a > 0.0:
        out_r = (r * a + br * ba * (1.0 - a)) / out_a
        out_g = (g * a + bg * ba * (1.0 - a)) / out_a
        out_b = (b * a + bb * ba * (1.0 - a)) / out_a
    else:
        out_r, out_g, out_b = 0, 0, 0

    rgba[idx] = int(round(min(255, max(0, out_r))))
    rgba[idx + 1] = int(round(min(255, max(0, out_g))))
    rgba[idx + 2] = int(round(min(255, max(0, out_b))))
    rgba[idx + 3] = int(round(min(255, max(0, out_a * 255.0))))

def generate_master_icon(size=512):
    W, H = size, size
    scale = size / 512.0
    rgba = bytearray(W * H * 4)

    # Squircle geometry
    b_min = 18 * scale
    b_max = 494 * scale
    b_rad = 110 * scale
    border_w = 10 * scale

    # Screen Bezel
    s_x0, s_y0 = 90 * scale, 120 * scale
    s_x1, s_y1 = 422 * scale, 392 * scale
    s_rad = 18 * scale

    # Inner display
    d_x0, d_y0 = 102 * scale, 132 * scale
    d_x1, d_y1 = 410 * scale, 380 * scale
    d_rad = 12 * scale

    # Waveform vertices
    pts_raw = [
        (112, 256), (168, 256), (194, 205), (220, 300),
        (256, 160), (290, 340), (317, 230), (335, 270),
        (355, 256), (400, 256)
    ]
    pts = [(p[0] * scale, p[1] * scale) for p in pts_raw]
    segs = [(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]) for i in range(len(pts)-1)]
    nodes = [(256 * scale, 160 * scale, 7.5 * scale), (290 * scale, 340 * scale, 6.5 * scale)]
    status_dot = (380 * scale, 150 * scale, 6 * scale)

    # 1. Base Squircle & Background
    for y in range(H):
        py = y + 0.5
        t_y = y / H
        for x in range(W):
            px = x + 0.5
            t_x = x / W
            idx = (y * W + x) * 4

            d_box = rounded_box_dist(px, py, b_min, b_max, b_min, b_max, b_rad)
            if d_box > 1.0:
                continue

            alpha_box = min(1.0, max(0.0, 0.5 - d_box))

            if d_box > -border_w:
                t_b = (t_x * 0.7 + t_y * 0.3)
                br_r = 56 * (1.0 - t_b) + 29 * t_b
                br_g = 189 * (1.0 - t_b) + 78 * t_b
                br_b = 248 * (1.0 - t_b) + 216 * t_b
                blend_pixel(rgba, idx, br_r, br_g, br_b, alpha_box)
            else:
                t_grad = (t_x + t_y) * 0.5
                bg_r = 14 * (1.0 - t_grad) + 3 * t_grad
                bg_g = 23 * (1.0 - t_grad) + 6 * t_grad
                bg_b = 38 * (1.0 - t_grad) + 12 * t_grad

                cdist = math.hypot(px - 256 * scale, py - 256 * scale) / (200 * scale)
                if cdist < 1.0:
                    glow = (1.0 - cdist) * 0.25
                    bg_r += 2 * glow * 255
                    bg_g += 132 * glow
                    bg_b += 199 * glow

                blend_pixel(rgba, idx, min(255, bg_r), min(255, bg_g), min(255, bg_b), alpha_box)

            # Bezel / Screen
            d_screen = rounded_box_dist(px, py, s_x0, s_y0, s_x1, s_y1, s_rad)
            if d_screen <= 1.0:
                a_screen = min(1.0, max(0.0, 0.5 - d_screen))
                blend_pixel(rgba, idx, 30, 41, 59, a_screen * 0.8)

            d_disp = rounded_box_dist(px, py, d_x0, d_y0, d_x1, d_y1, d_rad)
            if d_disp <= 1.0:
                a_disp = min(1.0, max(0.0, 0.5 - d_disp))
                blend_pixel(rgba, idx, 3, 7, 18, a_disp * 0.95)

    # 2. Waveform & Glow
    for y in range(int(140 * scale), int(370 * scale)):
        py = y + 0.5
        for x in range(int(105 * scale), int(405 * scale)):
            px = x + 0.5
            idx = (y * W + x) * 4

            d_line = min(dist_segment(px, py, s[0], s[1], s[2], s[3]) for s in segs)

            glow_rad = 18 * scale
            if d_line < glow_rad:
                glow_factor = (1.0 - (d_line / glow_rad)) ** 2
                blend_pixel(rgba, idx, 2, 132, 199, glow_factor * 0.5)

            stroke_rad = 6 * scale
            if d_line < stroke_rad + 1.0:
                a_stroke = min(1.0, max(0.0, stroke_rad + 0.5 - d_line))
                tx = (px - 112 * scale) / (288 * scale)
                sr_r = 56 * (1.0 - tx) + 96 * tx
                sr_g = 189 * (1.0 - tx) + 165 * tx
                sr_b = 248 * (1.0 - tx) + 250 * tx
                blend_pixel(rgba, idx, sr_r, sr_g, sr_b, a_stroke)

            core_rad = 1.8 * scale
            if d_line < core_rad + 1.0:
                a_core = min(1.0, max(0.0, core_rad + 0.5 - d_line))
                blend_pixel(rgba, idx, 255, 255, 255, a_core * 0.95)

    # 3. Nodes
    for nx, ny, nr in nodes:
        for y in range(int(ny - nr * 2.5), int(ny + nr * 2.5) + 1):
            py = y + 0.5
            for x in range(int(nx - nr * 2.5), int(nx + nr * 2.5) + 1):
                px = x + 0.5
                if 0 <= x < W and 0 <= y < H:
                    idx = (y * W + x) * 4
                    d = math.hypot(px - nx, py - ny)
                    if d < nr + 1.0:
                        a = min(1.0, max(0.0, nr + 0.5 - d))
                        if d > nr - 1.5 * scale:
                            blend_pixel(rgba, idx, 56, 189, 248, a)
                        else:
                            blend_pixel(rgba, idx, 255, 255, 255, a)

    # 4. Status dot
    sx, sy, sr = status_dot
    for y in range(int(sy - sr * 2.5), int(sy + sr * 2.5) + 1):
        py = y + 0.5
        for x in range(int(sx - sr * 2.5), int(sx + sr * 2.5) + 1):
            px = x + 0.5
            if 0 <= x < W and 0 <= y < H:
                idx = (y * W + x) * 4
                d = math.hypot(px - sx, py - sy)
                if d < sr + 1.0:
                    a = min(1.0, max(0.0, sr + 0.5 - d))
                    blend_pixel(rgba, idx, 34, 197, 94, a)
                elif d < sr * 1.6:
                    ring_d = abs(d - sr * 1.3)
                    if ring_d < 1.0 * scale:
                        ra = min(1.0, max(0.0, 1.0 * scale - ring_d)) * 0.5
                        blend_pixel(rgba, idx, 34, 197, 94, ra)

    return make_png(W, H, rgba)

if __name__ == '__main__':
    print("Generating master icon...")
    png = generate_master_icon(512)
    with open('public/app-icon.png', 'wb') as f:
        f.write(png)
    print(f"Generated public/app-icon.png ({len(png)} bytes)")
