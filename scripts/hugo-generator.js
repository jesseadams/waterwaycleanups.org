#!/usr/bin/env node

require('dotenv').config();
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

/**
 * Hugo Generator Service
 * 
 * Converts database events to Hugo markdown files with proper frontmatter
 * and content preservation for existing shortcodes.
 * 
 * Requirements: 4.1, 4.2, 4.4, 4.5
 */
class HugoGenerator {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.environment = options.environment || 'staging';
    
    // Configure AWS SDK
    this.dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    // Table names with environment suffix
    const suffix = (this.environment === 'prod' || this.environment === 'production') ? '-production' : `-${this.environment}`;
    this.eventsTableName = `events${suffix}`;
    
    // Hugo content directory
    this.contentDir = path.join(__dirname, '..', 'content', 'en', 'events');
    
    // Ensure content directory exists
    if (!fs.existsSync(this.contentDir)) {
      fs.mkdirSync(this.contentDir, { recursive: true });
    }
  }

  log(message, force = false) {
    if (this.verbose || force) {
      console.log(message);
    }
  }

  /**
   * Retrieve all active events from DynamoDB
   */
  async getEventsFromDatabase() {
    this.log('Retrieving events from DynamoDB...');
    
    try {
      const params = {
        TableName: this.eventsTableName,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'active'
        }
      };

      const result = await this.dynamodb.scan(params).promise();
      this.log(`Retrieved ${result.Items.length} active events`);
      
      // Sort events by start_time for consistent processing
      return result.Items.sort((a, b) => 
        new Date(a.start_time) - new Date(b.start_time)
      );
    } catch (error) {
      console.error('Error retrieving events from database:', error.message);
      throw error;
    }
  }

  /**
   * Generate Hugo frontmatter from event data
   */
  generateFrontmatter(event) {
    const frontmatter = {
      title: event.title,
      seo: {
        description: event.description || `Join us for ${event.title}!`
      }
    };

    // Add Hugo-specific configuration
    if (event.hugo_config) {
      if (event.hugo_config.image) {
        frontmatter.image = event.hugo_config.image;
      }
      if (event.hugo_config.tags && Array.isArray(event.hugo_config.tags)) {
        frontmatter.tags = event.hugo_config.tags;
      }
      if (typeof event.hugo_config.preheader_is_light === 'boolean') {
        frontmatter.preheader_is_light = event.hugo_config.preheader_is_light;
      }
    }

    // Add event timing
    if (event.start_time) {
      frontmatter.start_time = event.start_time;
    }
    if (event.end_time) {
      frontmatter.end_time = event.end_time;
    }

    return frontmatter;
  }

  /**
   * Format date for display in content
   */
  formatEventDate(startTime, endTime) {
    try {
      const start = new Date(startTime);
      const end = endTime ? new Date(endTime) : null;
      
      const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        timeZone: 'America/New_York'
      };
      
      const dateStr = start.toLocaleDateString('en-US', options);
      
      const timeOptions = { 
        hour: 'numeric', 
        minute: '2-digit',
        timeZone: 'America/New_York',
        timeZoneName: 'short'
      };
      
      const startTimeStr = start.toLocaleTimeString('en-US', timeOptions);
      let timeRange = startTimeStr;
      
      if (end) {
        const endTimeStr = end.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          timeZone: 'America/New_York'
        });
        timeRange = `${startTimeStr.replace(' EST', '').replace(' EDT', '')}-${endTimeStr}`;
      }
      
      return `${dateStr} | ${timeRange}`;
    } catch (error) {
      this.log(`Error formatting date: ${error.message}`);
      return startTime; // Fallback to raw ISO string
    }
  }

  /**
   * Generate event content with Hugo shortcodes
   */
  generateEventContent(event) {
    const dateDisplay = this.formatEventDate(event.start_time, event.end_time);
    
    let content = `{{< date_with_icon date="${dateDisplay}" class="large-date" >}}\n`;
    content += `{{< tabs >}}\n`;
    content += `## Event Details\n\n`;
    
    // Add event description
    if (event.description) {
      content += `${event.description}\n\n`;
    }
    
    content += `---\n`;
    content += `## Location\n\n`;
    
    // Add location information
    if (event.location) {
      if (event.location.name) {
        content += `${event.location.name}<br/>\n`;
      }
      if (event.location.address) {
        content += `${event.location.address}\n\n`;
      }
    }
    
    content += `---\n`;
    content += `## What We Provide\n\n`;
    content += `- Trash grabbers\n`;
    content += `- Gloves\n`;
    content += `- Reflective vests\n`;
    content += `- Trash bags\n`;
    content += `- First Aid Kit\n\n`;
    content += `Bring water, wear sturdy shoes, and dress for the weather. All ages welcome—kids under 18 must be accompanied by an adult.\n`;
    content += `{{< /tabs >}}\n\n`;
    
    // Add RSVP shortcode with attendance cap
    const attendanceCap = event.attendance_cap || 20;
    content += `{{< event_rsvp attendance_cap="${attendanceCap}" >}}\n`;
    
    return content;
  }

  /**
   * Check if existing file has custom content that should be preserved
   */
  async checkExistingContent(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const existingContent = fs.readFileSync(filePath, 'utf8');
      
      // Look for custom shortcodes or content between tabs
      const tabsMatch = existingContent.match(/{{< tabs >}}([\s\S]*?){{< \/tabs >}}/);
      if (tabsMatch) {
        const tabsContent = tabsMatch[1];
        
        // Check if there are custom shortcodes or significant custom content
        const hasCustomShortcodes = /{{<\s*(?!date_with_icon|tabs|\/tabs)[^>]+>}}/.test(tabsContent);
        const hasCustomSections = tabsContent.includes('##') && 
          !tabsContent.includes('## Event Details') && 
          !tabsContent.includes('## Location') && 
          !tabsContent.includes('## What We Provide');
        
        if (hasCustomShortcodes || hasCustomSections) {
          this.log(`Found custom content in ${path.basename(filePath)}, preserving...`);
          return {
            hasCustomContent: true,
            customTabsContent: tabsContent
          };
        }
      }
      
      return { hasCustomContent: false };
    } catch (error) {
      this.log(`Error reading existing file ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate complete Hugo markdown file
   */
  async generateMarkdownFile(event) {
    const frontmatter = this.generateFrontmatter(event);
    const filePath = path.join(this.contentDir, `${event.event_id}.md`);
    
    // Check for existing custom content
    const existingContent = await this.checkExistingContent(filePath);
    
    let content;
    if (existingContent && existingContent.hasCustomContent) {
      // Preserve existing custom content
      const dateDisplay = this.formatEventDate(event.start_time, event.end_time);
      content = `{{< date_with_icon date="${dateDisplay}" class="large-date" >}}\n`;
      content += `{{< tabs >}}${existingContent.customTabsContent}{{< /tabs >}}\n\n`;
      
      // Add RSVP shortcode
      const attendanceCap = event.attendance_cap || 20;
      content += `{{< event_rsvp attendance_cap="${attendanceCap}" >}}\n`;
    } else {
      // Generate standard content
      content = this.generateEventContent(event);
    }

    // Build complete markdown file
    let markdown = '---\n';
    markdown += this.yamlStringify(frontmatter);
    markdown += '---\n\n';
    markdown += content;

    return { filePath, markdown, preserved: existingContent?.hasCustomContent || false };
  }

  /**
   * Simple YAML stringifier for frontmatter
   */
  yamlStringify(obj, indent = 0) {
    let yaml = '';
    const spaces = '  '.repeat(indent);
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }
      
      if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        yaml += this.yamlStringify(value, indent + 1);
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          yaml += `${spaces}  - ${item}\n`;
        }
      } else if (typeof value === 'string') {
        // Escape quotes and handle multiline strings
        const escaped = value.replace(/"/g, '\\"');
        yaml += `${spaces}${key}: "${escaped}"\n`;
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    }
    
    return yaml;
  }

  /**
   * Write markdown file to disk
   */
  async writeMarkdownFile(filePath, markdown) {
    if (this.dryRun) {
      this.log(`DRY RUN - Would write: ${path.basename(filePath)}`);
      return;
    }

    try {
      fs.writeFileSync(filePath, markdown, 'utf8');
      this.log(`Generated: ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Clean up old event files that are no longer in the database
   */
  async cleanupOldFiles(activeEventIds) {
    this.log('Cleaning up old event files...');
    
    try {
      const files = fs.readdirSync(this.contentDir);
      const markdownFiles = files.filter(file => file.endsWith('.md'));
      
      let removedCount = 0;
      
      for (const file of markdownFiles) {
        const eventId = path.basename(file, '.md');
        
        if (!activeEventIds.includes(eventId)) {
          const filePath = path.join(this.contentDir, file);
          
          if (this.dryRun) {
            this.log(`DRY RUN - Would remove: ${file}`);
          } else {
            fs.unlinkSync(filePath);
            this.log(`Removed: ${file}`);
          }
          removedCount++;
        }
      }
      
      this.log(`Cleanup completed: ${removedCount} files ${this.dryRun ? 'would be' : ''} removed`);
    } catch (error) {
      console.error('Error during cleanup:', error.message);
    }
  }

  /**
   * Generate all Hugo files from database events
   */
  async generateAllFiles() {
    console.log('🔄 Starting Hugo file generation from database events...\n');

    // AWS SDK will automatically discover credentials from profile, IAM role, or env vars
    console.log(`📁 Environment: ${this.environment.toUpperCase()}`);
    console.log(`📄 Table: ${this.eventsTableName}`);
    console.log(`📂 Output: ${this.contentDir}\n`);

    try {
      // Get events from database
      const events = await this.getEventsFromDatabase();
      
      if (events.length === 0) {
        console.log('⚠️  No active events found in database');
        return;
      }

      let generatedCount = 0;
      let preservedCount = 0;
      const activeEventIds = [];

      // Generate markdown files for each event
      for (const event of events) {
        try {
          const { filePath, markdown, preserved } = await this.generateMarkdownFile(event);
          await this.writeMarkdownFile(filePath, markdown);
          
          activeEventIds.push(event.event_id);
          generatedCount++;
          
          if (preserved) {
            preservedCount++;
          }
        } catch (error) {
          console.error(`Failed to generate file for event ${event.event_id}:`, error.message);
        }
      }

      // Clean up old files
      await this.cleanupOldFiles(activeEventIds);

      console.log('✅ Hugo generation completed successfully!');
      console.log(`   Generated ${generatedCount} event files`);
      console.log(`   Preserved ${preservedCount} files with custom content`);
      
      if (!this.dryRun) {
        console.log(`   Output directory: ${this.contentDir}`);
      }

    } catch (error) {
      console.error('❌ Hugo generation failed:', error.message);
      process.exit(1);
    }
  }
}

// CLI handling
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run') || args.includes('-d'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  environment: (() => {
    const envArg = args.find(arg => arg.startsWith('--environment=') || arg.startsWith('-e='));
    if (envArg) return envArg.split('=')[1];
    const envIndex = args.findIndex(arg => arg === '--environment' || arg === '-e');
    return envIndex !== -1 && args[envIndex + 1] ? args[envIndex + 1] : 'staging';
  })()
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Hugo Generator Service

Usage: node scripts/hugo-generator.js [options]

Options:
  --dry-run, -d           Show what would be generated without creating files
  --verbose, -v           Show detailed output
  --environment, -e ENV   Target environment (staging|prod) [default: staging]
  --help, -h              Show this help message

Environment Variables:
  AWS_PROFILE             AWS profile to use (optional)
  AWS_REGION              AWS region [default: us-east-1]

AWS Credentials:
  The script will automatically discover AWS credentials from:
  - AWS CLI profile (aws configure)
  - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  - IAM role (if running on EC2/Lambda)
  - AWS SSO profile

Examples:
  node scripts/hugo-generator.js --dry-run              # Preview generation
  node scripts/hugo-generator.js --verbose              # Generate with detailed output
  node scripts/hugo-generator.js -e prod                # Generate for production
  npm run generate-hugo                                 # Generate Hugo files

This tool will:
1. Query active events from DynamoDB
2. Generate Hugo markdown files with proper frontmatter
3. Preserve existing custom shortcodes and content
4. Clean up files for events no longer in database
5. Maintain chronological sorting by event start time
`);
  process.exit(0);
}

const generator = new HugoGenerator(options);
generator.generateAllFiles();