# Product Management System Schema

## Core Entities

### Products
- `id`: Unique identifier
- `name`: Product name
- `description`: Product description
- `images`: Array of image URLs
- `status`: active/inactive
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

### Dimensions (Product Attributes)
- `id`: Unique identifier
- `product_id`: Reference to product
- `name`: Dimension name (e.g., "Size", "Colorway")
- `display_order`: Order for display
- `required`: Boolean - if this dimension must be selected

### Dimension Values
- `id`: Unique identifier
- `dimension_id`: Reference to dimension
- `value`: The actual value (e.g., "Large", "Blue")
- `display_order`: Order for display
- `active`: Boolean - if this value is available

### Product Variants
- `id`: Unique identifier
- `product_id`: Reference to product
- `sku`: SKU/identifier for the variant
- `price`: Price in cents
- `currency`: Currency code
- `inventory_quantity`: Current stock level
- `inventory_tracking`: Boolean - whether to track inventory
- `stripe_price_id`: Stripe Price ID for this variant
- `stripe_product_id`: Stripe Product ID for this variant
- `active`: Boolean - if variant is available for purchase
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp

### Variant Attributes
- `variant_id`: Reference to variant
- `dimension_id`: Reference to dimension
- `dimension_value_id`: Reference to dimension value
- Combined primary key on (variant_id, dimension_id)

## Example Data Structure

### Product: Shirt
```json
{
  "id": "shirt-001",
  "name": "Waterway Cleanups Supporter T-Shirt",
  "description": "Show your support with this 100% organic cotton t-shirt...",
  "images": ["shirt-main.jpg", "shirt-detail.jpg"],
  "status": "active"
}
```

### Dimensions for Shirt
```json
[
  {
    "id": "colorway",
    "product_id": "shirt-001",
    "name": "Colorway",
    "display_order": 1,
    "required": true
  },
  {
    "id": "size",
    "product_id": "shirt-001",
    "name": "Size",
    "display_order": 2,
    "required": true
  }
]
```

### Dimension Values
```json
[
  {"id": "limited-edition", "dimension_id": "colorway", "value": "Limited Edition Initial Run", "display_order": 1, "active": true},
  {"id": "official", "dimension_id": "colorway", "value": "Waterway Cleanups Official", "display_order": 2, "active": true},
  {"id": "special-x", "dimension_id": "colorway", "value": "Special Edition X", "display_order": 3, "active": true},
  {"id": "small", "dimension_id": "size", "value": "Small", "display_order": 1, "active": true},
  {"id": "medium", "dimension_id": "size", "value": "Medium", "display_order": 2, "active": true},
  {"id": "large", "dimension_id": "size", "value": "Large", "display_order": 3, "active": true},
  {"id": "xl", "dimension_id": "size", "value": "X-Large", "display_order": 4, "active": true},
  {"id": "xxl", "dimension_id": "size", "value": "XX-Large", "display_order": 5, "active": true}
]
```

### Product Variants (15 total combinations)
```json
[
  {
    "id": "shirt-001-limited-small",
    "product_id": "shirt-001",
    "sku": "SHIRT-LIMITED-S",
    "price": 2500,
    "currency": "USD",
    "inventory_quantity": 10,
    "inventory_tracking": true,
    "stripe_price_id": "price_xyz123",
    "stripe_product_id": "prod_xyz123",
    "active": true
  }
  // ... 14 more variants for all combinations
]
```

### Variant Attributes
```json
[
  {"variant_id": "shirt-001-limited-small", "dimension_id": "colorway", "dimension_value_id": "limited-edition"},
  {"variant_id": "shirt-001-limited-small", "dimension_id": "size", "dimension_value_id": "small"}
]
```

## Stripe Synchronization

Each variant will create:
1. A Stripe Product with name like "Waterway Cleanups Supporter T-Shirt - Limited Edition Initial Run - Small"
2. A Stripe Price for that product
3. Metadata linking back to our variant ID

This design allows for:
- Flexible product attributes (any number of dimensions)
- Inventory tracking per variant
- Easy Stripe synchronization
- Scalable admin interface