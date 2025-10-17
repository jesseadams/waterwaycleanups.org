
import React from 'react';
import type { CartItem } from '../types';

interface CartItemProps {
  item: CartItem;
  onRemove: (variantId: string) => void;
  onUpdateQuantity: (variantId: string, newQuantity: number) => void;
}

const CartItemComponent: React.FC<CartItemProps> = ({ item, onRemove, onUpdateQuantity }) => {

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      onUpdateQuantity(item.variant.id, value);
    }
  };

  const increment = () => onUpdateQuantity(item.variant.id, item.quantity + 1);
  const decrement = () => {
    if (item.quantity > 1) {
      onUpdateQuantity(item.variant.id, item.quantity - 1);
    } else {
      onRemove(item.variant.id);
    }
  };

  const getVariantDisplayName = () => {
    const selectionValues = Object.values(item.selections);
    if (selectionValues.length > 0) {
      return `${item.product.name} - ${selectionValues.join(' - ')}`;
    }
    return item.product.name;
  };

  return (
    <div className="flex items-center space-x-4 border-b pb-4">
      <img
        src={item.product.images[0]}
        alt={item.product.name}
        className="w-20 h-20 object-cover rounded-md"
      />
      <div className="flex-grow">
        <h4 className="font-bold">{getVariantDisplayName()}</h4>
        <p className="text-xs text-gray-500 mb-1">SKU: {item.variant.sku}</p>
        <p className="text-sm text-gray-600">
          {new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: item.variant.currency
          }).format(item.variant.price / 100)}
        </p>

        {/* Show selected options */}
        {Object.keys(item.selections).length > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            {Object.entries(item.selections).map(([dimensionId, valueId]) => (
              <span key={dimensionId} className="inline-block mr-2">
                {valueId}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center mt-2">
          <button
            onClick={decrement}
            className="w-6 h-6 border rounded-l-md hover:bg-gray-50 flex items-center justify-center"
          >
            -
          </button>
          <input
            type="number"
            value={item.quantity}
            onChange={handleQuantityChange}
            className="w-10 h-6 text-center border-t border-b focus:outline-none"
            min="1"
          />
          <button
            onClick={increment}
            className="w-6 h-6 border rounded-r-md hover:bg-gray-50 flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold">
          {new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: item.variant.currency
          }).format((item.variant.price * item.quantity) / 100)}
        </p>
        <button
          onClick={() => onRemove(item.variant.id)}
          className="text-sm text-red-500 hover:underline mt-1"
        >
          Remove
        </button>
      </div>
    </div>
  );
};

export default CartItemComponent;
