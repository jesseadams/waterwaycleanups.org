
import React from 'react';
import type { CartItem } from '../types';

interface CartItemProps {
  item: CartItem;
  onRemove: (productId: string) => void;
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
}

const CartItemComponent: React.FC<CartItemProps> = ({ item, onRemove, onUpdateQuantity }) => {
  
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      onUpdateQuantity(item.id, value);
    }
  };

  const increment = () => onUpdateQuantity(item.id, item.quantity + 1);
  const decrement = () => {
    if (item.quantity > 1) {
      onUpdateQuantity(item.id, item.quantity - 1);
    } else {
      onRemove(item.id);
    }
  };

  return (
    <div className="flex items-center space-x-4 border-b pb-4">
      <img src={item.images[0]} alt={item.name} className="w-20 h-20 object-cover rounded-md" />
      <div className="flex-grow">
        <h4 className="font-bold">{item.name}</h4>
        <p className="text-sm text-gray-600">{new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency }).format(item.price)}</p>
        <div className="flex items-center mt-2">
          <button onClick={decrement} className="w-6 h-6 border rounded-l-md">-</button>
          <input
            type="number"
            value={item.quantity}
            onChange={handleQuantityChange}
            className="w-10 h-6 text-center border-t border-b"
            min="1"
          />
          <button onClick={increment} className="w-6 h-6 border rounded-r-md">+</button>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency }).format(item.price * item.quantity)}</p>
        <button onClick={() => onRemove(item.id)} className="text-sm text-red-500 hover:underline mt-1">
          Remove
        </button>
      </div>
    </div>
  );
};

export default CartItemComponent;
