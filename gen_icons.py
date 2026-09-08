# -*- coding: utf-8 -*-
"""生成扩展图标（16/48/128）：蓝色圆角方块 + 白色时钟。无第三方依赖，输出 RGBA PNG。"""
import struct
import zlib
import math
import os

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')

BG = (31, 111, 235, 255)      # #1F6FEB
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def inside_rounded_rect(x, y, half, r):
    if x < -half or x > half or y < -half or y > half:
        return False
    cx = min(max(x, -half + r), half - r)
    cy = min(max(y, -half + r), half - r)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= r * r


def dist_to_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    c1 = vx * wx + vy * wy
    if c1 <= 0:
        return math.hypot(px - ax, py - ay)
    c2 = vx * vx + vy * vy
    if c2 <= c1:
        return math.hypot(px - bx, py - by)
    t = c1 / c2
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def sample(x, y, size):
    """返回 (r,g,b,a)，坐标相对中心。"""
    half = size / 2.0
    if not inside_rounded_rect(x, y, half, size * 0.22):
        return TRANSPARENT

    # 时钟圆环
    cx, cy = 0.0, -size * 0.05
    R = size * 0.27
    ring_w = size * 0.06
    d = math.hypot(x - cx, y - cy)
    if R - ring_w <= d <= R:
        return WHITE

    # 指针（12 点方向 + 3 点方向）
    len_p = R * 0.72
    half_w = size * 0.042
    for (ex, ey) in ((0.0, cy - len_p), (len_p, cy)):
        if dist_to_segment(x, y, cx, cy, ex, ey) <= half_w:
            return WHITE

    return BG


def render(size):
    ss = 4
    big = size * ss
    half = big / 2.0
    out = [[(0, 0, 0, 0)] * size for _ in range(size)]

    for py in range(size):
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            n = 0
            for dy in range(ss):
                for dx in range(ss):
                    fx = (px * ss + dx + 0.5 - half) / ss
                    fy = (py * ss + dy + 0.5 - half) / ss
                    r, g, b, a = sample(fx, fy, size)
                    acc[0] += r * (a / 255.0)
                    acc[1] += g * (a / 255.0)
                    acc[2] += b * (a / 255.0)
                    acc[3] += a
                    n += 1
            out[py][px] = (
                int(acc[0] / n + 0.5),
                int(acc[1] / n + 0.5),
                int(acc[2] / n + 0.5),
                int(acc[3] / n + 0.5),
            )

    raw = b''
    for row in out:
        raw += b'\x00'
        for r, g, b, a in row:
            raw += struct.pack('4B', r, g, b, a)
    return raw


def write_png(path, size, raw):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr)
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in (16, 48, 128):
        p = os.path.join(OUT_DIR, 'icon%d.png' % s)
        write_png(p, s, render(s))
        print('生成', p, os.path.getsize(p), 'bytes')
