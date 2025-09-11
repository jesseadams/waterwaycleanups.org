
import React from 'react';
import { products } from '../data/products';
import ProductCard from './ProductCard';
import type { Product } from '../types';

interface ProductListProps {
  addToCart: (product: Product, quantity: number) => void;
}

const ProductList: React.FC<ProductListProps> = ({ addToCart }) => {
  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Our Gear</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} addToCart={addToCart} />
        ))}
      </div>
    </div>
  );
};

export default ProductList;
