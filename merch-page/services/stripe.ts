import { loadStripe } from '@stripe/stripe-js';

// Let TypeScript know about our global variable from index.html
declare global {
  interface Window {
    STRIPE_PUBLISHABLE_KEY?: string;
  }
}

interface StripeLineItem {
  price: string;
  quantity: number;
}

const stripePublishableKey = window.STRIPE_PUBLISHABLE_KEY || '';

if (!stripePublishableKey.startsWith('pk_')) {
    console.error("Stripe publishable key is not set or is invalid. Please set window.STRIPE_PUBLISHABLE_KEY in your HTML file.");
}

const stripePromise = loadStripe(stripePublishableKey);

export const redirectToCheckout = async (lineItems: StripeLineItem[]) => {
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

  // Validate that all line items have stripe price IDs
  const invalidItems = lineItems.filter(item => !item.price || !item.price.startsWith('price_'));
  if (invalidItems.length > 0) {
    console.error("Some items don't have valid Stripe price IDs:", invalidItems);
    alert("Error: Some items in your cart are not properly configured for checkout. Please try again or contact support.");
    return;
  }

  const { error } = await stripe.redirectToCheckout({
    lineItems,
    mode: 'payment',
    successUrl: `${window.location.origin}/merchandise/?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${window.location.origin}/merchandise/`,
  });

  if (error) {
    console.error("Stripe checkout error:", error);
    alert(`An error occurred during checkout: ${error.message}`);
  }
};
