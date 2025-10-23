#!/usr/bin/env node

require('dotenv').config();
const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');

function getProductsFilePath() {
  const isTestMode = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_');
  const fileName = isTestMode ? 'products.test.json' : 'products.json';
  return path.join(__dirname, '..', 'public', 'data', fileName);
}

const PRODUCTS_FILE_PATH = getProductsFilePath();

class VariantProductSyncer {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  log(message, force = false) {
    if (this.verbose || force) {
      console.log(message);
    }
  }

  async loadProductsData() {
    this.log('Loading local product data...');

    try {
      if (!fs.existsSync(PRODUCTS_FILE_PATH)) {
        throw new Error('Products data file does not exist');
      }

      const content = fs.readFileSync(PRODUCTS_FILE_PATH, 'utf8');
      const data = JSON.parse(content);

      this.log(`Loaded ${data.products?.length || 0} products, ${data.variants?.length || 0} variants`);
      return data;
    } catch (error) {
      console.error('Error loading product data:', error.message);
      process.exit(1);
    }
  }

  async saveProductsData(data) {
    if (this.dryRun) {
      console.log('DRY RUN - Would save updated product data');
      return;
    }

    try {
      fs.writeFileSync(PRODUCTS_FILE_PATH, JSON.stringify(data, null, 2));
      this.log('Product data saved successfully', true);
    } catch (error) {
      console.error('Error saving product data:', error.message);
      throw error;
    }
  }

  buildVariantDisplayName(productName, variant, data) {
    const attributes = data.variant_attributes.filter(a => a.variant_id === variant.id);

    const attributeNames = attributes.map(attr => {
      const dimension = data.dimensions.find(d => d.id === attr.dimension_id);
      const value = data.dimension_values.find(v => v.id === attr.dimension_value_id);
      return value ? value.value : '';
    }).filter(Boolean);

    return `${productName}${attributeNames.length ? ' - ' + attributeNames.join(' - ') : ''}`;
  }

  async syncVariantToStripe(product, variant, data) {
    const displayName = this.buildVariantDisplayName(product.name, variant, data);

    try {
      let stripeProduct;

      // Check if Stripe product exists
      if (variant.stripe_product_id) {
        try {
          stripeProduct = await this.stripe.products.retrieve(variant.stripe_product_id);
          this.log(`Found existing Stripe product: ${stripeProduct.id}`);
        } catch (error) {
          this.log(`Stripe product ${variant.stripe_product_id} not found, creating new one`);
          variant.stripe_product_id = '';
        }
      }

      // Create or update Stripe product
      if (!variant.stripe_product_id) {
        if (this.dryRun) {
          this.log(`DRY RUN - Would create Stripe product: ${displayName}`);
          return { product_id: 'dry_run_prod_id', price_id: 'dry_run_price_id' };
        }

        stripeProduct = await this.stripe.products.create({
          name: displayName,
          description: product.description,
          images: product.images,
          metadata: {
            variant_id: variant.id,
            product_id: product.id,
            sku: variant.sku
          }
        });

        this.log(`Created Stripe product: ${stripeProduct.id}`);
      } else {
        if (this.dryRun) {
          this.log(`DRY RUN - Would update Stripe product: ${displayName}`);
        } else {
          stripeProduct = await this.stripe.products.update(variant.stripe_product_id, {
            name: displayName,
            description: product.description,
            images: product.images,
            metadata: {
              variant_id: variant.id,
              product_id: product.id,
              sku: variant.sku
            }
          });
          this.log(`Updated Stripe product: ${stripeProduct.id}`);
        }
      }

      // Handle Stripe price
      let stripePrice;

      if (variant.stripe_price_id) {
        try {
          stripePrice = await this.stripe.prices.retrieve(variant.stripe_price_id);

          // Check if price needs updating
          if (stripePrice.unit_amount !== variant.price || stripePrice.currency !== variant.currency.toLowerCase()) {
            this.log(`Price changed for variant ${variant.id}, creating new price`);

            if (!this.dryRun) {
              // Archive old price
              await this.stripe.prices.update(variant.stripe_price_id, { active: false });
            }
            variant.stripe_price_id = '';
          }
        } catch (error) {
          this.log(`Stripe price ${variant.stripe_price_id} not found, creating new one`);
          variant.stripe_price_id = '';
        }
      }

      if (!variant.stripe_price_id) {
        if (this.dryRun) {
          this.log(`DRY RUN - Would create Stripe price: $${variant.price / 100} ${variant.currency}`);
          return { product_id: stripeProduct.id, price_id: 'dry_run_price_id' };
        }

        stripePrice = await this.stripe.prices.create({
          unit_amount: variant.price,
          currency: variant.currency.toLowerCase(),
          product: stripeProduct.id,
          metadata: {
            variant_id: variant.id,
            sku: variant.sku
          }
        });

        this.log(`Created Stripe price: ${stripePrice.id}`);
      }

      return {
        product_id: stripeProduct.id,
        price_id: stripePrice ? stripePrice.id : variant.stripe_price_id
      };
    } catch (error) {
      console.error(`Error syncing variant ${variant.id} to Stripe:`, error.message);
      throw error;
    }
  }

  async syncAllVariantsToStripe(data) {
    this.log('Syncing variants to Stripe...');

    const activeProducts = data.products.filter(p => p.status === 'active');
    let syncedCount = 0;
    let errorCount = 0;

    for (const product of activeProducts) {
      const productVariants = data.variants.filter(v => v.product_id === product.id && v.active);

      this.log(`Syncing ${productVariants.length} variants for product: ${product.name}`);

      for (const variant of productVariants) {
        try {
          const stripeIds = await this.syncVariantToStripe(product, variant, data);

          // Update variant with Stripe IDs
          variant.stripe_product_id = stripeIds.product_id;
          variant.stripe_price_id = stripeIds.price_id;
          variant.updated_at = new Date().toISOString();

          syncedCount++;
        } catch (error) {
          console.error(`Failed to sync variant ${variant.sku}:`, error.message);
          errorCount++;
        }
      }
    }

    this.log(`Sync completed: ${syncedCount} variants synced, ${errorCount} errors`);
    return { syncedCount, errorCount };
  }

  async deactivateUnusedStripeProducts(data) {
    this.log('Checking for unused Stripe products to deactivate...');

    if (this.dryRun) {
      this.log('DRY RUN - Would check for unused Stripe products');
      return;
    }

    try {
      const stripeProducts = await this.stripe.products.list({
        limit: 100,
        active: true
      });

      const activeVariantProductIds = new Set();
      data.variants
        .filter(v => v.active)
        .forEach(v => {
          if (v.stripe_product_id) {
            activeVariantProductIds.add(v.stripe_product_id);
          }
        });

      let deactivatedCount = 0;

      for (const stripeProduct of stripeProducts.data) {
        // Check if this Stripe product has metadata indicating it's a variant product
        if (stripeProduct.metadata && stripeProduct.metadata.variant_id) {
          if (!activeVariantProductIds.has(stripeProduct.id)) {
            this.log(`Deactivating unused Stripe product: ${stripeProduct.id}`);

            await this.stripe.products.update(stripeProduct.id, { active: false });
            deactivatedCount++;
          }
        }
      }

      this.log(`Deactivated ${deactivatedCount} unused Stripe products`);
    } catch (error) {
      console.error('Error deactivating unused Stripe products:', error.message);
    }
  }

  async sync() {
    console.log('🔄 Starting product variant sync with Stripe...\n');

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ STRIPE_SECRET_KEY environment variable is required');
      console.log('Create a .env file with: STRIPE_SECRET_KEY=sk_test_...');
      process.exit(1);
    }

    if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
      console.error('❌ Invalid Stripe secret key format');
      process.exit(1);
    }

    const isTestMode = process.env.STRIPE_SECRET_KEY.startsWith('sk_test_');
    console.log(`📁 Environment: ${isTestMode ? 'TEST' : 'PRODUCTION'}`);
    console.log(`📄 Using file: ${path.basename(PRODUCTS_FILE_PATH)}\n`);

    try {
      const data = await this.loadProductsData();

      if (!data.products || !data.variants) {
        console.log('⚠️  No products or variants found in data');
        return;
      }

      const activeVariants = data.variants.filter(v => v.active);
      if (activeVariants.length === 0) {
        console.log('⚠️  No active variants found');
        return;
      }

      // Sync variants to Stripe
      const result = await this.syncAllVariantsToStripe(data);

      // Clean up unused Stripe products
      await this.deactivateUnusedStripeProducts(data);

      // Save updated data
      await this.saveProductsData(data);

      console.log('✅ Variant sync completed successfully!');
      console.log(`   Synced ${result.syncedCount} variants`);

      if (result.errorCount > 0) {
        console.log(`   ${result.errorCount} errors occurred`);
      }

      if (!this.dryRun) {
        console.log(`   Updated: ${PRODUCTS_FILE_PATH}`);
      }

    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI handling
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run') || args.includes('-d'),
  verbose: args.includes('--verbose') || args.includes('-v')
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Stripe Products Sync Tool

Usage: node scripts/sync-products.js [options]

Options:
  --dry-run, -d       Show what would be changed without making changes
  --verbose, -v       Show detailed output
  --help, -h          Show this help message

Environment:
  STRIPE_SECRET_KEY   Your Stripe secret key (required)

Examples:
  node scripts/sync-products.js --dry-run    # Preview changes
  node scripts/sync-products.js --verbose    # Sync with detailed output
  npm run sync-products                      # Sync products

This tool will:
1. Create a separate Stripe Product for each product variant
2. Create/update Stripe Prices for each variant
3. Deactivate unused Stripe products
4. Update local data with Stripe IDs
`);
  process.exit(0);
}

const syncer = new VariantProductSyncer(options);
syncer.sync();
