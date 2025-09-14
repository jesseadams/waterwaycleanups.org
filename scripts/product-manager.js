#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const PRODUCTS_FILE = path.join(process.cwd(), 'public', 'data', 'products.json');

class ProductManager {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async loadProductsData() {
    try {
      const data = await fs.readFile(PRODUCTS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading products data:', error);
      throw new Error('Failed to load products data');
    }
  }

  async saveProductsData(data) {
    try {
      await fs.writeFile(PRODUCTS_FILE, JSON.stringify(data, null, 2));
      console.log('✅ Data saved successfully');
    } catch (error) {
      console.error('Error saving products data:', error);
      throw new Error('Failed to save products data');
    }
  }

  generateId(prefix = '') {
    return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async start() {
    console.clear();
    console.log('🛍️  Product Management System');
    console.log('================================');
    console.log();

    try {
      const data = await this.loadProductsData();

      while (true) {
        await this.showMainMenu(data);
      }
    } catch (error) {
      console.error('❌ Failed to start:', error.message);
      process.exit(1);
    }
  }

  async showMainMenu(data) {
    console.log('\n📋 Main Menu:');
    console.log('1. List Products');
    console.log('2. View Product Details');
    console.log('3. Create New Product');
    console.log('4. Edit Product');
    console.log('5. Delete Product');
    console.log('6. Manage Product Variants');
    console.log('7. Sync with Stripe');
    console.log('8. Exit');
    console.log();

    const choice = await this.question('Choose an option (1-8): ');

    switch (choice) {
      case '1':
        await this.listProducts(data);
        break;
      case '2':
        await this.viewProductDetails(data);
        break;
      case '3':
        await this.createProduct(data);
        break;
      case '4':
        await this.editProduct(data);
        break;
      case '5':
        await this.deleteProduct(data);
        break;
      case '6':
        await this.manageVariants(data);
        break;
      case '7':
        await this.syncWithStripe();
        break;
      case '8':
        console.log('\n👋 Goodbye!');
        this.rl.close();
        process.exit(0);
        break;
      default:
        console.log('❌ Invalid choice. Please try again.');
    }
  }

  async listProducts(data) {
    console.clear();
    console.log('📦 Products List');
    console.log('================');

    if (data.products.length === 0) {
      console.log('No products found. Create your first product!');
      return;
    }

    data.products
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .forEach((product, index) => {
        const status = product.status === 'active' ? '✅' : '❌';
        const variantCount = data.variants.filter(v => v.product_id === product.id && v.active).length;

        console.log(`\n${index + 1}. ${status} ${product.name}`);
        console.log(`   ID: ${product.id}`);
        console.log(`   Status: ${product.status}`);
        console.log(`   Variants: ${variantCount}`);
        console.log(`   Created: ${new Date(product.created_at).toLocaleDateString()}`);
      });

    await this.question('\nPress Enter to continue...');
  }

  async viewProductDetails(data) {
    console.clear();
    console.log('🔍 Product Details');
    console.log('==================');

    const productId = await this.selectProduct(data, 'Select product to view:');
    if (!productId) return;

    const product = data.products.find(p => p.id === productId);
    const dimensions = data.dimensions
      .filter(d => d.product_id === productId)
      .sort((a, b) => a.display_order - b.display_order)
      .map(dimension => ({
        ...dimension,
        values: data.dimension_values
          .filter(v => v.dimension_id === dimension.id)
          .sort((a, b) => a.display_order - b.display_order)
      }));

    const variants = data.variants
      .filter(v => v.product_id === productId)
      .map(variant => ({
        ...variant,
        attributes: data.variant_attributes.filter(a => a.variant_id === variant.id)
      }));

    console.clear();
    console.log(`📦 ${product.name}`);
    console.log('='.repeat(product.name.length + 4));
    console.log(`\n📝 Description: ${product.description}`);
    console.log(`📊 Status: ${product.status === 'active' ? '✅ Active' : '❌ Inactive'}`);
    console.log(`🖼️  Images: ${product.images.length}`);
    console.log(`📅 Created: ${new Date(product.created_at).toLocaleDateString()}`);
    console.log(`📅 Updated: ${new Date(product.updated_at).toLocaleDateString()}`);

    if (dimensions.length > 0) {
      console.log('\n🏷️  Dimensions:');
      dimensions.forEach(dim => {
        console.log(`   ${dim.name} (${dim.required ? 'Required' : 'Optional'}): ${dim.values.map(v => v.value).join(', ')}`);
      });
    }

    if (variants.length > 0) {
      console.log('\n📊 Variants:');
      console.log('┌─────────────────────┬──────────┬───────────┬─────────────┬──────────┐');
      console.log('│ SKU                 │ Price    │ Inventory │ Status      │ Stripe   │');
      console.log('├─────────────────────┼──────────┼───────────┼─────────────┼──────────┤');

      variants.forEach(variant => {
        const price = `$${(variant.price / 100).toFixed(2)}`;
        const inventory = variant.inventory_tracking ? `${variant.inventory_quantity}` : 'N/A';
        const status = variant.active ? '✅ Active' : '❌ Inactive';
        const stripe = variant.stripe_price_id ? '✅ Sync' : '❌ No';

        console.log(`│ ${variant.sku.padEnd(19)} │ ${price.padEnd(8)} │ ${inventory.padEnd(9)} │ ${status.padEnd(11)} │ ${stripe.padEnd(8)} │`);
      });

      console.log('└─────────────────────┴──────────┴───────────┴─────────────┴──────────┘');
    }

    await this.question('\nPress Enter to continue...');
  }

  async createProduct(data) {
    console.clear();
    console.log('➕ Create New Product');
    console.log('====================');

    const name = await this.question('Product name: ');
    if (!name.trim()) {
      console.log('❌ Product name is required');
      return;
    }

    const description = await this.question('Description: ');
    if (!description.trim()) {
      console.log('❌ Description is required');
      return;
    }

    const imagesInput = await this.question('Image URLs (comma-separated, optional): ');
    const images = imagesInput.trim() ? imagesInput.split(',').map(url => url.trim()).filter(Boolean) : [];

    const statusInput = await this.question('Status (active/inactive) [active]: ');
    const status = statusInput.trim() || 'active';

    const product = {
      id: this.generateId('prod-'),
      name: name.trim(),
      description: description.trim(),
      images,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    data.products.push(product);
    await this.saveProductsData(data);

    console.log(`\n✅ Product "${product.name}" created with ID: ${product.id}`);

    const addDimensions = await this.question('\nWould you like to add dimensions (size, color, etc.)? (y/n): ');
    if (addDimensions.toLowerCase() === 'y') {
      await this.addDimensions(data, product.id);
    }

    const addVariants = await this.question('\nWould you like to add variants? (y/n): ');
    if (addVariants.toLowerCase() === 'y') {
      await this.addVariants(data, product.id);
    }
  }

  async editProduct(data) {
    console.clear();
    console.log('✏️  Edit Product');
    console.log('================');

    const productId = await this.selectProduct(data, 'Select product to edit:');
    if (!productId) return;

    const productIndex = data.products.findIndex(p => p.id === productId);
    const product = data.products[productIndex];

    console.log(`\nEditing: ${product.name}`);
    console.log('(Press Enter to keep current value)');

    const name = await this.question(`Name [${product.name}]: `);
    const description = await this.question(`Description [${product.description}]: `);
    const imagesInput = await this.question(`Images [${product.images.join(', ')}]: `);
    const statusInput = await this.question(`Status [${product.status}]: `);

    data.products[productIndex] = {
      ...product,
      name: name.trim() || product.name,
      description: description.trim() || product.description,
      images: imagesInput.trim() ? imagesInput.split(',').map(url => url.trim()).filter(Boolean) : product.images,
      status: statusInput.trim() || product.status,
      updated_at: new Date().toISOString()
    };

    await this.saveProductsData(data);
    console.log('\n✅ Product updated successfully');
  }

  async deleteProduct(data) {
    console.clear();
    console.log('🗑️  Delete Product');
    console.log('==================');

    const productId = await this.selectProduct(data, 'Select product to delete:');
    if (!productId) return;

    const product = data.products.find(p => p.id === productId);
    console.log(`\n⚠️  Are you sure you want to delete "${product.name}"?`);
    console.log('This will deactivate the product and all its variants.');

    const confirm = await this.question('Type "DELETE" to confirm: ');
    if (confirm !== 'DELETE') {
      console.log('❌ Deletion cancelled');
      return;
    }

    // Soft delete - set status to inactive
    const productIndex = data.products.findIndex(p => p.id === productId);
    data.products[productIndex].status = 'inactive';
    data.products[productIndex].updated_at = new Date().toISOString();

    // Also deactivate all variants
    data.variants.forEach(variant => {
      if (variant.product_id === productId) {
        variant.active = false;
        variant.updated_at = new Date().toISOString();
      }
    });

    await this.saveProductsData(data);
    console.log('\n✅ Product deleted (deactivated) successfully');
  }

  async manageVariants(data) {
    console.clear();
    console.log('🔧 Manage Product Variants');
    console.log('==========================');

    const productId = await this.selectProduct(data, 'Select product to manage variants:');
    if (!productId) return;

    const product = data.products.find(p => p.id === productId);

    while (true) {
      console.clear();
      console.log(`🔧 Managing Variants for: ${product.name}`);
      console.log('==========================================');

      const variants = data.variants.filter(v => v.product_id === productId);
      const dimensions = data.dimensions.filter(d => d.product_id === productId);

      console.log('\nOptions:');
      console.log('1. List Current Variants');
      console.log('2. Add New Variant');
      console.log('3. Edit Variant');
      console.log('4. Delete Variant');
      console.log('5. Manage Dimensions');
      console.log('6. Generate All Variants');
      console.log('7. Back to Main Menu');

      const choice = await this.question('\nChoose option (1-7): ');

      switch (choice) {
        case '1':
          await this.listVariants(data, productId);
          break;
        case '2':
          await this.addVariants(data, productId);
          break;
        case '3':
          await this.editVariant(data, productId);
          break;
        case '4':
          await this.deleteVariant(data, productId);
          break;
        case '5':
          await this.manageDimensions(data, productId);
          break;
        case '6':
          await this.generateAllVariants(data, productId);
          break;
        case '7':
          return;
        default:
          console.log('❌ Invalid choice');
          await this.question('Press Enter to continue...');
      }
    }
  }

  async addDimensions(data, productId) {
    console.log('\n🏷️  Adding Dimensions');
    console.log('=====================');

    while (true) {
      const dimensionName = await this.question('Dimension name (e.g., Size, Color) or "done" to finish: ');
      if (dimensionName.toLowerCase() === 'done') break;

      if (!dimensionName.trim()) {
        console.log('❌ Dimension name is required');
        continue;
      }

      const required = await this.question('Is this dimension required? (y/n) [y]: ');
      const isRequired = required.toLowerCase() !== 'n';

      const valuesInput = await this.question('Dimension values (comma-separated): ');
      const values = valuesInput.split(',').map(v => v.trim()).filter(Boolean);

      if (values.length === 0) {
        console.log('❌ At least one value is required');
        continue;
      }

      // Create dimension
      const dimensionId = this.generateId('dim-');
      const dimension = {
        id: dimensionId,
        product_id: productId,
        name: dimensionName.trim(),
        display_order: data.dimensions.filter(d => d.product_id === productId).length + 1,
        required: isRequired
      };

      data.dimensions.push(dimension);

      // Create dimension values
      values.forEach((value, index) => {
        const dimensionValue = {
          id: this.generateId('val-'),
          dimension_id: dimensionId,
          value: value,
          display_order: index + 1,
          active: true
        };
        data.dimension_values.push(dimensionValue);
      });

      console.log(`✅ Added dimension "${dimensionName}" with ${values.length} values`);
    }

    await this.saveProductsData(data);
  }

  async addVariants(data, productId) {
    console.log('\n📦 Adding Variants');
    console.log('==================');

    const dimensions = data.dimensions.filter(d => d.product_id === productId);
    if (dimensions.length === 0) {
      console.log('❌ No dimensions found for this product. Add dimensions first.');
      return;
    }

    while (true) {
      const addMore = await this.question('Add a variant? (y/n): ');
      if (addMore.toLowerCase() !== 'y') break;

      const sku = await this.question('SKU: ');
      if (!sku.trim()) {
        console.log('❌ SKU is required');
        continue;
      }

      const priceInput = await this.question('Price in dollars: ');
      const price = Math.round(parseFloat(priceInput) * 100);
      if (isNaN(price)) {
        console.log('❌ Invalid price');
        continue;
      }

      const currency = await this.question('Currency [USD]: ') || 'USD';
      const inventoryInput = await this.question('Inventory quantity: ');
      const inventory = parseInt(inventoryInput);

      if (isNaN(inventory)) {
        console.log('❌ Invalid inventory quantity');
        continue;
      }

      const tracking = await this.question('Track inventory? (y/n) [y]: ');
      const inventoryTracking = tracking.toLowerCase() !== 'n';

      const active = await this.question('Active? (y/n) [y]: ');
      const isActive = active.toLowerCase() !== 'n';

      // Create variant
      const variantId = this.generateId('var-');
      const variant = {
        id: variantId,
        product_id: productId,
        sku: sku.trim(),
        price,
        currency: currency.toUpperCase(),
        inventory_quantity: inventory,
        inventory_tracking: inventoryTracking,
        stripe_price_id: '',
        stripe_product_id: '',
        active: isActive,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      data.variants.push(variant);

      // Collect dimension values for this variant
      console.log('\nSelect dimension values for this variant:');
      for (const dimension of dimensions) {
        const dimensionValues = data.dimension_values
          .filter(v => v.dimension_id === dimension.id && v.active)
          .sort((a, b) => a.display_order - b.display_order);

        console.log(`\n${dimension.name}:`);
        dimensionValues.forEach((value, index) => {
          console.log(`  ${index + 1}. ${value.value}`);
        });

        let selectedValue = null;
        while (!selectedValue) {
          const choice = await this.question(`Choose ${dimension.name} (1-${dimensionValues.length}): `);
          const index = parseInt(choice) - 1;
          if (index >= 0 && index < dimensionValues.length) {
            selectedValue = dimensionValues[index];
          } else {
            console.log('❌ Invalid choice');
          }
        }

        // Create variant attribute
        data.variant_attributes.push({
          variant_id: variantId,
          dimension_id: dimension.id,
          dimension_value_id: selectedValue.id
        });
      }

      console.log(`✅ Variant "${sku}" created successfully`);
    }

    await this.saveProductsData(data);
  }

  async generateAllVariants(data, productId) {
    console.log('\n🎯 Generate All Variants');
    console.log('========================');

    const dimensions = data.dimensions.filter(d => d.product_id === productId);
    if (dimensions.length === 0) {
      console.log('❌ No dimensions found for this product.');
      return;
    }

    // Get all dimension values
    const dimensionValueGroups = dimensions.map(dimension => ({
      dimension,
      values: data.dimension_values
        .filter(v => v.dimension_id === dimension.id && v.active)
        .sort((a, b) => a.display_order - b.display_order)
    }));

    // Calculate total combinations
    const totalCombinations = dimensionValueGroups.reduce((acc, group) => acc * group.values.length, 1);

    console.log(`This will generate ${totalCombinations} variants.`);
    const proceed = await this.question('Continue? (y/n): ');
    if (proceed.toLowerCase() !== 'y') return;

    // Get common settings
    const basePrice = await this.question('Base price in dollars: ');
    const price = Math.round(parseFloat(basePrice) * 100);
    if (isNaN(price)) {
      console.log('❌ Invalid price');
      return;
    }

    const currency = await this.question('Currency [USD]: ') || 'USD';
    const inventoryInput = await this.question('Base inventory quantity: ');
    const inventory = parseInt(inventoryInput);

    if (isNaN(inventory)) {
      console.log('❌ Invalid inventory quantity');
      return;
    }

    // Generate all combinations
    const combinations = this.generateCombinations(dimensionValueGroups);

    for (const combination of combinations) {
      // Generate SKU from product and dimension values
      const product = data.products.find(p => p.id === productId);
      const skuParts = [product.name.toUpperCase().replace(/\s+/g, '-').substring(0, 8)];

      combination.forEach(({ dimension, value }) => {
        skuParts.push(value.value.toUpperCase().replace(/\s+/g, '-').substring(0, 6));
      });

      const sku = skuParts.join('-');

      // Check if variant already exists
      const existingVariant = data.variants.find(v => v.sku === sku);
      if (existingVariant) {
        console.log(`⚠️  Variant ${sku} already exists, skipping`);
        continue;
      }

      // Create variant
      const variantId = this.generateId('var-');
      const variant = {
        id: variantId,
        product_id: productId,
        sku,
        price,
        currency: currency.toUpperCase(),
        inventory_quantity: inventory,
        inventory_tracking: true,
        stripe_price_id: '',
        stripe_product_id: '',
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      data.variants.push(variant);

      // Create variant attributes
      combination.forEach(({ dimension, value }) => {
        data.variant_attributes.push({
          variant_id: variantId,
          dimension_id: dimension.id,
          dimension_value_id: value.id
        });
      });

      console.log(`✅ Created variant: ${sku}`);
    }

    await this.saveProductsData(data);
    console.log(`\n🎉 Successfully generated ${combinations.length} variants`);
  }

  generateCombinations(dimensionValueGroups) {
    if (dimensionValueGroups.length === 0) return [];
    if (dimensionValueGroups.length === 1) {
      return dimensionValueGroups[0].values.map(value => [{ dimension: dimensionValueGroups[0].dimension, value }]);
    }

    const [first, ...rest] = dimensionValueGroups;
    const restCombinations = this.generateCombinations(rest);
    const result = [];

    for (const value of first.values) {
      for (const restCombination of restCombinations) {
        result.push([{ dimension: first.dimension, value }, ...restCombination]);
      }
    }

    return result;
  }

  async listVariants(data, productId) {
    const variants = data.variants.filter(v => v.product_id === productId);

    if (variants.length === 0) {
      console.log('\nNo variants found for this product.');
    } else {
      console.log('\n📊 Current Variants:');
      console.log('┌─────────────────────┬──────────┬───────────┬──────────┐');
      console.log('│ SKU                 │ Price    │ Inventory │ Status   │');
      console.log('├─────────────────────┼──────────┼───────────┼──────────┤');

      variants.forEach(variant => {
        const price = `$${(variant.price / 100).toFixed(2)}`;
        const inventory = variant.inventory_tracking ? `${variant.inventory_quantity}` : 'N/A';
        const status = variant.active ? '✅ Active' : '❌ Inactive';

        console.log(`│ ${variant.sku.padEnd(19)} │ ${price.padEnd(8)} │ ${inventory.padEnd(9)} │ ${status.padEnd(8)} │`);
      });

      console.log('└─────────────────────┴──────────┴───────────┴──────────┘');
    }

    await this.question('\nPress Enter to continue...');
  }

  async selectProduct(data, prompt) {
    const activeProducts = data.products.filter(p => p.status === 'active');

    if (activeProducts.length === 0) {
      console.log('No active products found.');
      return null;
    }

    console.log(`\n${prompt}`);
    activeProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name}`);
    });

    while (true) {
      const choice = await this.question(`\nSelect product (1-${activeProducts.length}): `);
      const index = parseInt(choice) - 1;

      if (index >= 0 && index < activeProducts.length) {
        return activeProducts[index].id;
      }

      console.log('❌ Invalid choice. Please try again.');
    }
  }

  async syncWithStripe() {
    console.clear();
    console.log('🔄 Sync with Stripe');
    console.log('==================');

    console.log('This will run the Stripe synchronization script...');

    const { spawn } = require('child_process');

    try {
      const syncProcess = spawn('npm', ['run', 'sync-variants'], { stdio: 'inherit' });

      syncProcess.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Stripe sync completed successfully');
        } else {
          console.log('\n❌ Stripe sync failed');
        }
      });

      await new Promise((resolve) => {
        syncProcess.on('close', resolve);
      });

    } catch (error) {
      console.log('❌ Failed to run sync script:', error.message);
      console.log('Make sure you have the sync-variants npm script configured.');
    }

    await this.question('\nPress Enter to continue...');
  }

  // Additional helper methods for managing dimensions and editing variants...
  async manageDimensions(data, productId) {
    console.log('\n🏷️  Manage Dimensions');
    console.log('=====================');

    while (true) {
      const dimensions = data.dimensions.filter(d => d.product_id === productId);

      console.log('\nCurrent Dimensions:');
      if (dimensions.length === 0) {
        console.log('No dimensions found.');
      } else {
        dimensions.forEach((dim, index) => {
          const valueCount = data.dimension_values.filter(v => v.dimension_id === dim.id).length;
          console.log(`${index + 1}. ${dim.name} (${valueCount} values, ${dim.required ? 'Required' : 'Optional'})`);
        });
      }

      console.log('\nOptions:');
      console.log('1. Add Dimension');
      console.log('2. Edit Dimension');
      console.log('3. Delete Dimension');
      console.log('4. Back');

      const choice = await this.question('Choose option (1-4): ');

      switch (choice) {
        case '1':
          await this.addDimensions(data, productId);
          break;
        case '2':
          // Edit dimension implementation
          console.log('Edit dimension functionality would be implemented here');
          await this.question('Press Enter to continue...');
          break;
        case '3':
          // Delete dimension implementation
          console.log('Delete dimension functionality would be implemented here');
          await this.question('Press Enter to continue...');
          break;
        case '4':
          return;
        default:
          console.log('❌ Invalid choice');
      }
    }
  }

  async editVariant(data, productId) {
    // Implementation for editing variants
    console.log('Edit variant functionality would be implemented here');
    await this.question('Press Enter to continue...');
  }

  async deleteVariant(data, productId) {
    // Implementation for deleting variants
    console.log('Delete variant functionality would be implemented here');
    await this.question('Press Enter to continue...');
  }
}

// Start the application
const manager = new ProductManager();
manager.start().catch(console.error);