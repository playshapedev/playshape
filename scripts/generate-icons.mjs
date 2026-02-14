#!/usr/bin/env node

/**
 * Generates all favicon and app icon assets from the source SVG logo.
 *
 * Outputs:
 *   public/favicon.svg        — SVG favicon (modern browsers)
 *   public/favicon.ico         — ICO with 16x16 + 32x32 (legacy browsers)
 *   public/favicon-16x16.png   — 16px PNG
 *   public/favicon-32x32.png   — 32px PNG
 *   public/apple-touch-icon.png — 180x180 PNG (iOS)
 *   public/icon-192.png        — 192px PNG (PWA)
 *   public/icon-512.png        — 512px PNG (PWA)
 *   build/icons/icon.png       — 1024x1024 PNG (Electron source)
 *   build/icons/icon.icns      — macOS app icon (via iconutil)
 *   build/icons/icon.ico       — Windows app icon
 *
 * Usage: node scripts/generate-icons.mjs
 */

import sharp from 'sharp'
import { copyFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SVG_PATH = join(ROOT, 'app/assets/playshape-logo.svg')
const PUBLIC_DIR = join(ROOT, 'public')
const BUILD_ICONS_DIR = join(ROOT, 'build/icons')

// Ensure output directories exist
mkdirSync(PUBLIC_DIR, { recursive: true })
mkdirSync(BUILD_ICONS_DIR, { recursive: true })

/**
 * Render SVG to PNG at a given size (square, with padding for breathing room).
 * The SVG is rendered at native aspect ratio, then composited onto a square canvas.
 */
async function svgToPng(size, outputPath) {
  // Render SVG at high density to the target size, fitting within the square
  // Add ~12% padding so the icon has breathing room
  const padding = Math.round(size * 0.12)
  const innerSize = size - padding * 2

  const rendered = await sharp(SVG_PATH, { density: Math.max(300, size * 3) })
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  // Composite onto a square transparent canvas
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: rendered, gravity: 'center' }])
    .png()
    .toFile(outputPath)

  console.log(`  Created ${outputPath} (${size}x${size})`)
}

/**
 * Build a squircle path string (continuous superellipse) for the given bounds.
 */
function squirclePath(x, y, w, h, cornerRadius) {
  const r = cornerRadius
  const k = r * 0.44 // control point factor for continuous corner (Apple-style)

  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `C ${x + w - k} ${y} ${x + w} ${y + k} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h - r}`,
    `C ${x + w} ${y + h - k} ${x + w - k} ${y + h} ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `C ${x + k} ${y + h} ${x} ${y + h - k} ${x} ${y + h - r}`,
    `L ${x} ${y + r}`,
    `C ${x} ${y + k} ${x + k} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ')
}

/**
 * Generate a macOS-style squircle background as an SVG, with drop shadow and
 * a subtle inner shine/outline inspired by macOS Tahoe (26).
 *
 * macOS Big Sur+ icons are NOT masked by the OS — the app provides the shape.
 * The squircle occupies ~83.6% of the 1024x1024 canvas (856/1024), centered,
 * leaving room for the drop shadow. Corner radius is ~22.37% of squircle width.
 *
 * Effects:
 *  - Drop shadow: subtle dark blur beneath the shape (like native app icons)
 *  - Inner shine: thin semi-transparent white stroke along the inside edge
 */
function macosSquircleSvg(canvasSize) {
  // Squircle occupies 83.6% of canvas (856/1024), leaving margin for shadow
  const squircleSize = canvasSize * 0.836
  const offset = (canvasSize - squircleSize) / 2
  const r = squircleSize * 0.2237

  const x = offset
  const y = offset
  const w = squircleSize
  const h = squircleSize

  const mainPath = squirclePath(x, y, w, h, r)

  // Shadow: slightly offset down, blurred
  const shadowBlur = canvasSize * 0.02
  const shadowOffsetY = canvasSize * 0.008
  const shadowOpacity = 0.35

  // Inner shine: thin inset stroke
  const shineWidth = canvasSize * 0.003
  const shineOpacity = 0.25

  // Double the stroke width since clipping cuts the outer half
  const strokeWidth = shineWidth * 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="${shadowOffsetY}" stdDeviation="${shadowBlur}" flood-color="#000" flood-opacity="${shadowOpacity}"/>
    </filter>
    <clipPath id="squircleClip">
      <path d="${mainPath}"/>
    </clipPath>
  </defs>
  <path d="${mainPath}" fill="#2E3086" filter="url(#shadow)"/>
  <path d="${mainPath}" fill="none" stroke="rgba(255,255,255,${shineOpacity})" stroke-width="${strokeWidth}" clip-path="url(#squircleClip)"/>
</svg>`
}

/**
 * Render SVG to PNG on a macOS squircle-shaped colored background.
 * The icon has the proper macOS Big Sur+ squircle shape with transparent
 * corners so it matches native app icons in the dock.
 * The logo is centered within the squircle with appropriate padding.
 */
async function svgToPngWithBg(size, outputPath) {
  // Logo padding: ~12% of squircle area (not canvas) for breathing room
  const squircleSize = size * 0.836
  const logoPadding = Math.round(squircleSize * 0.12)
  const innerSize = Math.round(squircleSize - logoPadding * 2)

  // Render the logo
  const rendered = await sharp(SVG_PATH, { density: Math.max(300, size * 3) })
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  // Render the squircle background
  const squircleBg = Buffer.from(macosSquircleSvg(size))

  // Composite: transparent canvas -> squircle bg -> logo centered
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: squircleBg, gravity: 'center' },
      { input: rendered, gravity: 'center' },
    ])
    .png()
    .toFile(outputPath)

  console.log(`  Created ${outputPath} (${size}x${size}, macOS squircle)`)
}

/**
 * Create a multi-size ICO file from PNG buffers.
 * ICO format: header + directory entries + image data
 */
function createIco(pngBuffers, outputPath) {
  const numImages = pngBuffers.length

  // ICO header: 6 bytes
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = ICO
  header.writeUInt16LE(numImages, 4) // number of images

  // Each directory entry: 16 bytes
  const dirSize = numImages * 16
  let dataOffset = 6 + dirSize

  const dirEntries = []
  for (const png of pngBuffers) {
    // Parse PNG to get dimensions
    const metadata = { width: 0, height: 0 }
    // PNG header: 8 bytes signature, then IHDR chunk
    // IHDR starts at byte 16 (8 sig + 4 length + 4 type), width at 16, height at 20
    metadata.width = png.readUInt32BE(16)
    metadata.height = png.readUInt32BE(20)

    const entry = Buffer.alloc(16)
    entry.writeUInt8(metadata.width >= 256 ? 0 : metadata.width, 0)
    entry.writeUInt8(metadata.height >= 256 ? 0 : metadata.height, 1)
    entry.writeUInt8(0, 2) // color palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8) // image size
    entry.writeUInt32LE(dataOffset, 12) // offset to image data

    dirEntries.push(entry)
    dataOffset += png.length
  }

  const ico = Buffer.concat([header, ...dirEntries, ...pngBuffers])
  writeFileSync(outputPath, ico)
  console.log(`  Created ${outputPath} (ICO, ${numImages} sizes)`)
}

/**
 * Create macOS .icns using iconutil (requires macOS).
 */
async function createIcns(outputPath) {
  const iconsetDir = join(BUILD_ICONS_DIR, 'icon.iconset')
  mkdirSync(iconsetDir, { recursive: true })

  // macOS iconset requires these specific filenames and sizes
  const sizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ]

  for (const { name, size } of sizes) {
    await svgToPngWithBg(size, join(iconsetDir, name))
  }

  try {
    execSync(`iconutil -c icns -o "${outputPath}" "${iconsetDir}"`)
    console.log(`  Created ${outputPath} (ICNS)`)
  }
  catch {
    console.warn(`  Warning: iconutil failed (not on macOS?). Skipping .icns generation.`)
  }

  // Clean up iconset directory
  rmSync(iconsetDir, { recursive: true, force: true })
}

async function main() {
  console.log('Generating icons from', SVG_PATH)
  console.log()

  // ── Web favicons ──────────────────────────────────────────────────────
  console.log('Web favicons:')

  // SVG favicon (just copy)
  copyFileSync(SVG_PATH, join(PUBLIC_DIR, 'favicon.svg'))
  console.log(`  Copied favicon.svg`)

  // PNG favicons
  await svgToPng(16, join(PUBLIC_DIR, 'favicon-16x16.png'))
  await svgToPng(32, join(PUBLIC_DIR, 'favicon-32x32.png'))
  await svgToPng(180, join(PUBLIC_DIR, 'apple-touch-icon.png'))
  await svgToPng(192, join(PUBLIC_DIR, 'icon-192.png'))
  await svgToPng(512, join(PUBLIC_DIR, 'icon-512.png'))

  // ICO (16 + 32)
  const ico16 = await sharp(SVG_PATH, { density: 300 })
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const ico32 = await sharp(SVG_PATH, { density: 300 })
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  createIco([ico16, ico32], join(PUBLIC_DIR, 'favicon.ico'))

  console.log()

  // ── Electron icons ────────────────────────────────────────────────────
  console.log('Electron icons:')

  // 1024x1024 master PNG (with purple bg for macOS dock / electron-builder)
  await svgToPngWithBg(1024, join(BUILD_ICONS_DIR, 'icon.png'))

  // Windows ICO (16, 24, 32, 48, 64, 128, 256) — with squircle bg
  const winSizes = [16, 24, 32, 48, 64, 128, 256]
  const winPngs = []
  for (const size of winSizes) {
    const tmpPath = join(BUILD_ICONS_DIR, `_tmp_win_${size}.png`)
    await svgToPngWithBg(size, tmpPath)
    const buf = await sharp(tmpPath).png().toBuffer()
    winPngs.push(buf)
    rmSync(tmpPath, { force: true })
  }
  createIco(winPngs, join(BUILD_ICONS_DIR, 'icon.ico'))

  // macOS ICNS
  await createIcns(join(BUILD_ICONS_DIR, 'icon.icns'))

  console.log()
  console.log('Done! All icons generated.')
}

main().catch((err) => {
  console.error('Error generating icons:', err)
  process.exit(1)
})
