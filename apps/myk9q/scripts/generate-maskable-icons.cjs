/**
 * Generate Maskable Icons for PWA
 *
 * Creates properly-padded maskable icons from the source logo.
 * Maskable icons need an 80% safe zone - content should be in the center
 * with padding around the edges for Android adaptive icons.
 *
 * Usage: node scripts/generate-maskable-icons.js
 */

const sharp = require('sharp');
const path = require('path');

// Configuration
const SOURCE_IMAGE = path.join(__dirname, '../public/myK9Q-teal-512.png');
const OUTPUT_DIR = path.join(__dirname, '../public');

// For maskable icons, logo should be ~65% of canvas to stay in safe zone
// Background is transparent - the teal logo shows on whatever background the OS provides
const LOGO_SCALE = 0.65;

async function generateMaskableIcon(size, outputName) {
  console.log(`Generating ${size}x${size} maskable icon...`);

  // Calculate logo size (65% of canvas)
  const logoSize = Math.round(size * LOGO_SCALE);
  const padding = Math.round((size - logoSize) / 2);

  // Resize the source logo
  const resizedLogo = await sharp(SOURCE_IMAGE)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer();

  // Create canvas with transparent background and composite the logo centered
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
    }
  })
    .composite([
      {
        input: resizedLogo,
        top: padding,
        left: padding
      }
    ])
    .png()
    .toFile(path.join(OUTPUT_DIR, outputName));

  console.log(`  ✓ Created ${outputName}`);
}

async function main() {
  console.log('Generating maskable icons with proper safe zone padding...\n');
  console.log(`Source: ${SOURCE_IMAGE}`);
  console.log(`Background: transparent`);
  console.log(`Logo scale: ${LOGO_SCALE * 100}% of canvas\n`);

  try {
    // Generate both sizes
    await generateMaskableIcon(512, 'myK9Q-teal-maskable-512.png');
    await generateMaskableIcon(192, 'myK9Q-teal-maskable-192.png');

    console.log('\n✅ Done! Maskable icons generated successfully.');
    console.log('\nThe icons now have proper safe zone padding for Android adaptive icons.');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

main();
