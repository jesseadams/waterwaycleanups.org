
import React, { useState } from 'react';
import type { Product } from '../types';

interface ProductCardProps {
  product: Product;
  addToCart: (product: Product, quantity: number) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, addToCart }) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const handleAddToCart = () => {
    addToCart(product, 1);
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col transition-transform duration-300 hover:scale-105">
      <div className="relative">
        <img
          src={product.images[selectedImageIndex]}
          alt={`${product.name} - view ${selectedImageIndex + 1}`}
          className="w-full h-80 object-cover"
        />
        {product.images.length > 1 && (
             <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex space-x-2">
                {product.images.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => setSelectedImageIndex(index)}
                        className={`h-2 w-2 rounded-full transition-colors ${selectedImageIndex === index ? 'bg-white' : 'bg-white/50 hover:bg-white'}`}
                        aria-label={`View image ${index + 1}`}
                    />
                ))}
            </div>
        )}
      </div>
      <div className="p-6 flex flex-col flex-grow">
        <h3 className="text-xl font-bold text-gray-900">{product.name}</h3>
        <p className="text-lg font-semibold text-brand-teal mt-1">
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: product.currency }).format(product.price)}
        </p>
        <p className="text-gray-600 mt-2 flex-grow">{product.description}</p>
        <button
          onClick={handleAddToCart}
          className="mt-4 w-full bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
