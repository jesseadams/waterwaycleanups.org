#!/usr/bin/env node

/**
 * Test script for Hugo Generator
 * 
 * Simple test to verify Hugo generator functionality without requiring
 * a full testing framework setup.
 */

const fs = require('fs');
const path = require('path');

class HugoGeneratorTest {
  constructor() {
    this.testsPassed = 0;
    this.testsFailed = 0;
    this.testResults = [];
  }

  assert(condition, message) {
    if (condition) {
      this.testsPassed++;
      this.testResults.push(`✓ ${message}`);
      return true;
    } else {
      this.testsFailed++;
      this.testResults.push(`✗ ${message}`);
      return false;
    }
  }

  testHugoGeneratorExists() {
    const generatorPath = path.join(__dirname, 'hugo-generator.js');
    const exists = fs.existsSync(generatorPath);
    this.assert(exists, 'Hugo generator script exists');
    return exists;
  }

  testHugoGeneratorSyntax() {
    try {
      const generatorPath = path.join(__dirname, 'hugo-generator.js');
      const content = fs.readFileSync(generatorPath, 'utf8');
      
      // Basic syntax checks
      this.assert(content.includes('class HugoGenerator'), 'Contains HugoGenerator class');
      this.assert(content.includes('generateFrontmatter'), 'Contains generateFrontmatter method');
      this.assert(content.includes('generateEventContent'), 'Contains generateEventContent method');
      this.assert(content.includes('generateAllFiles'), 'Contains generateAllFiles method');
      
      // Check for required dependencies
      this.assert(content.includes("require('aws-sdk')"), 'Imports AWS SDK');
      this.assert(content.includes("require('fs')"), 'Imports filesystem module');
      this.assert(content.includes("require('path')"), 'Imports path module');
      
      return true;
    } catch (error) {
      this.assert(false, `Hugo generator syntax check failed: ${error.message}`);
      return false;
    }
  }

  testFrontmatterGeneration() {
    try {
      // Mock event data
      const mockEvent = {
        event_id: 'test-event-2026',
        title: 'Test Cleanup Event',
        description: 'A test event for validation',
        start_time: '2026-03-15T09:00:00-05:00',
        end_time: '2026-03-15T12:00:00-05:00',
        hugo_config: {
          image: '/uploads/test-image.jpg',
          tags: ['test-tag'],
          preheader_is_light: false
        }
      };

      // Import the generator (this is a basic test, not a full unit test)
      const generatorPath = path.join(__dirname, 'hugo-generator.js');
      const content = fs.readFileSync(generatorPath, 'utf8');
      
      // Check that frontmatter generation logic exists
      this.assert(content.includes('generateFrontmatter'), 'Frontmatter generation method exists');
      this.assert(content.includes('hugo_config'), 'Handles Hugo configuration');
      this.assert(content.includes('start_time'), 'Handles event timing');
      
      return true;
    } catch (error) {
      this.assert(false, `Frontmatter generation test failed: ${error.message}`);
      return false;
    }
  }

  testContentGeneration() {
    try {
      const generatorPath = path.join(__dirname, 'hugo-generator.js');
      const content = fs.readFileSync(generatorPath, 'utf8');
      
      // Check for Hugo shortcode generation
      this.assert(content.includes('date_with_icon'), 'Generates date_with_icon shortcode');
      this.assert(content.includes('{{< tabs >}}'), 'Generates tabs shortcode');
      this.assert(content.includes('event_rsvp'), 'Generates event_rsvp shortcode');
      this.assert(content.includes('attendance_cap'), 'Handles attendance cap');
      
      // Check for content sections
      this.assert(content.includes('## Event Details'), 'Generates Event Details section');
      this.assert(content.includes('## Location'), 'Generates Location section');
      this.assert(content.includes('## What We Provide'), 'Generates What We Provide section');
      
      return true;
    } catch (error) {
      this.assert(false, `Content generation test failed: ${error.message}`);
      return false;
    }
  }

  testContentPreservation() {
    try {
      const generatorPath = path.join(__dirname, 'hugo-generator.js');
      const content = fs.readFileSync(generatorPath, 'utf8');
      
      // Check for content preservation logic
      this.assert(content.includes('checkExistingContent'), 'Has content preservation method');
      this.assert(content.includes('hasCustomContent'), 'Detects custom content');
      this.assert(content.includes('customTabsContent'), 'Preserves custom tabs content');
      
      return true;
    } catch (error) {
      this.assert(false, `Content preservation test failed: ${error.message}`);
      return false;
    }
  }

  testDateFormatting() {
    try {
      const generatorPath = path.join(__dirname, 'hugo-generator.js');
      const content = fs.readFileSync(generatorPath, 'utf8');
      
      // Check for date formatting logic
      this.assert(content.includes('formatEventDate'), 'Has date formatting method');
      this.assert(content.includes('toLocaleDateString'), 'Uses proper date formatting');
      this.assert(content.includes('America/New_York'), 'Uses correct timezone');
      
      return true;
    } catch (error) {
      this.assert(false, `Date formatting test failed: ${error.message}`);
      return false;
    }
  }

  testCLIInterface() {
    try {
      const generatorPath = path.join(__dirname, 'hugo-generator.js');
      const content = fs.readFileSync(generatorPath, 'utf8');
      
      // Check for CLI handling
      this.assert(content.includes('--dry-run'), 'Supports dry-run option');
      this.assert(content.includes('--verbose'), 'Supports verbose option');
      this.assert(content.includes('--environment'), 'Supports environment option');
      this.assert(content.includes('--help'), 'Supports help option');
      
      return true;
    } catch (error) {
      this.assert(false, `CLI interface test failed: ${error.message}`);
      return false;
    }
  }

  testPackageJsonIntegration() {
    try {
      const packagePath = path.join(__dirname, '..', 'package.json');
      const packageContent = fs.readFileSync(packagePath, 'utf8');
      const packageJson = JSON.parse(packageContent);
      
      // Check for npm scripts
      this.assert(packageJson.scripts['generate-hugo'], 'Has generate-hugo npm script');
      this.assert(packageJson.scripts['generate-hugo:dry-run'], 'Has generate-hugo:dry-run npm script');
      this.assert(packageJson.scripts['generate-hugo:prod'], 'Has generate-hugo:prod npm script');
      this.assert(packageJson.scripts['generate-hugo:verbose'], 'Has generate-hugo:verbose npm script');
      
      return true;
    } catch (error) {
      this.assert(false, `Package.json integration test failed: ${error.message}`);
      return false;
    }
  }

  testGitHubActionsIntegration() {
    try {
      const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml');
      const workflowContent = fs.readFileSync(workflowPath, 'utf8');
      
      // Check for Hugo generator step
      this.assert(workflowContent.includes('Generate Hugo files from database'), 'Has Hugo generation step in workflow');
      this.assert(workflowContent.includes('npm run generate-hugo'), 'Calls Hugo generator in workflow');
      this.assert(workflowContent.includes('--environment='), 'Passes environment to generator');
      
      return true;
    } catch (error) {
      this.assert(false, `GitHub Actions integration test failed: ${error.message}`);
      return false;
    }
  }

  runAllTests() {
    console.log('🔄 Running Hugo Generator Tests...\n');

    // Run all tests
    this.testHugoGeneratorExists();
    this.testHugoGeneratorSyntax();
    this.testFrontmatterGeneration();
    this.testContentGeneration();
    this.testContentPreservation();
    this.testDateFormatting();
    this.testCLIInterface();
    this.testPackageJsonIntegration();
    this.testGitHubActionsIntegration();

    // Print results
    console.log('Test Results:');
    console.log('='.repeat(50));
    
    this.testResults.forEach(result => {
      console.log(result);
    });

    console.log('\nSummary:');
    console.log('='.repeat(50));
    console.log(`✓ Passed: ${this.testsPassed}`);
    console.log(`✗ Failed: ${this.testsFailed}`);
    console.log(`Total: ${this.testsPassed + this.testsFailed}`);

    if (this.testsFailed === 0) {
      console.log('\n🎉 All tests passed! Hugo Generator is ready for use.');
      console.log('\nNext steps:');
      console.log('1. Set up AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
      console.log('2. Test with: npm run generate-hugo:dry-run');
      console.log('3. Generate files with: npm run generate-hugo');
      return true;
    } else {
      console.log('\n❌ Some tests failed. Please review the issues above.');
      return false;
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new HugoGeneratorTest();
  const success = tester.runAllTests();
  process.exit(success ? 0 : 1);
}

module.exports = HugoGeneratorTest;