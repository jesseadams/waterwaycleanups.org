#!/usr/bin/env node

const https = require('https');

const API_BASE_URL = 'https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/staging';

const testData = {
  title: 'Test Event No Auth',
  description: 'Testing event creation without authorization',
  start_time: '2025-02-01T10:00:00Z',
  end_time: '2025-02-01T13:00:00Z',
  location: {
    name: 'Test Location',
    address: '123 Test Street, Test City, TS 12345'
  }
};

const postData = JSON.stringify(testData);

const options = {
  hostname: 'o2pkfnwqq4.execute-api.us-east-1.amazonaws.com',
  port: 443,
  path: '/staging/events',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Making API call to create event without authorization...');
console.log('URL:', `${API_BASE_URL}/events`);
console.log('Data:', testData);

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response body:', data);
    try {
      const jsonData = JSON.parse(data);
      console.log('Parsed response:', JSON.stringify(jsonData, null, 2));
    } catch (e) {
      console.log('Could not parse response as JSON');
    }
  });
});

req.on('error', (e) => {
  console.error(`Request error: ${e.message}`);
});

req.write(postData);
req.end();