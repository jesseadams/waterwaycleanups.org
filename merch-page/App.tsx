
import React, { useState } from 'react';
import ProductList from './components/ProductList';
import Cart from './components/Cart';
import { useCart } from './hooks/useCart';

const App: React.FC = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cart = useCart();

  return (
    <div className="font-sans antialiased text-gray-800">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-brand-blue">Merchandise</h1>
        <button
          onClick={() => setIsCartOpen(true)}
          className="relative text-gray-600 hover:text-brand-teal transition-colors duration-200 bg-white rounded-lg p-3 shadow-md"
          aria-label={`Open cart with ${cart.getTotalItems()} items`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m4.5-6h6" />
          </svg>
          {cart.getTotalItems() > 0 && (
            <span className="absolute -top-2 -right-2 bg-brand-teal text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {cart.getTotalItems()}
            </span>
          )}
        </button>
      </div>
      <main>
        <ProductList addToCart={cart.addToCart} />
      </main>
      <Cart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        {...cart}
      />
    </div>
  );
};

export default App;
