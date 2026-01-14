#!/usr/bin/env node

/**
 * Performance and Load Testing Script
 * 
 * Tests system performance under various load conditions:
 * 1. API response times under normal load
 * 2. Concurrent request handling
 * 3. Database query performance
 * 4. Hugo generation performance with large datasets
 * 5. Memory usage and resource consumption
 * 
 * Usage: node scripts/performance-test.js [--environment staging|prod] [--concurrent 10] [--duration 60] [--verbose]
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const { spawn } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const envArg = args.find(arg => arg.startsWith('--environment='));
const environment = envArg ? envArg.split('=')[1] : 'staging';
const concurrentArg = args.find(arg => arg.startsWith('--concurrent='));
const concurrentUsers = concurrentArg ? parseInt(concurrentArg.split('=')[1]) : 10;
const durationArg = args.find(arg => arg.startsWith('--duration='));
const testDuration = durationArg ? parseInt(durationArg.split('=')[1]) : 60;

if (!['staging', 'prod'].includes(environment)) {
  console.error('Invalid environment. Use --environment=staging or --environment=prod');
  process.exit(1);
}

// Configure AWS
AWS.config.update({ 
  region: process.env.AWS_REGION || 'us-east-1'
});
const dynamodb = new AWS.DynamoDB.DocumentClient();

// API configuration
const API_BASE_URL = environment === 'prod' 
  ? 'https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/prod'
  : 'https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/staging';

const API_KEY = environment === 'prod' 
  ? 'waterway-cleanups-api-key'
  : 'DLzv1VYEHralCbMz6C7nC8PmqEe3lTvE1yI8KG0e';

console.log(`⚡ Performance and Load Testing`);
console.log(`Environment: ${environment.toUpperCase()}`);
console.log(`Concurrent Users: ${concurrentUsers}`);
console.log(`Test Duration: ${testDuration} seconds`);
console.log(`Verbose: ${isVerbose ? 'ON' : 'OFF'}`);
console.log('');

/**
 * Logging utility
 */
function log(message, force = false) {
  if (isVerbose || force) {
    console.log(message);
  }
}

/**
 * Performance metrics collector
 */
class PerformanceMetrics {
  constructor() {
    this.requests = [];
    this.errors = [];
    this.startTime = null;
    this.endTime = null;
  }

  start() {
    this.startTime = Date.now();
  }

  end() {
    this.endTime = Date.now();
  }

  addRequest(endpoint, responseTime, status, success) {
    this.requests.push({
      endpoint,
      responseTime,
      status,
      success,
      timestamp: Date.now()
    });
  }

  addError(endpoint, error) {
    this.errors.push({
      endpoint,
      error: error.message,
      timestamp: Date.now()
    });
  }

  getStats() {
    const totalRequests = this.requests.length;
    const successfulRequests = this.requests.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulRequests;
    
    const responseTimes = this.requests.map(r => r.responseTime);
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    
    const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    
    // Calculate percentiles
    const sortedTimes = responseTimes.sort((a, b) => a - b);
    const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
    const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;
    
    const totalDuration = this.endTime - this.startTime;
    const requestsPerSecond = totalDuration > 0 ? (totalRequests / (totalDuration / 1000)) : 0;
    
    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests * 100) : 0,
      avgResponseTime: Math.round(avgResponseTime),
      minResponseTime,
      maxResponseTime,
      p50ResponseTime: Math.round(p50),
      p95ResponseTime: Math.round(p95),
      p99ResponseTime: Math.round(p99),
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
      totalDuration,
      totalErrors: this.errors.length
    };
  }

  printStats() {
    const stats = this.getStats();
    
    console.log('\n' + '='.repeat(60));
    console.log('PERFORMANCE TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Requests: ${stats.totalRequests}`);
    console.log(`Successful: ${stats.successfulRequests}`);
    console.log(`Failed: ${stats.failedRequests}`);
    console.log(`Success Rate: ${stats.successRate.toFixed(1)}%`);
    console.log(`Total Errors: ${stats.totalErrors}`);
    console.log('');
    console.log('Response Times (ms):');
    console.log(`  Average: ${stats.avgResponseTime}ms`);
    console.log(`  Minimum: ${stats.minResponseTime}ms`);
    console.log(`  Maximum: ${stats.maxResponseTime}ms`);
    console.log(`  50th percentile: ${stats.p50ResponseTime}ms`);
    console.log(`  95th percentile: ${stats.p95ResponseTime}ms`);
    console.log(`  99th percentile: ${stats.p99ResponseTime}ms`);
    console.log('');
    console.log(`Requests per second: ${stats.requestsPerSecond}`);
    console.log(`Total duration: ${stats.totalDuration}ms`);
    
    if (this.errors.length > 0) {
      console.log('\nERRORS:');
      this.errors.slice(0, 5).forEach(error => {
        console.log(`❌ ${error.endpoint}: ${error.error}`);
      });
      if (this.errors.length > 5) {
        console.log(`... and ${this.errors.length - 5} more errors`);
      }
    }
    
    console.log('='.repeat(60));
  }
}

/**
 * Make HTTP request to API with timing
 */
async function makeTimedAPIRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}/${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      ...options.headers
    },
    ...options
  };

  const startTime = Date.now();
  
  try {
    const response = await fetch(url, config);
    const responseTime = Date.now() - startTime;
    
    let data = null;
    try {
      const text = await response.text();
      data = JSON.parse(text);
    } catch (e) {
      // Response might not be JSON
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
      responseTime,
      success: response.ok
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 0,
      ok: false,
      data: null,
      responseTime,
      success: false,
      error: error.message
    };
  }
}

/**
 * Test single endpoint performance
 */
async function testEndpointPerformance(endpoint, requests = 10) {
  log(`Testing ${endpoint} with ${requests} requests...`, true);
  
  const metrics = new PerformanceMetrics();
  metrics.start();
  
  const promises = [];
  for (let i = 0; i < requests; i++) {
    promises.push(makeTimedAPIRequest(endpoint));
  }
  
  const results = await Promise.all(promises);
  metrics.end();
  
  results.forEach(result => {
    if (result.error) {
      metrics.addError(endpoint, { message: result.error });
    } else {
      metrics.addRequest(endpoint, result.responseTime, result.status, result.success);
    }
  });
  
  const stats = metrics.getStats();
  log(`✅ ${endpoint}: ${stats.avgResponseTime}ms avg, ${stats.successRate.toFixed(1)}% success`, true);
  
  return stats;
}

/**
 * Test concurrent load
 */
async function testConcurrentLoad(endpoints, concurrentUsers, duration) {
  log(`Testing concurrent load: ${concurrentUsers} users for ${duration}s...`, true);
  
  const metrics = new PerformanceMetrics();
  metrics.start();
  
  const workers = [];
  const endTime = Date.now() + (duration * 1000);
  
  // Create worker functions
  for (let i = 0; i < concurrentUsers; i++) {
    const worker = async () => {
      while (Date.now() < endTime) {
        const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
        const result = await makeTimedAPIRequest(endpoint);
        
        if (result.error) {
          metrics.addError(endpoint, { message: result.error });
        } else {
          metrics.addRequest(endpoint, result.responseTime, result.status, result.success);
        }
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    
    workers.push(worker());
  }
  
  // Wait for all workers to complete
  await Promise.all(workers);
  metrics.end();
  
  const stats = metrics.getStats();
  log(`✅ Concurrent load test completed: ${stats.requestsPerSecond} req/s`, true);
  
  return { metrics, stats };
}

/**
 * Test database query performance
 */
async function testDatabasePerformance() {
  log('Testing database query performance...', true);
  
  const suffix = environment === 'prod' ? '' : `-${environment}`;
  const EVENTS_TABLE = `events${suffix}`;
  
  const queries = [
    {
      name: 'Events scan',
      operation: () => dynamodb.scan({ TableName: EVENTS_TABLE, Limit: 10 }).promise()
    },
    {
      name: 'Events by status',
      operation: () => dynamodb.scan({
        TableName: EVENTS_TABLE,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'active' },
        Limit: 10
      }).promise()
    }
  ];
  
  const results = [];
  
  for (const query of queries) {
    const iterations = 5;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      try {
        await query.operation();
        times.push(Date.now() - startTime);
      } catch (error) {
        log(`❌ Database query failed: ${error.message}`, true);
        times.push(null);
      }
    }
    
    const validTimes = times.filter(t => t !== null);
    const avgTime = validTimes.length > 0 
      ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length 
      : 0;
    
    results.push({
      name: query.name,
      avgTime: Math.round(avgTime),
      success: validTimes.length === iterations
    });
    
    log(`✅ ${query.name}: ${Math.round(avgTime)}ms avg`, true);
  }
  
  return results;
}

/**
 * Test Hugo generation performance
 */
async function testHugoGenerationPerformance() {
  log('Testing Hugo generation performance...', true);
  
  const hugoScript = path.join(__dirname, 'hugo-generator.js');
  
  const startTime = Date.now();
  
  const result = await new Promise((resolve, reject) => {
    const child = spawn('node', [hugoScript, '--dry-run', `--environment=${environment}`], {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, output, error, duration: Date.now() - startTime });
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
  
  if (result.code === 0) {
    log(`✅ Hugo generation: ${result.duration}ms`, true);
    return { success: true, duration: result.duration };
  } else {
    log(`❌ Hugo generation failed: ${result.error}`, true);
    return { success: false, duration: result.duration, error: result.error };
  }
}

/**
 * Monitor system resources
 */
function getSystemResources() {
  const used = process.memoryUsage();
  return {
    heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100, // MB
    heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100, // MB
    external: Math.round(used.external / 1024 / 1024 * 100) / 100, // MB
    rss: Math.round(used.rss / 1024 / 1024 * 100) / 100 // MB
  };
}

/**
 * Main performance test runner
 */
async function runPerformanceTests() {
  try {
    console.log('🚀 Starting performance tests...\n');
    
    const initialResources = getSystemResources();
    log(`Initial memory usage: ${initialResources.heapUsed}MB heap, ${initialResources.rss}MB RSS`, true);
    
    // Test 1: Individual endpoint performance
    console.log('📋 Test 1: Individual Endpoint Performance');
    const endpoints = ['events', 'analytics', 'events/export?format=json', 'volunteers/metrics'];
    const endpointResults = {};
    
    for (const endpoint of endpoints) {
      endpointResults[endpoint] = await testEndpointPerformance(endpoint, 5);
    }
    console.log('');
    
    // Test 2: Database performance
    console.log('📋 Test 2: Database Query Performance');
    const dbResults = await testDatabasePerformance();
    console.log('');
    
    // Test 3: Hugo generation performance
    console.log('📋 Test 3: Hugo Generation Performance');
    const hugoResults = await testHugoGenerationPerformance();
    console.log('');
    
    // Test 4: Concurrent load test
    console.log('📋 Test 4: Concurrent Load Test');
    const { metrics, stats } = await testConcurrentLoad(
      ['events', 'analytics'], 
      concurrentUsers, 
      Math.min(testDuration, 30) // Cap at 30 seconds for safety
    );
    console.log('');
    
    const finalResources = getSystemResources();
    log(`Final memory usage: ${finalResources.heapUsed}MB heap, ${finalResources.rss}MB RSS`, true);
    
    // Print comprehensive results
    console.log('📊 PERFORMANCE TEST SUMMARY');
    console.log('='.repeat(60));
    
    console.log('\n🌐 API Endpoint Performance:');
    Object.entries(endpointResults).forEach(([endpoint, result]) => {
      const status = result.avgResponseTime < 2000 ? '✅' : '⚠️';
      console.log(`  ${status} ${endpoint}: ${result.avgResponseTime}ms avg (${result.successRate.toFixed(1)}% success)`);
    });
    
    console.log('\n🗄️  Database Query Performance:');
    dbResults.forEach(result => {
      const status = result.success && result.avgTime < 1000 ? '✅' : '⚠️';
      console.log(`  ${status} ${result.name}: ${result.avgTime}ms avg`);
    });
    
    console.log('\n📄 Hugo Generation Performance:');
    const hugoStatus = hugoResults.success && hugoResults.duration < 10000 ? '✅' : '⚠️';
    console.log(`  ${hugoStatus} Generation time: ${hugoResults.duration}ms`);
    
    console.log('\n⚡ Concurrent Load Performance:');
    const loadStatus = stats.successRate > 95 && stats.avgResponseTime < 5000 ? '✅' : '⚠️';
    console.log(`  ${loadStatus} ${stats.requestsPerSecond} req/s, ${stats.avgResponseTime}ms avg, ${stats.successRate.toFixed(1)}% success`);
    
    console.log('\n💾 Memory Usage:');
    const memoryIncrease = finalResources.heapUsed - initialResources.heapUsed;
    const memoryStatus = memoryIncrease < 50 ? '✅' : '⚠️'; // Less than 50MB increase
    console.log(`  ${memoryStatus} Memory increase: ${memoryIncrease.toFixed(2)}MB`);
    console.log(`  Final usage: ${finalResources.heapUsed}MB heap, ${finalResources.rss}MB RSS`);
    
    // Overall assessment
    const allGood = Object.values(endpointResults).every(r => r.avgResponseTime < 2000 && r.successRate > 95) &&
                   dbResults.every(r => r.success && r.avgTime < 1000) &&
                   hugoResults.success && hugoResults.duration < 10000 &&
                   stats.successRate > 95 && stats.avgResponseTime < 5000 &&
                   memoryIncrease < 50;
    
    console.log('\n🎯 Overall Performance Assessment:');
    if (allGood) {
      console.log('✅ EXCELLENT - All performance metrics are within acceptable ranges');
      console.log('   The system is ready for production load');
    } else {
      console.log('⚠️  NEEDS ATTENTION - Some performance metrics are concerning');
      console.log('   Review the results above and consider optimization');
    }
    
    // Detailed metrics if verbose
    if (isVerbose) {
      console.log('\n📈 Detailed Load Test Metrics:');
      metrics.printStats();
    }
    
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Performance tests failed:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Check AWS credentials and permissions');
    console.log('2. Verify API Gateway is accessible');
    console.log('3. Ensure database tables exist');
    console.log('4. Check network connectivity');
    console.log('5. Review error details above');
    
    process.exit(1);
  }
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Performance and Load Testing Script

Usage: node scripts/performance-test.js [options]

Options:
  --environment ENV       Target environment (staging|prod) [default: staging]
  --concurrent N          Number of concurrent users [default: 10]
  --duration N            Test duration in seconds [default: 60]
  --verbose               Show detailed output and metrics
  --help, -h              Show this help message

Environment Variables:
  AWS_REGION              AWS region [default: us-east-1]
  AWS_PROFILE             AWS profile to use (optional)

This script tests system performance:
1. Individual API endpoint response times
2. Database query performance
3. Hugo generation performance
4. Concurrent load handling
5. Memory usage and resource consumption

Examples:
  node scripts/performance-test.js                                 # Basic test
  node scripts/performance-test.js --concurrent=20 --duration=120  # Heavy load test
  node scripts/performance-test.js --environment=prod --verbose    # Production test
`);
  process.exit(0);
}

// Add fetch polyfill for Node.js if needed
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

// Run the performance tests
runPerformanceTests();