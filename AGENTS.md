# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

This is the waterwaycleanups.org website - a Hugo-based static site with integrated React components for environmental cleanup events. It uses the Hugobricks theme and includes a full-featured React merchandise storefront with Stripe integration.

## Common Commands

### Development
- `npm run dev` - Start development server with asset watching (recommended for active development)
- `npm run start` - Build assets once and start Hugo server
- `hugo server` - Start Hugo server only (without asset building)

### Building & Assets
- `npm run build` - Full production build (builds assets + Hugo site)
- `npm run build:assets` - Build frontend assets only (CSS + JS via Webpack)
- `npm run watch:assets` - Watch and rebuild assets during development
- `npm run clean` - Clean generated assets

### Merchandise System
- `npm run build:merch` - Build React merchandise storefront
- `npm run sync-products` - Sync products to Stripe and rebuild merch app
- `npm run sync-products:dry-run` - Preview product sync without applying changes
- `npm run sync-products:verbose` - Sync with detailed output

### Testing & Linting
No specific test or lint commands are configured. The project relies on Hugo's built-in validation and build process.

## Architecture Overview

### Hugo Static Site Generator
- **Theme**: Hugobricks (content brick system)
- **Content**: Markdown files in `content/en/` using Hugo shortcodes/bricks
- **Config**: `config.yaml` with site-wide settings including Stripe configuration
- **Layouts**: Custom layouts in `layouts/` override theme defaults

### Frontend Build System
- **Webpack**: Compiles React components and Tailwind CSS
- **Entry Points**:
  - `static/css/src/tailwind.css` → `static/css/tailwind-output.css`
  - React components in `static/js/react-components/` → bundled JS files
- **Output**: Assets placed in `static/` directory for Hugo to serve

### React Merchandise System
- **Source**: `merch-page/` directory (TypeScript/React)
- **Build Tool**: esbuild (not Webpack)
- **Output**: `static/merch-page/app.js`
- **Integration**: Hugo layout at `layouts/merchandise/list.html` loads the compiled app
- **External Dependencies**: React, React-DOM, and Stripe loaded via importmap

### Stripe Integration
- Products synced to Stripe via `scripts/sync-products.js`
- Product data stored in `public/data/products.json`
- Publishable key configured in Hugo params, injected into frontend
- Checkout handled by Stripe-hosted pages

## Key File Locations

### Content & Configuration
- `content/en/` - All site content (events, pages, etc.)
- `config.yaml` - Hugo configuration including Stripe keys
- `data/` - YAML data files for components like galleries

### Styling & Assets
- `static/css/src/tailwind.css` - Tailwind CSS source
- `tailwind.config.js` - Tailwind configuration with DaisyUI
- `postcss.config.js` - PostCSS configuration
- `webpack.config.js` - Asset build configuration

### React Components
- `static/js/react-components/` - Legacy React components (parallax, date)
- `merch-page/` - Modern merchandise system (TypeScript)
- `layouts/partials/react_*.html` - Hugo templates for React integration

### Scripts & Tools
- `scripts/sync-products.js` - Stripe product synchronization
- `scripts/product-manager.js` - Interactive CLI for product management

## Development Workflow

### Content Changes
1. Edit markdown files in `content/en/`
2. Use Hugo shortcodes (bricks) for consistent styling
3. Run `hugo server` or `npm run dev` to preview

### Asset Changes (CSS/JS)
1. Edit files in `static/css/src/` or `static/js/react-components/`
2. Run `npm run watch:assets` for automatic rebuilding
3. Or use `npm run dev` which includes asset watching

### Merchandise System Changes
1. Edit files in `merch-page/`
2. Run `npm run build:merch` to compile
3. Test on `/merchandise` page

### Product Management
1. Use `npm run products` to run the interactive CLI tool
2. Create products with variants using the CLI
3. Run `npm run sync-products:dry-run` to preview Stripe sync
4. Run `npm run sync-products` to sync products to Stripe and rebuild
5. Products with variants automatically appear on merchandise page

## Important Notes

- **Hugobricks Theme**: Content is built using shortcode "bricks" for consistent styling
- **Dual React Systems**: Legacy components use Webpack, merchandise uses esbuild
- **External Dependencies**: Merchandise app uses importmap for React/Stripe (not bundled)
- **Stripe Configuration**: Publishable key in Hugo config, secret key in environment variables
- **Asset Pipeline**: CSS/JS built to `tmp/webpack/` then copied to `static/`
- **No Tests**: Project doesn't have automated testing setup

## Environment Variables
- `STRIPE_SECRET_KEY` - Required for product sync script

## Deployment
The site builds to `public/` directory via `npm run build` and can be deployed to any static hosting service.

## Guidelines

- Please don't create unnecessary documentation for every single thing you do.