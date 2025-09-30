
import React, { useState, useEffect } from 'react';
import type { ProductWithVariants, ProductVariant, SelectedVariant, CartItem } from '../types';
import { productService } from '../services/productService';

interface ProductCardProps {
  productWithVariants: ProductWithVariants;
  addToCart: (cartItem: CartItem) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ productWithVariants, addToCart }) => {
  const { product, dimensions, variants } = productWithVariants;
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [selectedVariant, setSelectedVariant] = useState<SelectedVariant | null>(null);
  const [availableOptions, setAvailableOptions] = useState<Record<string, any[]>>({});

  useEffect(() => {
    updateAvailableOptions();
  }, [selections]);

  useEffect(() => {
    if (Object.keys(selections).length === dimensions.length) {
      findSelectedVariant();
    } else {
      setSelectedVariant(null);
    }
  }, [selections, dimensions]);

  const updateAvailableOptions = async () => {
    const newAvailableOptions: Record<string, any[]> = {};

    for (const dimension of dimensions) {
      const otherSelections = { ...selections };
      delete otherSelections[dimension.id];

      const availableValues = await productService.getAvailableValuesForDimension(
        product.id,
        dimension.id,
        otherSelections
      );

      newAvailableOptions[dimension.id] = availableValues;
    }

    setAvailableOptions(newAvailableOptions);
  };

  const findSelectedVariant = async () => {
    const variant = await productService.findVariantBySelections(product.id, selections);
    setSelectedVariant(variant);
  };

  const handleSelectionChange = (dimensionId: string, valueId: string) => {
    setSelections(prev => ({
      ...prev,
      [dimensionId]: valueId
    }));
  };

  const getDisplayPrice = (): string => {
    if (selectedVariant) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: selectedVariant.variant.currency
      }).format(selectedVariant.variant.price / 100);
    }

    const prices = variants.map(v => v.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    if (minPrice === maxPrice) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: variants[0].currency
      }).format(minPrice / 100);
    }

    return `${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: variants[0].currency
    }).format(minPrice / 100)} - ${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: variants[0].currency
    }).format(maxPrice / 100)}`;
  };

  const isAddToCartDisabled = (): boolean => {
    if (!selectedVariant) return true;

    if (selectedVariant.variant.inventory_tracking) {
      return selectedVariant.variant.inventory_quantity <= 0;
    }

    return false;
  };

  const getAddToCartButtonText = (): string => {
    if (!selectedVariant) {
      const unselectedDimensions = dimensions
        .filter(d => !selections[d.id])
        .map(d => d.name);

      if (unselectedDimensions.length > 0) {
        return `Select ${unselectedDimensions.join(', ')}`;
      }
      return 'Select Options';
    }

    if (selectedVariant.variant.inventory_tracking && selectedVariant.variant.inventory_quantity <= 0) {
      return 'Out of Stock';
    }

    return 'Add to Cart';
  };

  const handleAddToCart = () => {
    if (!selectedVariant) return;

    const cartItem: CartItem = {
      variant: selectedVariant.variant,
      product: product,
      selections: selections,
      quantity: 1
    };

    addToCart(cartItem);
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
                className={`h-2 w-2 rounded-full transition-colors ${
                  selectedImageIndex === index ? 'bg-white' : 'bg-white/50 hover:bg-white'
                }`}
                aria-label={`View image ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="p-6 flex flex-col flex-grow">
        <h3 className="text-xl font-bold text-gray-900">{product.name}</h3>
        <p className="text-lg font-semibold text-brand-teal mt-1">
          {getDisplayPrice()}
        </p>
        <p className="text-gray-600 mt-2">{product.description}</p>

        {/* Variant Selection */}
        <div className="mt-4 space-y-4">
          {dimensions.map((dimension) => (
            <div key={dimension.id}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {dimension.name}
                {dimension.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <select
                value={selections[dimension.id] || ''}
                onChange={(e) => handleSelectionChange(dimension.id, e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent"
                required={dimension.required}
              >
                <option value="">Select {dimension.name}</option>
                {(availableOptions[dimension.id] || []).map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.value}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Inventory Status */}
        {selectedVariant && selectedVariant.variant.inventory_tracking && (
          <div className="mt-2">
            <p className={`text-sm ${
              selectedVariant.variant.inventory_quantity > 0
                ? selectedVariant.variant.inventory_quantity <= 5
                  ? 'text-yellow-600'
                  : 'text-green-600'
                : 'text-red-600'
            }`}>
              {selectedVariant.variant.inventory_quantity > 0
                ? selectedVariant.variant.inventory_quantity <= 5
                  ? `Only ${selectedVariant.variant.inventory_quantity} left in stock`
                  : `${selectedVariant.variant.inventory_quantity} in stock`
                : 'Out of stock'}
            </p>
          </div>
        )}

        <button
          onClick={handleAddToCart}
          disabled={isAddToCartDisabled()}
          className={`mt-4 w-full font-bold py-2 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue ${
            isAddToCartDisabled()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-brand-blue text-white hover:bg-opacity-90'
          }`}
        >
          {getAddToCartButtonText()}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
