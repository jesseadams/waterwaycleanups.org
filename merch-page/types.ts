
// Legacy product interface for backward compatibility
export interface LegacyProduct {
  id: string;
  name: string;
  price: number;
  currency: string;
  images: string[];
  description: string;
  stripePriceId: string;
}

// New product management types
export interface Product {
  id: string;
  name: string;
  description: string;
  images: string[];
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Dimension {
  id: string;
  product_id: string;
  name: string;
  display_order: number;
  required: boolean;
}

export interface DimensionValue {
  id: string;
  dimension_id: string;
  value: string;
  display_order: number;
  active: boolean;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  price: number; // in cents
  currency: string;
  inventory_quantity: number;
  inventory_tracking: boolean;
  stripe_price_id?: string;
  stripe_product_id?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VariantAttribute {
  variant_id: string;
  dimension_id: string;
  dimension_value_id: string;
}

// For frontend display and cart functionality
export interface ProductWithVariants {
  product: Product;
  dimensions: (Dimension & { values: DimensionValue[] })[];
  variants: (ProductVariant & { attributes: VariantAttribute[] })[];
}

export interface SelectedVariant {
  variant: ProductVariant;
  selections: Record<string, string>; // dimension_id -> dimension_value_id
}

export interface CartItem {
  variant: ProductVariant;
  product: Product;
  selections: Record<string, string>; // dimension_id -> dimension_value_id
  quantity: number;
}

// Admin interfaces
export interface ProductFormData {
  name: string;
  description: string;
  images: string[];
  status: 'active' | 'inactive';
}

export interface DimensionFormData {
  name: string;
  display_order: number;
  required: boolean;
  values: { value: string; display_order: number; active: boolean }[];
}

export interface VariantFormData {
  sku: string;
  price: number;
  currency: string;
  inventory_quantity: number;
  inventory_tracking: boolean;
  active: boolean;
  attributes: Record<string, string>; // dimension_id -> dimension_value_id
}
