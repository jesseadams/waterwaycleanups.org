
import React from 'react';
import CartIcon from './icons/CartIcon';

interface HeaderProps {
  onCartClick: () => void;
  cartCount: number;
}

const Header: React.FC<HeaderProps> = ({ onCartClick, cartCount }) => {
  return (
    <header className="bg-white shadow-md sticky top-0 z-20">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
            <img src="https://waterwaycleanups.org/images/logo.png" alt="Waterway Cleanups Logo" className="h-12"/>
            <h1 className="text-2xl font-bold text-brand-blue tracking-wide">
                Merchandise
            </h1>
        </div>
        <button
          onClick={onCartClick}
          className="relative text-gray-600 hover:text-brand-teal transition-colors duration-200"
          aria-label={`Open cart with ${cartCount} items`}
        >
          <CartIcon />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-brand-teal text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

export default Header;
