
import React, { useState } from 'react';
import Header from './components/Header';
import ProductList from './components/ProductList';
import Cart from './components/Cart';
import { useCart } from './hooks/useCart';

const App: React.FC = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cart = useCart();

  return (
    <div className="font-sans antialiased text-gray-800">
      <Header onCartClick={() => setIsCartOpen(true)} cartCount={cart.items.length} />
      <main className="container mx-auto px-4 py-8">
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
