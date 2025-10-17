
import React, { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import ProductList from './components/ProductList';
import Cart from './components/Cart';
import { useCart } from './hooks/useCart';

const App: React.FC = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cart = useCart();

  // Connect the header cart button to the React app
  useEffect(() => {
    const headerCartBtn = document.getElementById('header-cart-btn');
    const cartCountElement = document.getElementById('cart-count');

    if (headerCartBtn) {
      const handleCartClick = () => setIsCartOpen(true);
      headerCartBtn.addEventListener('click', handleCartClick);

      // Update cart count in header
      if (cartCountElement) {
        cartCountElement.textContent = cart.getTotalItems().toString();
        if (cart.getTotalItems() > 0) {
          cartCountElement.classList.remove('hidden');
        } else {
          cartCountElement.classList.add('hidden');
        }
      }

      return () => {
        headerCartBtn.removeEventListener('click', handleCartClick);
      };
    }
  }, [cart.getTotalItems]);

  return (
    <div className="font-sans antialiased text-gray-800">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#004a8f',
            color: 'white',
            fontSize: '16px',
            fontWeight: '600',
            padding: '16px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0, 74, 143, 0.3)',
          },
        }}
        duration={4000}
      />
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
