import { loadStripe } from '@stripe/stripe-js';
import type { CartItem } from '../types';

// Let TypeScript know about our global variable from index.html
declare global {
  interface Window {
    STRIPE_PUBLISHABLE_KEY?: string;
  }
}

const stripePublishableKey = window.STRIPE_PUBLISHABLE_KEY || '';

if (!stripePublishableKey.startsWith('pk_')) {
    console.error("Stripe publishable key is not set or is invalid. Please set window.STRIPE_PUBLISHABLE_KEY in your HTML file.");
}

const stripePromise = loadStripe(stripePublishableKey);

export const redirectToCheckout = async (items: CartItem[]) => {
  const stripe = await stripePromise;

  if (!stripe) {
    console.error("Stripe.js has not loaded yet.");
    alert("Error: Payment system is not available. Please try again later.");
    return;
  }
  
  if (!stripePublishableKey.startsWith('pk_')) {
      console.error("Stripe publishable key is not defined or invalid. Please set window.STRIPE_PUBLISHABLE_KEY in your HTML file.");
      alert("Error: Payment system is not configured. Please contact support.");
      return;
  }

  const lineItems = items.map(item => ({
    price: item.stripePriceId,
    quantity: item.quantity,
  }));

  const { error } = await stripe.redirectToCheckout({
    lineItems,
    mode: 'payment',
    successUrl: `${window.location.origin}?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: window.location.origin,
  });

  if (error) {
    console.error("Stripe checkout error:", error);
    alert(`An error occurred during checkout: ${error.message}`);
  }
};
