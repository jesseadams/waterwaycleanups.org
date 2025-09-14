
import React, { useState, useEffect } from 'react';
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
