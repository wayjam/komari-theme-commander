// Rasterize public/favicon.svg into the PNG/ICO icon set used by the PWA
// manifest, Apple touch icon and browser favicons.
// Keep public/favicon.svg free of CSS variables: sharp/librsvg may not resolve
// them, which makes generated PNG/ICO thumbnails render nearly black.
//
//   pnpm run icons   (see package.json)
//
// Outputs (all into public/):
//   pwa-192.png, pwa-512.png      — manifest "any" icons
//   maskable-512.png              — manifest "maskable" icon (extra safe padding)
//   apple-touch-icon.png (180)    — iOS home-screen icon (opaque bg)
//   favicon-16.png / favicon-32.png / favicon.ico — classic favicons
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import sharp from "sharp"
import pngToIco from "png-to-ico"

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, "..", "public")
const BG = "#0a0e14"

const svg = await readFile(resolve(publicDir, "favicon.svg"))

async function render(size, file, { background } = {}) {
  let img = sharp(svg, { density: 384 }).resize(size, size, { fit: "contain" })
  if (background) img = img.flatten({ background })
  const out = resolve(publicDir, file)
  await img.png().toFile(out)
  console.log("✓", file)
}

// Maskable: SVG already has ~12% inset (rounded plate), but Android maskable
// crops up to 20% on each side. Re-wrap with extra padding so the globe stays
// inside the safe zone regardless of mask shape.
async function renderMaskable() {
  const inner = 360 // content box inside 512 (≈70%) → safe under circular mask
  const pad = Math.round((512 - inner) / 2)
  const content = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: "contain" })
    .png()
    .toBuffer()
  const out = resolve(publicDir, "maskable-512.png")
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: BG },
  })
    .composite([{ input: content, top: pad, left: pad }])
    .png()
    .toFile(out)
  console.log("✓", "maskable-512.png")
}

await render(192, "pwa-192.png")
await render(512, "pwa-512.png")
await renderMaskable()
await render(180, "apple-touch-icon.png", { background: BG })
await render(32, "favicon-32.png")
await render(16, "favicon-16.png")

const ico = await pngToIco([
  resolve(publicDir, "favicon-32.png"),
  resolve(publicDir, "favicon-16.png"),
])
await writeFile(resolve(publicDir, "favicon.ico"), ico)
console.log("✓", "favicon.ico")
