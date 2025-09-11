
import type { Product } from '../types';

// NOTE: For a real application, this data should be fetched from a secure backend.
// The `stripePriceId` must correspond to a Price ID in your Stripe account.
export const products: Product[] = [
  {
    id: 'tshirt-001',
    name: 'Waterway Cleanups Supporter T-Shirt',
    price: 25.00,
    currency: 'USD',
    images: [
      'https://picsum.photos/seed/wcshirt1/600/600',
      'https://picsum.photos/seed/wcshirt2/600/600',
      'https://picsum.photos/seed/wcshirt3/600/600',
    ],
    description: 'Show your support with this 100% organic cotton t-shirt. Comfortable, durable, and eco-friendly. All proceeds go directly to our cleanup efforts.',
    stripePriceId: 'price_1PflA2Rx5hAZ4SZbD7h9yX32', // Replace with your actual Stripe Price ID
  },
  {
    id: 'hat-001',
    name: 'Cleanup Crew Cap',
    price: 22.00,
    currency: 'USD',
    images: [
      'https://picsum.photos/seed/wchat1/600/600',
    ],
    description: 'A stylish and practical cap made from recycled materials. Perfect for sunny days out on the water or just showing your support around town.',
    stripePriceId: 'price_1PflBHRx5hAZ4SZb4X9o0802', // Replace with your actual Stripe Price ID
  },
  {
    id: 'bottle-001',
    name: 'Reusable Water Bottle',
    price: 18.50,
    currency: 'USD',
    images: [
      'https://picsum.photos/seed/wcbottle1/600/600',
      'https://picsum.photos/seed/wcbottle2/600/600',
    ],
    description: 'Stay hydrated and reduce plastic waste with our branded reusable water bottle. Stainless steel, insulated, and built to last.',
    stripePriceId: 'price_1PflCFRx5hAZ4SZbQy6M9k1c', // Replace with your actual Stripe Price ID
  },
];
