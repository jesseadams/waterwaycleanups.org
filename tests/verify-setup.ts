/**
 * Verification script to check Playwright setup
 * Run with: npx ts-node tests/verify-setup.ts
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function verifySetup() {
  console.log('🔍 Verifying Playwright setup...\n');

  // Check if required directories exist
  const requiredDirs = [
    'tests/e2e',
    'tests/e2e/auth',
    'tests/e2e/waiver',
    'tests/e2e/rsvp',
    'tests/e2e/minors',
    'tests/fixtures',
    'tests/pages',
    'tests/utils',
  ];

  console.log('📁 Checking directory structure...');
  for (const dir of requiredDirs) {
    if (fs.existsSync(dir)) {
      console.log(`  ✅ ${dir}`);
    } else {
      console.log(`  ❌ ${dir} - MISSING`);
    }
  }

  // Check if config files exist
  console.log('\n📄 Checking configuration files...');
  const configFiles = [
    'playwright.config.ts',
    'tsconfig.json',
    '.env.test.example',
    'tests/README.md',
  ];

  for (const file of configFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ ${file}`);
    } else {
      console.log(`  ❌ ${file} - MISSING`);
    }
  }

  // Check if browsers are installed
  console.log('\n🌐 Checking browser installations...');
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    console.log('  ✅ Chromium installed and working');
  } catch (error) {
    console.log('  ❌ Chromium not working:', error);
  }

  // Check package.json scripts
  console.log('\n📦 Checking npm scripts...');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  const requiredScripts = [
    'test:e2e',
    'test:e2e:headed',
    'test:e2e:debug',
    'test:e2e:report',
  ];

  for (const script of requiredScripts) {
    if (packageJson.scripts[script]) {
      console.log(`  ✅ ${script}`);
    } else {
      console.log(`  ❌ ${script} - MISSING`);
    }
  }

  console.log('\n✨ Setup verification complete!\n');
  console.log('Next steps:');
  console.log('  1. Copy .env.test.example to .env.test and configure');
  console.log('  2. Start Hugo server: npm run start');
  console.log('  3. Run tests: npm run test:e2e');
  console.log('  4. View report: npm run test:e2e:report\n');
}

verifySetup().catch(console.error);
