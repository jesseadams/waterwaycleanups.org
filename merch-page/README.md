# Waterway Cleanups Merchandise Frontend

This is the React/TypeScript frontend for the merchandise storefront. It features a modern variant-based product system with Stripe integration.

## Key Features

- **Variant-Based Products**: Support for multiple product dimensions (size, color, etc.)
- **Dynamic Pricing**: Automatic price calculation based on selected variants
- **Stripe Integration**: Secure checkout with individual Stripe products per variant
- **Inventory Tracking**: Real-time stock level display
- **Responsive Design**: Mobile-friendly interface using Tailwind CSS

## Architecture

- **Data Source**: `/public/data/products.json` (managed via CLI or direct editing)
- **Build Target**: `static/merch-page/app.js`
- **Entry Point**: `index.tsx`
- **Service Layer**: `services/productService.ts` for data access

## Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Stripe Key
Set your Stripe publishable key in the Hugo template or test HTML file:

```javascript
window.STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_KEY';
```

### 3. Build the Application
```bash
npm run build:merch
```

## Product Management

Products can be managed in two ways:

### Option 1: CLI Tool (Recommended)
```bash
npm run products  # Launch the product management CLI
```

### Option 2: Direct File Editing
Edit `/public/data/products.json` directly. The CLI provides a better interface, but all management features are not yet implemented, so direct editing is often necessary.

See `docs/product-management.md` and `docs/products-schema.md` for data structure documentation.

## Local Development

Simply open the `index.html` file in your web browser. A local web server is recommended to avoid issues with browser security policies (CORS). You can use a simple tool like `npx serve` or the "Live Server" extension in VS Code.

## Hugo Integration

This React app is designed to be embedded into a Hugo page. As it uses TypeScript/JSX, it must be processed by Hugo's asset pipeline (Hugo Pipes).

1.  **Copy Project Files:**
    -   Copy all the `.ts` and `.tsx` files into your Hugo project's `assets/js/merch-app/` directory.

2.  **Create the Hugo Template:**
    Create a new Hugo layout file, for example `layouts/merchandise/single.html`. Copy the contents of the project's `index.html` file into this new layout file.

3.  **Update the Hugo Template:**
    You will need to make a few changes to the template file to work within Hugo's system.

    *   **Set the Stripe Key:** Use Hugo's site parameters to securely inject your Stripe key.
        In your `hugo.toml` (or `config.toml`):
        ```toml
        [params]
          stripe_publishable_key = "pk_live_YOUR_PUBLISHABLE_KEY"
        ```
        Then, in your template, replace the hardcoded key:
        ```go-template
        {{/* from: */}}
        <script>
          window.STRIPE_PUBLISHABLE_KEY = 'pk_test_...'; 
        </script>

        {{/* to: */}}
        <script>
          window.STRIPE_PUBLISHABLE_KEY = '{{ site.Params.stripe_publishable_key | safeJS }}';
        </script>
        ```
    *   **Process the Main Script with Hugo Pipes:**
        Hugo needs to transpile the TypeScript/JSX file. Find the `<script>` tag for `index.tsx` at the bottom of the template and replace it with Hugo's asset processing pipe:
        ```go-template
        {{/* from: */}}
        <script type="module" src="./index.tsx"></script>

        {{/* to: */}}
        {{ $merchApp := resources.Get "js/merch-app/index.tsx" | js.Build (dict "target" "es2020") | resources.Minify }}
        <script type="module" src="{{ $merchApp.RelPermalink }}"></script>
        ```
        This tells Hugo to find, transpile, and minify your React application, and then includes the resulting JavaScript file.

4.  **Create the Content Page:**
    Create a markdown file like `content/merchandise.md` with `layout: merchandise` in its front matter to use the template you just created.
