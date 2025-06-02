# Waterway Cleanups

A modern, responsive website for organizing and promoting waterway cleanup events built with Hugo, Tailwind CSS, and React components using the Hugobricks theme.

## 📋 Project Overview

This project provides a complete solution for environmental organizations to:
- Showcase upcoming cleanup events
- Allow volunteers to register
- Share success stories and impact metrics
- Educate visitors about waterway conservation

## 🚀 Quick Start Guide

### Prerequisites
- [Hugo](https://gohugo.io/installation/) (Extended version recommended)
- [Node.js](https://nodejs.org/) (v18+ for React components)
- [npm](https://www.npmjs.com/) (comes with Node.js)

#### Installing Hugo

##### On macOS:
```bash
brew install hugo
```

##### On Windows:
```bash
choco install hugo-extended
```

##### On Linux:
```bash
# Debian/Ubuntu
sudo apt install hugo

# Snap
sudo snap install hugo
```

Verify installation:
```bash
hugo version
```

#### Installing Node.js and npm

##### On macOS:
```bash
brew install node
```

##### On Windows:
Download and install from [Node.js website](https://nodejs.org/)

##### On Linux:
```bash
# Debian/Ubuntu
sudo apt install nodejs npm

# Using NVM (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install --lts
```

Verify installation:
```bash
node --version
npm --version
```

### Installation

1. Clone this repository:
   ```bash
   mkdir waterwaycleanups.org
   cd waterwaycleanups.org
   git clone https://github.com/jesseadams/waterwaycleanups.org.git .
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run start
   ```
   This will build the assets and launch the website at http://localhost:1313/

## 🧩 Project Structure

- `content/en/` - Main content files organized by language
  - `_index.md` - Homepage content
  - `events.md` - Events listing page
  - `events/` - Individual event listings for cleanups
  - `contact.md` - Contact page
  - `projects.md` - Projects information page
  - `404.md` - Custom 404 error page
  - `bricks/` - Reusable brick content components
    - `cta.md` - Call to action component
    - `title.md` - Title component
    - `reviews.md` - Reviews component
- `layouts/` - Custom layout templates
  - `shortcodes/` - Brick shortcodes specific to this project
- `static/` - Static assets (images, CSS, JS)
  - `js/react-components/` - React component source files
  - `css/src/` - Tailwind CSS source files
- `themes/` - Contains the Hugobricks theme
- `data/` - Configuration data files
- `i18n/` - Internationalization files

## ⚙️ Development Workflow

### Available Scripts

- `npm run dev` - Start the Hugo development server with asset watching
- `npm run build` - Build the Hugo site for production
- `npm run build:assets` - Build frontend assets with Webpack
- `npm run watch:assets` - Watch and rebuild frontend assets during development
- `npm run build:css` - Build and minify Tailwind CSS
- `npm run watch:css` - Watch and rebuild Tailwind CSS during development
- `npm run start` - Build assets and start Hugo server
- `npm run clean` - Clean generated assets

### Recommended Development Workflow

For the most efficient development experience that watches all file changes (content, layouts, CSS, JavaScript, and React components):

```bash
npm run dev
```

This single command will:
- Start the Hugo development server with live reload
- Watch and rebuild frontend assets when changed
- Update the browser automatically when any files are modified

### Working with React Components

This project includes React components for interactive elements like the parallax image effect and date displays.

1. Make changes to React components in the `static/js/react-components/` directory

2. Build the React components:
   ```bash
   npm run build:assets
   ```
   This runs webpack to bundle the React components into JS files that Hugo can use

3. For automatic rebuilding during development:
   ```bash
   npm run watch:assets
   ```
   This will rebuild components whenever you save changes

## 📄 Content Pages

The site consists of the following main pages:

### Homepage (`content/en/_index.md`)
The main landing page featuring:
- Hero section with call-to-action
- Upcoming events listing
- Sponsors and partners gallery
- Call-to-action for donations

### Events Page (`content/en/events.md`)
A comprehensive listing of all cleanup events with:
- Filtering options
- Event details
- Registration links

### Individual Event Pages (`content/en/events/[event-name].md`)
Detailed pages for each cleanup event including:
- Event date and time
- Location information
- Equipment needed
- Registration details
- Event leader contact information

### Contact Page (`content/en/contact.md`)
Contact form and organization information including:
- Email contact form
- Physical address
- Social media links

### Projects Page (`content/en/projects.md`)
Showcase of completed and ongoing cleanup projects with:
- Project descriptions
- Impact metrics
- Photo galleries
- Testimonials

### 404 Page (`content/en/404.md`)
Custom error page to help users navigate when they reach a non-existent page.

## 🧱 Content Creation with Bricks

Content in this project is created using "bricks" - reusable content components. To create a new page:

1. Create a markdown file in the `content/en/` directory
2. Use brick shortcodes in your content as shown below

### Available Bricks

The project includes various brick types that can be used in your content:

#### Hero Section (`brick_hero`)
```markdown
{{< brick_hero >}}
# Join Our Mission
Help us keep our waterways clean

![](/uploads/waterway-cleanups/hero.jpg)

{{< button "Join a Cleanup" "/events" >}}
{{< /brick_hero >}}
```

**Notes:**
- The hero image is included as a Markdown image within the content
- The hero section will automatically create a parallax effect with the image
- Text content can include headings, paragraphs, and buttons

#### Hero Two Columns with Background (`brick_hero_two_col_bg`)
```markdown
{{< brick_hero_two_col_bg reverse="true" >}}
# Section Title
Content text goes here with a call to action.

{{< button "Button Text" "/link" >}}

![](/uploads/image.jpg)
{{< /brick_hero_two_col_bg >}}
```

**Parameters:**
- `reverse` (optional) - When set to "true", reverses the column order (default: false)
- The image is included as a Markdown image within the content

#### Two-Column Layout (`brick_two_columns`)
```markdown
{{< brick_two_columns >}}
## Left Column
Content for the left column goes here.
---
## Right Column
Content for the right column goes here.
{{< /brick_two_columns >}}
```

**Notes:**
- Use the `---` separator to split content between left and right columns
- Each column can contain any markdown content including headings, text, and images

#### Events Listing (`brick_events`)
```markdown
{{< brick_events >}}
<p class="h3">Upcoming Events</p>
## Join Us at These Cleanups
Every volunteer makes a difference in our community.
{{< /brick_events >}}
```

**Notes:**
- This brick automatically displays upcoming events from the `content/en/events/` directory
- Events are sorted by date
- The content inside the brick is displayed above the event listings

#### Parallax Image (`parallax_image`)
```markdown
{{< parallax_image src="/uploads/waterway-cleanups/parallax.jpg" height="400px" scale="1.2" overlay="true" bobbing="false" >}}
# Scrolling Text Over Image
This text will scroll with a parallax effect
{{< /parallax_image >}}
```

**Parameters:**
- `src` (required) - Image path
- `alt` (optional) - Alt text for the image (default: "Parallax image")
- `height` (optional) - Height of the parallax section (default: "500px")
- `scale` (optional) - Scale factor for the parallax effect (default: "1.2")
- `overlay` (optional) - Whether to add a dark overlay (default: false)
- `bobbing` (optional) - Enable slight up/down animation (default: false)

#### Date with Icon (`date_with_icon`)
```markdown
Event Date: {{< date_with_icon date="2023-06-15" class="text-primary" >}}
```

**Parameters:**
- `date` (required) - Date in YYYY-MM-DD format
- `class` (optional) - Additional CSS classes to apply

#### Call to Action (`brick_cta`)
```markdown
{{< brick_cta >}}{{< /brick_cta >}}
```

**Notes:**
- This brick pulls content from `content/en/bricks/cta.md`
- You don't need to add content inside the shortcode

#### Image (`brick_image`)
```markdown
{{< brick_image align="start" gallery_dir="/uploads/gallery/" >}}
## Section With Image
Content to appear alongside the image.

![](/uploads/waterway-cleanups/image.jpg)

This brick can include both text and an image in a flexible layout.
{{< /brick_image >}}
```

**Parameters:**
- `align` (optional) - Image alignment (default: none, options: "start")
- `gallery_dir` (optional) - Directory containing gallery images to display below the main image
- The main image is included as a Markdown image within the content

#### Image Alt Layout (`brick_image2`)
```markdown
{{< brick_image2 align="start" >}}
## Section With Alternative Image Layout
Content to appear alongside the image.

![](/uploads/waterway-cleanups/image.jpg)

This brick offers a different layout for image and text content.
{{< /brick_image2 >}}
```

**Parameters:**
- `align` (optional) - Image alignment (default: none, options: "start")
- The main image is included as a Markdown image within the content

#### Quote (`brick_quote_alt`)
```markdown
{{< brick_quote_alt >}}
"This is a testimonial or important quote from a volunteer or partner."
— John Doe, Volunteer
{{< /brick_quote_alt >}}
```

**Notes:**
- Format the quote with the quotation marks and attribution as shown
- The brick will apply appropriate styling to the quote

#### Blocks (`brick_blocks`)
```markdown
{{< brick_blocks text_align="text-left" vertical_align="justify-normal" >}}
## Block Heading

Introduction text for the blocks section.

---

![](/uploads/gallery/01.jpg)
### Block 1 Title
Block 1 description text.

---

![](/uploads/gallery/02.jpg)
### Block 2 Title
Block 2 description text.

---

![](/uploads/gallery/03.jpg)
### Block 3 Title
Block 3 description text.
{{< /brick_blocks >}}
```

**Parameters:**
- `text_align` (optional) - Text alignment (default: "text-left", options: "text-center", "text-right")
- `vertical_align` (optional) - Vertical alignment (default: "justify-normal", options: "justify-start", "justify-end", "justify-center")
- Use `---` to separate each block
- Each block can contain an image, heading, and description

#### Size Variations
The project includes different size variations for bricks to control content width:

**brick_small**
```markdown
{{< brick_small class="custom-class" >}}
## Small Section
Content for a small section with a narrow container width.
{{< /brick_small >}}
```

**Parameters:**
- `class` (optional) - Additional CSS classes to apply to the section

**brick_medium**
```markdown
{{< brick_medium class="!pb-5 sm:!pb-0 md:!pb-0 !pt-1 !px-5" >}}
## Medium Section
Content for a medium section with a moderate container width.
{{< /brick_medium >}}
```

**Parameters:**
- `class` (optional) - Additional CSS classes to apply to the section
- You can use Tailwind utility classes with `!` prefix to override default styles

**brick_large**
```markdown
{{< brick_large class="bg-gray-100" >}}
## Large Section
Content for a large section with a wide container width.
{{< /brick_large >}}
```

**Parameters:**
- `class` (optional) - Additional CSS classes to apply to the section

#### Gallery
```markdown
{{< gallery dir="/uploads/gallery-folder/" >}}
```

**Parameters:**
- `dir` (required) - Directory containing images
- This automatically creates a gallery from all images in the specified directory

#### Button
```markdown
{{< button "Text" "/link" >}}
```

**Parameters:**
- First parameter (required) - Button text
- Second parameter (required) - Button URL/link

#### Button2 (Alternative Style)
```markdown
{{< button2 "Text" "/link" >}}
```

**Parameters:**
- First parameter (required) - Button text
- Second parameter (required) - Button URL/link

#### Badges
```markdown
{{< badges "Badge 1, Badge 2, Badge 3" >}}
```

**Notes:**
- Separate badge labels with commas
- Badges will be styled according to the site's design system

### Creating New Pages

To create a new page:

1. Create a markdown file in the appropriate directory (e.g., `content/en/new-page.md`)
2. Add the required front matter:
   ```markdown
   ---
   title: "Page Title"
   seo:
     description: "SEO description for the page"
   dark_header: true
   dark_footer: false
   ---
   ```
3. Add content using brick shortcodes as described above

### Creating New Events

To create a new event:

1. Create a markdown file in `content/en/events/` (e.g., `content/en/events/creek-cleanup-june-2023.md`)
2. Add the required front matter:
   ```markdown
   ---
   title: "Creek Cleanup - June 2023"
   date: 2023-06-15T09:00:00-05:00
   end_date: 2023-06-15T12:00:00-05:00
   location: "Aquia Creek, Stafford, VA"
   image: "/uploads/events/creek-cleanup.jpg"
   event_leader: "Jane Smith"
   contact_email: "jane@example.com"
   registration_link: "https://example.com/register"
   tags: ["river", "community"]
   ---
   ```
3. Add the event description and details using bricks

## 🚢 Deployment

To build the site for production:

```bash
npm run build
```

The built site will be in the `public/` directory, ready for deployment to any static hosting service like:
- Netlify
- Vercel
- GitHub Pages
- AWS S3 + CloudFront

## 🎨 Customization

### Tailwind CSS

This project uses Tailwind CSS for styling. You can customize the design by:

1. Editing the `tailwind.config.js` file to modify colors, fonts, and other design tokens
2. Adding custom CSS in the `static/css/src/` directory
3. Rebuilding CSS with `npm run build:css`

### Hugo Configuration

The main Hugo configuration is in `config.yaml`. You can modify:
- Site title and description
- Menu items
- Social media links
- Other site-wide settings

## 📝 License and Credits

This project is based on the Hugobricks theme, which is inspired by the many [Gutenberg Block Plugins](https://wpastra.com/plugins/wordpress-gutenberg-block-plugins/) available online and https://bricksbuilder.io/. The design is based on the MIT licensed [Hugoplate from Zeon Studio](https://github.com/zeon-studio/hugoplate.git). 

The Hugobricks theme is available on GitHub at [jhvanderschee/hugobricks](https://github.com/jhvanderschee/hugobricks).

For complete licensing information on fonts, icons, and images, see the original [Hugobricks documentation](https://www.hugobricks.preview.usecue.com/).