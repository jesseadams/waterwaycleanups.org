# Waterway Cleanups Merchandise System

This documentation covers the React-based merchandise storefront integrated into the waterwaycleanups.org Hugo site.

## Architecture Overview

The merchandise system consists of:

- **Source Code**: `merch-page/` directory containing React/TypeScript components
- **Build System**: esbuild via `npm run build-merch` command
- **Output**: `static/merch-page/app.js` - compiled React application
- **Integration**: Hugo layout template that loads the compiled app

## Features

- **Product Display**: Shows merchandise with details and multiple images
- **Shopping Cart**: Add/remove items and adjust quantities
- **Stripe Checkout**: Secure payment processing via Stripe
- **Responsive Design**: Mobile-friendly interface using Tailwind CSS
- **Hugo Integration**: Seamlessly embedded into the static site

## File Structure

```
merch-page/                     # Source code (React/TypeScript)
├── App.tsx                     # Main React component
├── index.tsx                   # Entry point
├── types.ts                    # TypeScript definitions
├── components/                 # React components
│   ├── Header.tsx
│   ├── ProductList.tsx
│   ├── Cart.tsx
│   └── CartItem.tsx
├── hooks/                      # Custom React hooks
│   └── useCart.ts
├── data/                       # Product data
│   └── products.ts
└── services/                   # External integrations
    └── stripe.ts

static/merch-page/              # Build output
└── app.js                      # Compiled React application

layouts/merchandise/            # Hugo templates
└── list.html                   # Page template that loads the app
```

## Build System

### Build Command
```bash
npm run build-merch
```

This runs esbuild to compile `merch-page/index.tsx` into `static/merch-page/app.js` with:
- TypeScript compilation
- React JSX processing
- External dependencies (React, Stripe) excluded from bundle
- Minification enabled

### External Dependencies
The app relies on these external libraries loaded via importmap in the Hugo template:
- `react` & `react-dom` - React framework
- `@stripe/stripe-js` - Stripe JavaScript SDK

## Configuration

### Stripe Integration

The Stripe publishable key is configured in Hugo's site parameters and injected into the app:

**hugo.yaml/config.yaml:**
```yaml
params:
  stripe_publishable_key: "pk_live_YOUR_PUBLISHABLE_KEY"
```

**Hugo Template (`layouts/merchandise/list.html`):**
```html
<script>
  window.STRIPE_PUBLISHABLE_KEY = '{{ site.Params.stripe_publishable_key | safeJS }}';
</script>
```

### Product Management

Products are defined in `merch-page/data/products.ts`. Each product requires:

1. **Stripe Setup**: Create product and price in Stripe Dashboard
2. **Product Entry**: Add to products array with Stripe Price ID

```typescript
{
  id: "unique-id",
  name: "Product Name",
  price: 25.00,
  currency: "USD",
  images: ["https://example.com/image.jpg"],
  description: "Product description",
  stripePriceId: "price_1ABC123..." // From Stripe Dashboard
}
```

## Hugo Integration

The merchandise page is integrated via Hugo's layout system:

**Content Page (`content/en/merchandise/_index.md`):**
```yaml
---
title: Merchandise
type: merchandise
---

Support Waterway Cleanups with our eco-friendly merchandise!
```

**Layout Template (`layouts/merchandise/list.html`):**
- Provides HTML structure and styling setup
- Loads external dependencies via importmap
- Injects Stripe configuration
- Loads the compiled React app: `<script type="module" src="/merch-page/app.js"></script>`

## Development Workflow

1. **Make Changes**: Edit files in `merch-page/`
2. **Build**: Run `npm run build-merch`
3. **Test**: Visit the merchandise page on the Hugo site
4. **Deploy**: Commit changes and deploy site

## Key Components

### App.tsx
Main component that orchestrates the entire application, manages cart state via useCart hook.

### useCart Hook
Manages shopping cart state including:
- Adding/removing items
- Updating quantities  
- Cart persistence
- Total calculations

### Stripe Service
Handles checkout flow:
- Loads Stripe.js library
- Creates checkout sessions
- Redirects to Stripe-hosted checkout
- Error handling

## Security Notes

- Stripe publishable key is safe to expose on frontend
- Payment processing handled securely by Stripe
- No sensitive data stored in frontend code
- Product prices verified server-side by Stripe

## Maintenance

### Adding New Products
1. Create product and price in Stripe Dashboard
2. Add entry to `merch-page/data/products.ts`
3. Build and deploy

### Updating Styles
- Components use Tailwind CSS classes
- Global styles loaded via Hugo template
- Custom brand colors defined in Tailwind config

### Monitoring
- Stripe Dashboard for payment monitoring
- Browser console for frontend errors
- Hugo build logs for compilation issues