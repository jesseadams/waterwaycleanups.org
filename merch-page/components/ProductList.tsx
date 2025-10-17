
import React, { useState, useEffect } from 'react';
import ProductCard from './ProductCard';
import type { ProductWithVariants, CartItem } from '../types';
import { productService } from '../services/productService';

interface ProductListProps {
  addToCart: (cartItem: CartItem) => void;
}

const ProductList: React.FC<ProductListProps> = ({ addToCart }) => {
  const [productsWithVariants, setProductsWithVariants] = useState<ProductWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const products = await productService.getAllProductsWithVariants();
      setProductsWithVariants(products);
      setError(null);
    } catch (err) {
      console.error('Error loading products:', err);
      setError('Failed to load products. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue"></div>
        <p className="mt-2 text-gray-600">Loading products...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={loadProducts}
          className="bg-brand-blue text-white px-4 py-2 rounded-md hover:bg-opacity-90 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (productsWithVariants.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No products available at the moment.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Our Gear</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {productsWithVariants.map((productWithVariants) => (
          <ProductCard
            key={productWithVariants.product.id}
            productWithVariants={productWithVariants}
            addToCart={addToCart}
          />
        ))}
      </div>
    </div>
  );
};

export default ProductList;
