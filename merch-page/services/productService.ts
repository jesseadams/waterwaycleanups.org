import type {
  Product,
  ProductVariant,
  Dimension,
  DimensionValue,
  VariantAttribute,
  ProductWithVariants,
  SelectedVariant
} from '../types';

// In a real app, this would come from an API
// For this static site, we'll load from JSON
let productsData: {
  products: Product[];
  dimensions: Dimension[];
  dimension_values: DimensionValue[];
  variants: ProductVariant[];
  variant_attributes: VariantAttribute[];
} | null = null;

async function loadProductsData() {
  if (productsData) return productsData;

  try {
    const response = await fetch('/data/products.json');
    if (!response.ok) {
      throw new Error('Failed to load products data');
    }
    productsData = await response.json();
    return productsData;
  } catch (error) {
    console.error('Error loading products data:', error);
    throw error;
  }
}

export class ProductService {

  async getAllProducts(): Promise<Product[]> {
    const data = await loadProductsData();
    return data.products.filter(p => p.status === 'active');
  }

  async getProduct(id: string): Promise<Product | null> {
    const data = await loadProductsData();
    return data.products.find(p => p.id === id && p.status === 'active') || null;
  }

  async getProductWithVariants(productId: string): Promise<ProductWithVariants | null> {
    const data = await loadProductsData();

    const product = data.products.find(p => p.id === productId && p.status === 'active');
    if (!product) return null;

    // Get dimensions for this product
    const dimensions = data.dimensions
      .filter(d => d.product_id === productId)
      .sort((a, b) => a.display_order - b.display_order)
      .map(dimension => ({
        ...dimension,
        values: data.dimension_values
          .filter(v => v.dimension_id === dimension.id && v.active)
          .sort((a, b) => a.display_order - b.display_order)
      }));

    // Get variants for this product
    const variants = data.variants
      .filter(v => v.product_id === productId && v.active)
      .map(variant => ({
        ...variant,
        attributes: data.variant_attributes.filter(a => a.variant_id === variant.id)
      }));

    return { product, dimensions, variants };
  }

  async getAllProductsWithVariants(): Promise<ProductWithVariants[]> {
    const data = await loadProductsData();
    const activeProducts = data.products.filter(p => p.status === 'active');

    const results: ProductWithVariants[] = [];

    for (const product of activeProducts) {
      const productWithVariants = await this.getProductWithVariants(product.id);
      if (productWithVariants) {
        results.push(productWithVariants);
      }
    }

    return results;
  }

  async getVariant(variantId: string): Promise<ProductVariant | null> {
    const data = await loadProductsData();
    return data.variants.find(v => v.id === variantId && v.active) || null;
  }

  async getVariantWithProduct(variantId: string): Promise<{ variant: ProductVariant; product: Product } | null> {
    const data = await loadProductsData();

    const variant = data.variants.find(v => v.id === variantId && v.active);
    if (!variant) return null;

    const product = data.products.find(p => p.id === variant.product_id && p.status === 'active');
    if (!product) return null;

    return { variant, product };
  }

  async findVariantBySelections(productId: string, selections: Record<string, string>): Promise<SelectedVariant | null> {
    const data = await loadProductsData();

    // Find all variants for this product
    const productVariants = data.variants.filter(v => v.product_id === productId && v.active);

    // Find the variant that matches all selections
    for (const variant of productVariants) {
      const variantAttributes = data.variant_attributes.filter(a => a.variant_id === variant.id);

      // Check if this variant matches all selections
      let matches = true;
      for (const [dimensionId, valueId] of Object.entries(selections)) {
        const hasMatch = variantAttributes.some(attr =>
          attr.dimension_id === dimensionId && attr.dimension_value_id === valueId
        );
        if (!hasMatch) {
          matches = false;
          break;
        }
      }

      if (matches && Object.keys(selections).length === variantAttributes.length) {
        return { variant, selections };
      }
    }

    return null;
  }

  async getAvailableValuesForDimension(
    productId: string,
    dimensionId: string,
    otherSelections: Record<string, string>
  ): Promise<DimensionValue[]> {
    const data = await loadProductsData();

    // Get all variants for this product
    const productVariants = data.variants.filter(v => v.product_id === productId && v.active);

    // Find variants that match the other selections
    const compatibleVariants = productVariants.filter(variant => {
      const variantAttributes = data.variant_attributes.filter(a => a.variant_id === variant.id);

      // Check if variant matches all other selections
      for (const [otherDimensionId, otherValueId] of Object.entries(otherSelections)) {
        if (otherDimensionId === dimensionId) continue; // Skip the dimension we're checking

        const hasMatch = variantAttributes.some(attr =>
          attr.dimension_id === otherDimensionId && attr.dimension_value_id === otherValueId
        );
        if (!hasMatch) return false;
      }
      return true;
    });

    // Get all possible values for this dimension from compatible variants
    const availableValueIds = new Set<string>();

    for (const variant of compatibleVariants) {
      const variantAttributes = data.variant_attributes.filter(a => a.variant_id === variant.id);
      const dimensionAttribute = variantAttributes.find(a => a.dimension_id === dimensionId);
      if (dimensionAttribute) {
        availableValueIds.add(dimensionAttribute.dimension_value_id);
      }
    }

    // Return the dimension values that are available
    return data.dimension_values
      .filter(v => v.dimension_id === dimensionId && v.active && availableValueIds.has(v.id))
      .sort((a, b) => a.display_order - b.display_order);
  }

  async checkInventory(variantId: string): Promise<{ available: boolean; quantity: number }> {
    const data = await loadProductsData();

    const variant = data.variants.find(v => v.id === variantId && v.active);
    if (!variant) {
      return { available: false, quantity: 0 };
    }

    if (!variant.inventory_tracking) {
      return { available: true, quantity: Infinity };
    }

    return {
      available: variant.inventory_quantity > 0,
      quantity: variant.inventory_quantity
    };
  }
}

// Export singleton instance
export const productService = new ProductService();