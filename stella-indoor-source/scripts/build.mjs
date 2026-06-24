#!/usr/bin/env node
/**
 * Build script for dual-site Firebase Hosting.
 * Generates dist/ (client) and dist-admin/ (admin) from a single Vite build.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const srcDist = path.join(root, 'dist');
const adminDist = path.join(root, 'dist-admin');

// Step 1: Clean ALL previous builds
console.log('🧹 Cleaning previous builds...');
if (fs.existsSync(srcDist)) fs.rmSync(srcDist, { recursive: true, force: true });
if (fs.existsSync(adminDist)) fs.rmSync(adminDist, { recursive: true, force: true });

// Step 2: Run Vite build
console.log('🔨 Running Vite build...');
execSync('npx vite build', { cwd: root, stdio: 'inherit' });

// Step 3: Verify dist was created
if (!fs.existsSync(srcDist)) {
  console.error('❌ dist/ not found after build');
  process.exit(1);
}

// Step 4: Copy dist/ → dist-admin/
console.log('📋 Copying dist/ to dist-admin/...');
fs.cpSync(srcDist, adminDist, { recursive: true, force: true });

// Step 5: Client site — remove admin.html only
console.log('🧹 Cleaning client site...');
if (fs.existsSync(path.join(srcDist, 'admin.html'))) {
  fs.unlinkSync(path.join(srcDist, 'admin.html'));
  console.log('   🗑️  dist/admin.html');
}

// Step 6: Admin site — rename admin.html → index.html
console.log('📝 Preparing admin site...');
if (fs.existsSync(path.join(adminDist, 'index.html'))) {
  fs.unlinkSync(path.join(adminDist, 'index.html'));
  console.log('   🗑️  dist-admin/index.html (client)');
}
if (fs.existsSync(path.join(adminDist, 'admin.html'))) {
  fs.renameSync(
    path.join(adminDist, 'admin.html'),
    path.join(adminDist, 'index.html')
  );
  console.log('   📝 dist-admin/admin.html → index.html');
}

// Step 6b: Remove client-only assets from the admin site so an old cached
// admin HTML can never pull in the client booking app chunks.
const adminHtml = fs.readFileSync(path.join(adminDist, 'index.html'), 'utf-8');
const adminAssetNames = new Set((adminHtml.match(/\/assets\/[^"']+/g) || []).map(m => path.basename(m)));
const adminAssetDir = path.join(adminDist, 'assets');
if (fs.existsSync(adminAssetDir)) {
  for (const filename of fs.readdirSync(adminAssetDir)) {
    if (!adminAssetNames.has(filename)) {
      fs.unlinkSync(path.join(adminAssetDir, filename));
      console.log(`   🗑️  dist-admin/assets/${filename} (client-only)`);
    }
  }
}

// Step 7: Verify both index.html files reference EXISTING assets
console.log('🔍 Verifying asset integrity...');
const verifyAssets = (folder) => {
  const htmlPath = path.join(folder, 'index.html');
  if (!fs.existsSync(htmlPath)) return false;
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const assetMatches = html.match(/\/assets\/[^"']+/g) || [];
  const assetDir = path.join(folder, 'assets');
  for (const match of assetMatches) {
    const filename = path.basename(match);
    if (!fs.existsSync(path.join(assetDir, filename))) {
      console.error(`   ❌ MISSING: assets/${filename}`);
      return false;
    }
    console.log(`   ✅ assets/${filename}`);
  }
  return true;
};

const clientOk = verifyAssets(srcDist);
const adminOk = verifyAssets(adminDist);

if (clientOk && adminOk) {
  console.log('\n✅ Dual-site build complete — all assets verified!');
  process.exit(0);
} else {
  console.error('\n❌ Build failed — asset mismatch!');
  process.exit(1);
}
