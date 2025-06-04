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
- [Hugo](https://gohugo.io/installation/) (Extende d version recommended)
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
- `npm run minify:css` - Minify standalone CSS files not processed by Webpack
- `npm run clean` - Clean generated assets (CSS and JS bundle files)
- `npm run serve` - Run the Hugo server in production mode
- `npm run start` - Build assets and start Hugo server in production mode

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

### CSS Processing

The project uses multiple CSS processing pipelines:

1. **Tailwind CSS** - Processed through Webpack and PostCSS
   - Source: `static/css/src/tailwind.css`
   - Output: `static/css/tailwind-output.css` and `static/css/tailwind-output.min.css` (production)

2. **Standalone CSS** - Various CSS files that may need separate minification
   - Main standalone style: `static/css/style.css` → `static/css/style.min.css` 
   - To minify: `npm run minify:css`

3. **Component-specific CSS** - Various CSS files like `bricks.css`, `header-footer.css`, etc.

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
{{< brick_blocks text_align="left" vertical_align="center" >}}
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
- `text_align` (optional) - Text alignment (default: "left", options: "center", "right")
- `vertical_align` (optional) - Vertical alignment (default: "center", options: "start", "end", "between", "around", "evenly")
- Use `---` to separate each block
- Each block can contain an image, heading, and description

#### Size Variations
The project includes different size variations for bricks to control content width. All of these components accept a `class` parameter that allows you to add custom Tailwind CSS classes for styling and layout customization:

**brick_small**
```markdown
{{< brick_small class="bg-gray-100 py-8 rounded-lg shadow-md" >}}
## Small Section
Content for a small section with a narrow container width.
{{< /brick_small >}}
```

**Parameters:**
- `class` (optional) - Additional CSS classes to apply to the section, including any Tailwind utility classes

**brick_medium**
```markdown
{{< brick_medium class="!pb-5 sm:!pb-0 md:!pb-0 !pt-1 !px-5 bg-green-50" >}}
## Medium Section
Content for a medium section with a moderate container width.
{{< /brick_medium >}}
```

**Parameters:**
- `class` (optional) - Additional CSS classes to apply to the section
- You can use Tailwind utility classes with `!` prefix to override default styles
- Example above adds responsive padding and a light green background

**brick_large**
```markdown
{{< brick_large class="bg-blue-50 border-t border-blue-200 my-12" >}}
## Large Section
Content for a large section with a wide container width.
{{< /brick_large >}}
```

**Parameters:**
- `class` (optional) - Additional CSS classes to apply to the section
- Example above adds a light blue background, top border, and vertical margin

**Note:** You can add any Tailwind CSS utility classes to customize the appearance of these brick components. This provides a powerful way to adjust spacing, colors, borders, and more without writing custom CSS.

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

## 🧱 Additional Bricks

The Waterway Cleanups theme includes additional bricks beyond the basic ones mentioned above. Here's a comprehensive list of all available bricks and their parameters:

### Quote Block (`brick_quote_alt`)
```markdown
{{< brick_quote_alt >}}
"This is a testimonial quote from a volunteer or community member."

**John Smith**  
Community Volunteer

![](/uploads/background-image.jpg)
{{< /brick_quote_alt >}}
```

**Notes:**
- Background image is optional - if included, it will be used as a background
- The wavey graphic element is automatically added to the quote

### Image Block (`brick_image`)
```markdown
{{< brick_image align="start" gallery_dir="/uploads/gallery-folder" >}}
## Image Section Title
Description text for the image section.

![](/uploads/featured-image.jpg)
{{< /brick_image >}}
```

**Parameters:**
- `align` (optional) - Set to "start" to align content to the top (default is center)
- `gallery_dir` (optional) - Path to a directory of images to display as a gallery below the main image

### Blocks Grid (`brick_blocks`)
```markdown
{{< brick_blocks text_align="center" vertical_align="start" class="custom-class" >}}
# Blocks Section Title
Description text that appears above the blocks grid.

---

## Block 1 Title
Block 1 description text.

![](/uploads/block1-icon.png)

[/link-url-for-block]

---

## Block 2 Title
Block 2 description text.

![](/uploads/block2-icon.png)

[/link-url-for-block]
{{< /brick_blocks >}}
```

**Parameters:**
- `text_align` (optional) - Controls text alignment: "left", "center", or "right" (default: "left")
- `vertical_align` (optional) - Controls vertical alignment: "start", "center", "end", "between", "around", or "evenly" (default: "center")
- `class` (optional) - Additional CSS classes to apply to the section

**Notes:**
- Each block is separated by `---`
- Include an image to display as an icon for the block
- Include a link in the format `[/link-url]` to make the entire block clickable

### Events Grid (`brick_events`)
```markdown
{{< brick_events >}}
# Upcoming Cleanup Events
Join us at one of our upcoming waterway cleanup events.
{{< /brick_events >}}
```

**Notes:**
- Automatically displays upcoming events from the `content/en/events/` directory
- Events are filtered by date to show only future events
- Events are sorted by start date
- Includes built-in tag filtering

### Small, Medium, and Large Content Blocks
```markdown
{{< brick_small >}}
Content for a small width container.
{{< /brick_small >}}

{{< brick_medium >}}
Content for a medium width container.
{{< /brick_medium >}}

{{< brick_large >}}
Content for a large width container.
{{< /brick_large >}}
```

### Parallax Image
```markdown
{{< parallax_image src="/uploads/image.jpg" alt="Description" height="500px" scale="1.2" overlay="true" bobbing="false" >}}
# Optional Content
Content to overlay on the parallax image
{{< /parallax_image >}}
```

**Parameters:**
- `src` (required) - Path to the image
- `alt` (optional) - Alt text for the image (default: "Parallax image")
- `height` (optional) - Height of the parallax section (default: "500px")
- `scale` (optional) - Scale factor for the parallax effect (default: "1.2")
- `overlay` (optional) - Adds a dark overlay to improve text readability
- `bobbing` (optional) - Enables a gentle bobbing animation (default: "false")

**Notes:**
- Can include optional content to overlay on the parallax image

### Date with Icon
```markdown
{{< date_with_icon date="January 15, 2024" >}}
```

**Parameters:**
- `date` (required) - The date string to display with an icon

### Volunteer Form
```markdown
{{< volunteerform >}}
```

**Notes:**
- Embeds the volunteer registration form

### Badges
```markdown
{{< badges items="Volunteer,Community,Conservation" >}}
```

**Parameters:**
- `items` (required) - Comma-separated list of badge labels

## 📝 Content Tips

When creating new pages or editing existing content, keep these tips in mind:

1. **Structured Markdown**: Use proper markdown heading hierarchy (# for main title, ## for sections, etc.)

2. **Images**: All images should be placed in the `/static/uploads/` directory, organized in subfolders for better management

3. **Shortcodes**: Utilize the available brick shortcodes to maintain consistent styling across the site

4. **Front Matter**: Each content file should include the appropriate front matter:
   ```yaml
   ---
   title: "Page Title"
   date: 2023-10-15
   draft: false
   tags: ["tag1", "tag2"]
   image: "/uploads/feature-image.jpg"
   ---
   ```

5. **Events**: When creating event pages, include the following front matter:
   ```yaml
   ---
   title: "Event Title"
   date: 2023-10-15
   draft: false
   tags: ["location", "event-type"]
   image: "/uploads/event-image.jpg"
   start_time: "2023-10-15T09:00:00-07:00"
   end_time: "2023-10-15T12:00:00-07:00"
   location: "Beach Name, City, State"
   ---
   ```

6. **Brick Composition**: Combine multiple bricks to create engaging, visually appealing pages

## 🚢 Deployment

### Local Production Build

To build the site for production locally:

```bash
npm run build
```

This command:
1. Cleans previous build artifacts
2. Builds Tailwind CSS with minification
3. Builds frontend assets with Webpack in production mode
4. Minifies standalone CSS files
5. Sets HUGO_ENV to production
6. Builds the Hugo site with minification

The built site will be in the `public/` directory, ready for deployment.

### Testing Production Build Locally

To test the production build locally:

```bash
npm run serve
```

This runs the Hugo server with the production environment settings.

### Continuous Integration/Deployment

This project uses GitHub Actions for CI/CD. The workflow:

1. Builds on every push to main and pull request
2. Automatically deploys to AWS S3 and invalidates CloudFront cache when merged to main
3. Runs a daily scheduled build to ensure content is up-to-date

The deployment process:
1. Cleans build artifacts
2. Builds frontend assets with webpack
3. Minifies standalone CSS files
4. Builds the Hugo site with minification
5. Deploys to S3 and invalidates CloudFront

## 🎨 Customization

### Tailwind CSS

This project uses [Tailwind CSS](https://tailwindcss.com/docs) for styling. You can customize the design by:

1. Editing the `tailwind.config.js` file to modify colors, fonts, and other design tokens
2. Adding custom CSS in the `static/css/src/` directory
3. Rebuilding CSS with `npm run build:css`

For more information on Tailwind CSS utility classes and configuration options, refer to the [official Tailwind CSS documentation](https://tailwindcss.com/docs).

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