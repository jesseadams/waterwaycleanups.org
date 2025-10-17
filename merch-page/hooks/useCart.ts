
import { useState, useCallback } from 'react';
import type { CartItem } from '../types';

export const useCart = () => {
  const [items, setItems] = useState<CartItem[]>([]);

  const addToCart = useCallback((cartItem: CartItem) => {
    setItems(prevItems => {
      // Look for existing item with same variant
      const existingItem = prevItems.find(item => item.variant.id === cartItem.variant.id);

      if (existingItem) {
        // Update quantity of existing item
        return prevItems.map(item =>
          item.variant.id === cartItem.variant.id
            ? { ...item, quantity: item.quantity + cartItem.quantity }
            : item
        );
      }

      // Add new item to cart
      return [...prevItems, cartItem];
    });
  }, []);

  const removeFromCart = useCallback((variantId: string) => {
    setItems(prevItems => prevItems.filter(item => item.variant.id !== variantId));
  }, []);

  const updateQuantity = useCallback((variantId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(variantId);
      return;
    }
    setItems(prevItems =>
      prevItems.map(item =>
        item.variant.id === variantId
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const getTotalPrice = useCallback(() => {
    return items.reduce((total, item) => {
      return total + (item.variant.price * item.quantity);
    }, 0);
  }, [items]);

  const getTotalItems = useCallback(() => {
    return items.reduce((total, item) => total + item.quantity, 0);
  }, [items]);

  return {
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotalPrice,
    getTotalItems,
  };
};
