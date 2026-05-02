/**
 * Pixel-diff test: screenshot vs reference.png
 * Threshold: ≤ 2% different pixels
 * Viewport: iPhone 13 (390×844), then crop to reference height (670px)
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF_PATH    = path.join(__dirname, 'reference.png');
const SHOT_PATH   = path.join(__dirname, 'screenshot.png');
const DIFF_PATH   = path.join(__dirname, 'diff.png');
const PAGE_URL    = `http://localhost:3000/index.html`;

// Reference dims
const REF_W = 530;
const REF_H = 670;

// We'll render at the same pixel width as the reference (530px device pixels)
// iPhone 13 has deviceScaleFactor=3 but we'll use 1 to keep things simple,
// rendering at exactly 530px width.
const VIEWPORT_W  = 530;
const VIEWPORT_H  = 670;
const THRESHOLD   = 0.02; // 2% max diff

async function run() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: 1
  });

  await page.goto(PAGE_URL, { waitUntil: 'networkidle' });

  // Wait for Heebo font to load
  await page.waitForTimeout(1500);

  await page.screenshot({ path: SHOT_PATH, clip: { x: 0, y: 0, width: VIEWPORT_W, height: VIEWPORT_H } });
  await browser.close();

  // Resize screenshot to exactly match reference dims (in case of rounding)
  await sharp(SHOT_PATH)
    .resize(REF_W, REF_H, { fit: 'fill' })
    .png()
    .toFile(SHOT_PATH + '.resized.png');

  // Load both images
  const ref  = PNG.sync.read(fs.readFileSync(REF_PATH));
  const shot = PNG.sync.read(fs.readFileSync(SHOT_PATH + '.resized.png'));

  const { width, height } = ref;
  const diff = new PNG({ width, height });

  const mismatch = pixelmatch(
    ref.data, shot.data, diff.data,
    width, height,
    { threshold: 0.25, includeAA: false }
  );

  fs.writeFileSync(DIFF_PATH, PNG.sync.write(diff));

  const totalPixels  = width * height;
  const diffPct      = (mismatch / totalPixels) * 100;
  const passed       = diffPct <= (THRESHOLD * 100);

  console.log(`\n──────────────────────────────`);
  console.log(`Total pixels  : ${totalPixels}`);
  console.log(`Diff pixels   : ${mismatch}`);
  console.log(`Diff %        : ${diffPct.toFixed(2)}%`);
  console.log(`Threshold     : ${(THRESHOLD * 100).toFixed(0)}%`);
  console.log(`Result        : ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Diff image    : ${DIFF_PATH}`);
  console.log(`──────────────────────────────\n`);

  process.exit(passed ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
