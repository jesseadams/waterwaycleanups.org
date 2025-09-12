
export interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  images: string[];
  description: string;
  stripePriceId: string;
}

export interface CartItem extends Product {
  quantity: number;
}
