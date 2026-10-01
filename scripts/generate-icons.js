import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function generateIcons() {
  const publicDir = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const svgPath = path.resolve(publicDir, 'icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  // 1. pwa-192x192.png (High quality Android launcher icon)
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve(publicDir, 'pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // 2. pwa-512x512.png (High quality store / splash icon)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve(publicDir, 'pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // 3. pwa-maskable-512x512.png (Full-bleed vibrant blue background, safe-zone aligned)
  // Seamless edge-to-edge vibrant royal blue so Samsung One UI and Android squircle crops without any dark edge
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Generated pwa-maskable-512x512.png (Full-bleed)');

  // 4. apple-touch-icon.png (180x180 for iOS Home Screen)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // 5. favicon.png (64x64)
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(path.resolve(publicDir, 'favicon.png'));
  console.log('Generated favicon.png');

  console.log('All PWA icons updated and generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
