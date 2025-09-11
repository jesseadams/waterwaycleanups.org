# Waterway Cleanups Merchandise Page

This is a React application that serves as a merchandise storefront for waterwaycleanups.org. It's built with React, TypeScript, and Tailwind CSS (via CDN), and integrates with Stripe for checkout. It is designed to be self-contained and easily embeddable into a Hugo static site without a complex build process.

## Features

- **Product Display**: Shows merchandise with details and multiple images.
- **Shopping Cart**: Allows users to add/remove items and adjust quantities.
- **Stripe Checkout**: A seamless, secure checkout process powered by Stripe.
- **Embeddable**: Designed to be easily dropped into a Hugo static site.

## Setup & Configuration

### 1. Stripe Publishable Key

This project requires a Stripe Publishable Key to connect to the Stripe checkout service.

For local development, you must edit `index.html` and set your key:

```html
<!-- in index.html, inside the <head> tag -->
<script>
  // This global variable must be set with your Stripe publishable key.
  window.STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_PUBLISHABLE_KEY'; 
</script>
```

**Note**: You can get your publishable key from your [Stripe Dashboard](https://dashboard.stripe.com/apikeys). For production environments like Hugo, it's best to inject this key using environment variables or site configuration (see Hugo Integration section).

### 2. Product Management

Product information is currently managed in `data/products.ts`. This was done to meet the frontend-only requirement.

To add or update products:

1.  **Create the product and its price in your Stripe Dashboard.**
2.  Copy the **Price ID** (it will look like `price_...`).
3.  Add a new entry to the `products` array in `data/products.ts`, filling in the details and the Stripe Price ID.

For a production environment, it is highly recommended to fetch product data from a secure backend API that communicates with Stripe using a secret key, rather than hardcoding it on the frontend.

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
