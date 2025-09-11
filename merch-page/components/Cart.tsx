
import React, { useEffect, useMemo } from 'react';
import CartItemComponent from './CartItem';
import CloseIcon from './icons/CloseIcon';
import type { CartItem } from '../types';
import { redirectToCheckout } from '../services/stripe';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, newQuantity: number) => void;
}

const Cart: React.FC<CartProps> = ({ isOpen, onClose, items, removeFromCart, updateQuantity }) => {
  const [isCheckingOut, setIsCheckingOut] = React.useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  const subtotal = useMemo(() => {
    return items.reduce((total, item) => total + item.price * item.quantity, 0);
  }, [items]);

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    await redirectToCheckout(items);
    setIsCheckingOut(false); // This line might not be reached if redirect succeeds
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-heading"
      >
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center p-6 border-b">
            <h2 id="cart-heading" className="text-2xl font-bold text-brand-blue">Shopping Cart</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors">
              <CloseIcon />
              <span className="sr-only">Close cart</span>
            </button>
          </div>
          
          {items.length === 0 ? (
            <div className="flex-grow flex flex-col justify-center items-center text-center p-6">
              <p className="text-gray-600 text-lg">Your cart is empty.</p>
              <button onClick={onClose} className="mt-4 text-brand-teal font-semibold hover:underline">
                Continue Shopping
              </button>
            </div>
          ) : (
            <>
              <div className="flex-grow overflow-y-auto p-6 space-y-4">
                {items.map(item => (
                  <CartItemComponent
                    key={item.id}
                    item={item}
                    onRemove={removeFromCart}
                    onUpdateQuantity={updateQuantity}
                  />
                ))}
              </div>
              <div className="p-6 border-t space-y-4">
                <div className="flex justify-between font-bold text-lg">
                  <span>Subtotal</span>
                  <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(subtotal)}</span>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={isCheckingOut}
                  className="w-full bg-brand-blue text-white font-bold py-3 px-4 rounded-md hover:bg-opacity-90 transition-colors duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isCheckingOut ? 'Processing...' : 'Proceed to Checkout'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default Cart;
