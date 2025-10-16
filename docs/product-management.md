# Product Management System (CLI)

This document describes the command-line product management system that supports product variants, dimensions, and Stripe integration.

## Overview

The CLI product management system allows you to:

1. **Manage Products**: Create, edit, and delete products with multiple variants
2. **Define Dimensions**: Set up product attributes like Size, Color, Style, etc.
3. **Create Variants**: Generate individual variants or all possible combinations of dimensions
4. **Stripe Integration**: Automatically sync variants to Stripe as individual products
5. **Inventory Tracking**: Track stock levels for each variant
6. **Frontend Integration**: Display products with variant selection on the merchandise page

## Architecture

### Data Model

The system uses a relational data model stored in JSON format:

- **Products**: Basic product information (name, description, images, status)
- **Dimensions**: Product attributes (e.g., "Size", "Colorway")
- **Dimension Values**: Possible values for each dimension (e.g., "Small", "Medium", "Large")
- **Variants**: Specific combinations of dimension values with pricing and inventory
- **Variant Attributes**: Links variants to their dimension value selections

### File Structure

```
├── public/data/
│   └── products.json              # Main product data file (accessible to frontend)
├── docs/
│   ├── products-schema.md         # Data model documentation
│   └── product-management.md      # This file
├── merch-page/
│   ├── services/
│   │   ├── productService.ts     # Data access layer
│   │   └── stripe.ts             # Stripe integration
│   ├── types.ts                  # TypeScript type definitions
│   └── components/               # React components for variant display
├── scripts/
│   ├── product-manager.js        # CLI product management tool
│   └── sync-products.js          # Sync products to Stripe
```

## Usage

### 1. Starting the CLI Tool

```bash
# Run the product management CLI
npm run products

# Or directly with node
node scripts/product-manager.js
```

**Note**: Some CLI features are still in development. For full product management, you may need to edit `/public/data/products.json` directly. See `docs/products-schema.md` for the data structure.

The CLI provides an interactive menu system with the following options:

1. **List Products** - View all products with their status and variant counts
2. **View Product Details** - See comprehensive product information including dimensions and variants
3. **Create New Product** - Add a new product with optional dimensions and variants
4. **Edit Product** - Update existing product information
5. **Delete Product** - Soft delete (deactivate) a product and its variants
6. **Manage Product Variants** - Advanced variant management for existing products
7. **Sync with Stripe** - Run the Stripe synchronization process
8. **Exit** - Close the application

### 2. Creating Products

When creating a new product, you'll be prompted for:

- **Product Name**: Display name for the product
- **Description**: Detailed description of the product
- **Image URLs**: Optional comma-separated list of image URLs
- **Status**: Active or inactive (defaults to active)

After creating a product, you can optionally:

- **Add Dimensions**: Define product attributes like Size, Color, etc.
- **Add Variants**: Create specific product variants with pricing and inventory

### 3. Managing Dimensions

Dimensions define the attributes that make variants unique:

- **Size**: Small, Medium, Large, X-Large, XX-Large
- **Colorway**: Limited Edition, Official, Special Edition X
- **Material**: Cotton, Polyester, Blend (example)

Each dimension can be marked as required or optional, and you can define multiple values for each dimension.

### 4. Creating Variants

You can create variants in two ways:

#### Individual Variants
Create variants one by one with specific attributes, pricing, and inventory.

#### Generate All Variants
Automatically generate all possible combinations of dimension values. For example:
- 3 colorways × 5 sizes = 15 variants total

Each variant includes:
- **SKU**: Unique identifier
- **Price**: In dollars (converted to cents internally)
- **Currency**: USD, EUR, etc.
- **Inventory**: Quantity and tracking settings
- **Dimension Values**: Specific attribute selections

### 5. Stripe Synchronization

The system automatically creates individual Stripe products for each variant.

#### Run Sync from CLI

You can run the Stripe sync directly from the CLI tool (option 7), or use these npm scripts:

```bash
# Sync all products to Stripe
npm run sync-products

# Dry run to preview changes
npm run sync-products:dry-run

# Verbose output
npm run sync-products:verbose
```

#### What Happens During Sync

1. **Creates Stripe Products**: Each variant becomes a separate Stripe product
   - Name: "Product Name - Dimension Values" (e.g., "T-Shirt - Limited Edition - Small")
   - Description: Uses product description
   - Images: Uses product images
   - Metadata: Includes variant_id, product_id, sku

2. **Creates Stripe Prices**: Each variant gets a Stripe price
   - Amount: Variant price in cents
   - Currency: Variant currency
   - Metadata: Includes variant_id and sku

3. **Updates Local Data**: Stores Stripe IDs back in the product data

### 6. Frontend Integration

The merchandise page automatically loads products with variant selection.

#### Key Features

- **Dynamic Option Loading**: Shows only available combinations
- **Price Display**: Shows price ranges or specific variant prices
- **Inventory Status**: Displays stock levels and out-of-stock warnings
- **Smart Cart**: Groups items by variant, not just product

#### Example Usage

```typescript
// Load products with variants
const products = await productService.getAllProductsWithVariants();

// Find specific variant based on selections
const variant = await productService.findVariantBySelections(
  'shirt-001',
  {
    'shirt-size': 'large',
    'shirt-colorway': 'official'
  }
);

// Check inventory
const inventory = await productService.checkInventory('variant-id');
```

## Data Examples

### Product Data Structure

```json
{
  "products": [
    {
      "id": "shirt-001",
      "name": "Waterway Cleanups Supporter T-Shirt",
      "description": "Show your support with this 100% organic cotton t-shirt...",
      "images": ["shirt1.jpg", "shirt2.jpg"],
      "status": "active",
      "created_at": "2025-01-20T00:00:00Z",
      "updated_at": "2025-01-20T00:00:00Z"
    }
  ],
  "dimensions": [
    {
      "id": "shirt-colorway",
      "product_id": "shirt-001",
      "name": "Colorway",
      "display_order": 1,
      "required": true
    }
  ],
  "dimension_values": [
    {
      "id": "limited-edition",
      "dimension_id": "shirt-colorway",
      "value": "Limited Edition Initial Run",
      "display_order": 1,
      "active": true
    }
  ],
  "variants": [
    {
      "id": "shirt-001-limited-small",
      "product_id": "shirt-001",
      "sku": "SHIRT-LIMITED-S",
      "price": 2500,
      "currency": "USD",
      "inventory_quantity": 10,
      "inventory_tracking": true,
      "stripe_price_id": "price_1234567890",
      "stripe_product_id": "prod_1234567890",
      "active": true,
      "created_at": "2025-01-20T00:00:00Z",
      "updated_at": "2025-01-20T00:00:00Z"
    }
  ],
  "variant_attributes": [
    {
      "variant_id": "shirt-001-limited-small",
      "dimension_id": "shirt-colorway",
      "dimension_value_id": "limited-edition"
    }
  ]
}
```

## CLI Features

### Interactive Menu System

The CLI provides a user-friendly menu system with:

- **Clear Navigation**: Easy-to-follow menu options
- **Data Validation**: Input validation for all fields
- **Confirmation Prompts**: Safety checks for destructive operations
- **Visual Formatting**: Tables and status indicators for easy reading
- **Error Handling**: Graceful error messages and recovery options

### Batch Operations

- **Generate All Variants**: Create all possible combinations automatically
- **Bulk Inventory Updates**: Update multiple variants at once
- **Mass SKU Generation**: Automatic SKU creation based on product and dimension values

## Troubleshooting

### Common Issues

1. **Stripe Sync Fails**
   - Check `STRIPE_SECRET_KEY` environment variable
   - Ensure all variants have valid SKUs
   - Run with `--verbose` flag to see detailed errors

2. **Variants Not Showing**
   - Ensure variants have `active: true`
   - Check that all required dimensions have selections
   - Verify product status is `active`

3. **Inventory Issues**
   - Check `inventory_tracking` setting on variants
   - Ensure `inventory_quantity` is set correctly
   - Verify variant attributes are properly linked

### Debug Commands

```bash
# Check data structure
cat data/products.json | jq '.products | length'

# Validate Stripe connection
node -e "const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); stripe.products.list({limit: 1}).then(console.log);"

# Test variant lookup
# (Use the admin interface or API to test specific queries)
```

## Migration from Legacy System

The new system is backward compatible. The old `products.ts` file is still supported, but new features require using the variant system.

### Migration Steps

1. **Backup existing data**: Copy current `merch-page/data/products.ts`
2. **Install new system**: All new files are already in place
3. **Create product data**: Use admin interface or APIs to recreate products
4. **Sync to Stripe**: Run `npm run sync-products`
5. **Test frontend**: Verify merchandise page works with new system

## Future Enhancements

Potential future improvements:

- **Bulk Variant Creation**: Generate all combinations automatically
- **Image per Variant**: Support different images for different variants
- **Advanced Inventory**: Low stock alerts, automatic reordering
- **Pricing Rules**: Dynamic pricing based on variant attributes
- **Analytics**: Track which variants perform best
- **Import/Export**: CSV import/export for bulk operations