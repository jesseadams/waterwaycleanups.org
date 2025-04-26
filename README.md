[![](/hugobricks.jpg)](https://vimeo.com/862118474)

# What is Hugobricks?

[View DEMO website](https://www.hugobricks.preview.usecue.com/)

Hugobricks is a free website theme for Hugo. It makes building Hugo websites child's play due to its stackable (LEGO-like) content bricks. Stack an intro brick on top of some image bricks and a pricing table and build a complete website in seconds!

In the past you may have chosen a Wordpress theme and adjusted the images, colors and fonts to the needs of your client. In combination with tools like Gutenberg blocks and page builders like Elementor there was little that could compete with the development speed and flexibility that Wordpress offered. With Hugobricks we bring these advantages to the Jamstack eco-system. If you choose for the Hugobricks theme you get not just a head start, tremendous flexibility and lots of ready to use and reusable components, but also a lightning fast and unbreakable architecture. What are you waiting for? The future is here!

## Quick Start Guide

### Prerequisites
- [Hugo](https://gohugo.io/installation/) (Extended version recommended)
- [Node.js](https://nodejs.org/) (for React components)
- [npm](https://www.npmjs.com/) (comes with Node.js)

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/waterways-cleanup.git
   cd waterways-cleanup
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   hugo server
   ```
   This will launch the website at http://localhost:1313/

### Working with React Components

This project includes React components for interactive elements like the parallax image effect and date displays.

1. Make changes to React components in the `static/js/react-components/` directory

2. Build the React components:
   ```bash
   npm run build
   ```
   This runs webpack to bundle the React components into JS files that Hugo can use

3. For automatic rebuilding during development:
   ```bash
   npm run watch
   ```
   This will rebuild components whenever you save changes

### Creating Content with Bricks

Content in Hugobricks is created using "bricks" - reusable content components. To create a new page:

1. Create a markdown file in the `content/` directory
2. Use brick shortcodes in your content:

```markdown
---
title: Page title
---
{{< brick_title >}}

# Title 1
Your first paragraph with some lorem ipsum dolor sit amet.

{{< /brick_title >}}

{{< brick_parallax_image src="/uploads/waterway-cleanups/waterways-3.png" alt="Waterway Cleanup" >}}
## Join Our Next Cleanup
Sign up today to make a difference
{{< /brick_parallax_image >}}

{{< brick_cta >}}
{{< /brick_cta >}}
```

3. See the [Bricks Documentation](https://www.hugobricks.preview.usecue.com/docs/bricks/) for a complete list of available bricks and their options

## What's included in Hugobricks?

Hugobricks is a comprehensive starter theme that includes everything you need to get started with your Hugo project.

- 10+ Pre-build pages
- 99+ Google Pagespeed Score
- Built with Hugo and CSS variables for easy styling
- Fully responsive on all devices
- SEO-optimized for better search engine rankings
- React components for interactive elements
- Automated build tools with webpack

## Available Bricks

The following bricks are available for use in the content:

- Title (`brick_title`) - Section headings with various layouts
- Text (`brick_text`) - Text content with customizable columns
- Images (`brick_images`) - Image galleries and grid layouts
- Parallax Images (`brick_parallax_image`) - Scrolling parallax effect images
- Hero Sections (`brick_hero`) - Large header sections with background images
- Call to Action (`brick_cta`) - CTA buttons and sections
- Events (`brick_events`) - Event listings with filtering
- Maps (`brick_map`) - Interactive maps
- Forms (`brick_form`) - Contact and submission forms
- Pricing (`brick_pricing`) - Pricing tables
- Testimonials (`brick_testimonials`) - Customer reviews and quotes

For full documentation and examples of each brick, see the [Brick Documentation](https://www.hugobricks.preview.usecue.com/docs/bricks/).

## Deployment

To build the site for production:

```bash
npm run build   # Build React components
hugo            # Build the Hugo site
```

The built site will be in the `public/` directory, ready for deployment to any static hosting service.

## Working with Layouts

Hugo uses a template inheritance system where layouts define the structure of your pages. Understanding how to work with layouts is crucial for customizing your site beyond the brick system.

### Layout Directory Structure

The Hugobricks theme layouts are organized as follows:

- `themes/hugobricks/layouts/` - Base theme layouts
  - `_default/` - Default templates for list and single pages
  - `partials/` - Reusable template parts included in other templates
  - `shortcodes/` - Brick shortcode definitions
  - Other folders for specific content types (posts, products, etc.)

### How to Override Theme Layouts

To customize layouts from the Hugobricks theme:

1. **Create matching files in your site's layouts directory**

   Hugo follows the "most specific wins" rule. Files in your project's `layouts/` directory take precedence over theme layouts.

   ```bash
   # Example: Override the default single page template
   mkdir -p layouts/_default
   cp themes/hugobricks/layouts/_default/single.html layouts/_default/
   ```

2. **Modify the copied file** to implement your customizations

3. **For partial overrides**, copy only the specific partial files you need to modify:

   ```bash
   # Example: Override just the header partial
   mkdir -p layouts/partials
   cp themes/hugobricks/layouts/partials/header.html layouts/partials/
   ```

### Extending Theme Layouts

Instead of completely overriding a layout, you can extend it:

1. **Create a new layout file** in your site's `layouts/` directory

2. **Use the `partial` function** to include parts from the original theme:

   ```html
   <!-- Example: layouts/_default/single.html -->
   {{ define "main" }}
     <!-- Your custom content -->
     <div class="custom-container">
       {{ .Content }}
     </div>
     
     <!-- Include a partial from the theme -->
     {{ partial "related-posts.html" . }}
   {{ end }}
   ```

3. **Use block definitions** to extend base templates:

   ```html
   <!-- Extend a base template but override specific blocks -->
   {{ define "main" }}
     <!-- This replaces the "main" block in the parent template -->
     <h1>Custom Header</h1>
     {{ .Content }}
   {{ end }}
   ```

### Creating New Layout Types

To create completely new layout types:

1. **Create new template files** in the appropriate directory:

   ```bash
   # For a new content type "projects"
   mkdir -p layouts/projects
   touch layouts/projects/single.html
   touch layouts/projects/list.html
   ```

2. **Use front matter** in your content files to specify which layout to use:

   ```yaml
   ---
   title: My Project
   layout: projects/single
   ---
   ```

## Hugobricks workflow

Hugobricks aims to enhance the Hugo web framework by providing a variety of pre-made bricks for straightforward website-building. Our companion project, [hugocodex](https://hugocodex.org), guides beginners in starting a Hugo project from scratch. For those who already have experience with Hugo and want to use it for rapid prototyping and iterating, Hugobricks offers premade websites and customizable components powered by Hugo. Cloning this repository allows you to start building lightning-fast static sites with flexibility and ease with and already working website. Here is an example of two bricks (title and cta):

```
---
title: Page title
---
{{< brick_title >}}

# Title 1
Your first paragraph with some lorem ipsum dolor sit amet.

{{< /brick_title >}}
{{< brick_cta >}}

{{< /brick_cta >}}
```

## Customizing Bricks

To customize existing bricks or create new ones:

1. Brick templates are located in `layouts/shortcodes/` directory
2. Partial templates used by bricks are in `layouts/partials/` directory
3. CSS styles are in `static/css/` directory

## Hugobricks under the Hood

Hugobricks is build with the regular [Hugo](https://gohugo.io/overview/introduction/) building blocks, like [shortcodes](https://gohugo.io/content-management/shortcodes/#what-a-shortcode-is), [partials](https://gohugo.io/templates/partials/) and [layouts](https://gohugo.io/templates/base/). Hugobricks takes advantage of these things to allow content re-use, pivot around content and layouts, and calling the required styling and functional logic.

## Hugobricks Feedback 

Make your wishlist. Missing a given Hugobrick? [Let us know.](https://github.com/jhvanderschee/hugobricks/issues/5)


## Credits and licenses

The functionality is inspired by the many [Gutenberg Block Plugins](https://wpastra.com/plugins/wordpress-gutenberg-block-plugins/) that are available online. The design is based on the MIT licensed [Hugoplate from Zeon Studio](https://github.com/zeon-studio/hugoplate.git). The fonts and icons are Apache Licensed and come from [Google Fonts](https://fonts.google.com) and [Google Material Symbols](https://fonts.google.com/icons). The illustrations are free to use but require [an attribution to Storyset](https://storyset.com/terms). The avatars are CC0 licensed and come from [Pravatar](https://www.pravatar.cc/images). The paragliding photos are provided by and property of the [Flyspot Airsports & Travel Agency](https://flyspot.com.tr/) and cannot be used elsewhere without written permission of Flyspot. All other photos come from [Unsplash](https://unsplash.com/license) and are free to use. The social media icons (Facebook, Instagram, etc) belong to the respective social networks/their owners.


