// API Endpoint: /api/user-dashboard
// Returns user's waiver status and RSVP information using normalized data structure

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const sessionTableName = process.env.SESSION_TABLE_NAME || 'user_sessions';
const waiverTableName = process.env.WAIVER_TABLE_NAME || 'volunteer_waivers';
const rsvpTableName = process.env.RSVP_TABLE_NAME || 'rsvps';
const eventsTableName = process.env.EVENTS_TABLE_NAME || 'events';
const minorsTableName = process.env.MINORS_TABLE_NAME || 'minors';

// Helper function to validate session
async function validateSession(sessionToken) {
  const queryParams = {
    TableName: sessionTableName,
    IndexName: 'session-token-index',
    KeyConditionExpression: 'session_token = :token',
    ExpressionAttributeValues: {
      ':token': sessionToken
    }
  };

  const queryResult = await dynamoDB.query(queryParams).promise();
  const sessions = queryResult.Items || [];

  if (sessions.length === 0) {
    return null;
  }

  const session = sessions[0];

  // Check if session has expired
  if (new Date(session.expires_at) <= new Date()) {
    return null;
  }

  return session;
}

// Helper function to get event details
async function getEventDetails(eventId) {
  try {
    const result = await dynamoDB.get({
      TableName: eventsTableName,
      Key: { event_id: eventId }
    }).promise();
    
    return result.Item || null;
  } catch (error) {
    console.error(`Error fetching event ${eventId}:`, error);
    return null;
  }
}

// Helper function to format event date
function formatEventDisplayDate(eventData) {
  if (!eventData || !eventData.start_time) {
    return "Date TBD";
  }
  
  try {
    let startTime = eventData.start_time;
    if (startTime.endsWith('Z')) {
      startTime = startTime.replace('Z', '+00:00');
    } else if (!startTime.includes('+') && !startTime.includes('-', startTime.indexOf('T')) && startTime.includes('T')) {
      startTime = startTime + '+00:00';
    }
    
    const eventDate = new Date(startTime);
    return eventDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    return "Date TBD";
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'CORS preflight successful' }) };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method Not Allowed' })
    };
  }

  try {
    const requestBody = JSON.parse(event.body);

    if (!requestBody.session_token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Session token is required' 
        })
      };
    }

    // Validate session
    const session = await validateSession(requestBody.session_token);
    if (!session) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Invalid or expired session' 
        })
      };
    }

    const email = session.email;

    console.log(`Loading dashboard for email: ${email}`);

    // Get waiver status
    let waiverStatus = {
      hasWaiver: false,
      expirationDate: null,
      submissionDate: null
    };

    try {
      const waiverParams = {
        TableName: waiverTableName,
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": email
        }
      };

      const waiverResult = await dynamoDB.query(waiverParams).promise();
      const waivers = waiverResult.Items || [];

      if (waivers.length > 0) {
        // Get the most recent waiver
        waivers.sort((a, b) => new Date(b.submission_date) - new Date(a.submission_date));
        const latestWaiver = waivers[0];

        if (latestWaiver.submission_date) {
          const submissionDate = new Date(latestWaiver.submission_date);
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

          if (submissionDate > oneYearAgo) {
            const expirationDate = new Date(submissionDate);
            expirationDate.setFullYear(submissionDate.getFullYear() + 1);

            waiverStatus = {
              hasWaiver: true,
              expirationDate: expirationDate.toISOString().split('T')[0],
              submissionDate: latestWaiver.submission_date
            };
          }
        }
      }
    } catch (waiverError) {
      console.error("Error fetching waiver status:", waiverError);
    }

    // Get minors attached to this account
    let minors = [];

    try {
      const minorsParams = {
        TableName: minorsTableName,
        KeyConditionExpression: 'guardian_email = :email',
        ExpressionAttributeValues: {
          ':email': email
        }
      };

      const minorsResult = await dynamoDB.query(minorsParams).promise();
      minors = minorsResult.Items || [];

      // Calculate current age for each minor
      minors = minors.map(minor => {
        const dob = new Date(minor.date_of_birth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          age--;
        }

        return {
          minor_id: minor.minor_id,
          first_name: minor.first_name,
          last_name: minor.last_name,
          date_of_birth: minor.date_of_birth,
          age: age,
          email: minor.email || null,
          created_at: minor.created_at
        };
      });

      // Sort by creation date (newest first)
      minors.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    } catch (minorsError) {
      console.error("Error fetching minors:", minorsError);
    }

    // Get RSVP information with event details (normalized structure)
    let rsvps = [];

    try {
      // Query RSVPs using the email index
      const rsvpParams = {
        TableName: rsvpTableName,
        IndexName: 'email-created_at-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email
        }
      };

      const rsvpResult = await dynamoDB.query(rsvpParams).promise();
      const rsvpItems = rsvpResult.Items || [];

      // Enrich RSVPs with event details and filter out cancelled ones
      for (const rsvp of rsvpItems) {
        try {
          // Skip cancelled RSVPs for dashboard display
          if (rsvp.status === 'cancelled') {
            continue;
          }

          // Get event details
          const eventData = await getEventDetails(rsvp.event_id);
          
          if (!eventData) {
            console.log(`Skipping RSVP for missing event: ${rsvp.event_id}`);
            continue;
          }

          // Create enriched RSVP with event information
          const enrichedRsvp = {
            // RSVP data
            event_id: rsvp.event_id,
            email: rsvp.email,
            status: rsvp.status || 'active',
            created_at: rsvp.created_at,
            updated_at: rsvp.updated_at,
            additional_comments: rsvp.additional_comments,
            
            // Event data (joined)
            event_title: eventData.title || 'Unknown Event',
            event_description: eventData.description || '',
            event_start_time: eventData.start_time,
            event_end_time: eventData.end_time,
            event_location: eventData.location || {},
            event_status: eventData.status || 'active',
            event_attendance_cap: eventData.attendance_cap || 0,
            
            // Computed fields
            event_display_date: formatEventDisplayDate(eventData),
            
            // Legacy compatibility
            submission_date: rsvp.created_at
          };

          rsvps.push(enrichedRsvp);
        } catch (rsvpError) {
          console.error(`Error processing RSVP for event ${rsvp.event_id}:`, rsvpError);
          continue;
        }
      }

      // Sort RSVPs chronologically by event start time (upcoming first, then past events)
      const currentTime = new Date();
      
      const upcomingEvents = [];
      const pastEvents = [];
      
      for (const rsvp of rsvps) {
        try {
          const eventDate = rsvp.event_start_time ? new Date(rsvp.event_start_time) : null;
          if (eventDate && eventDate >= currentTime) {
            upcomingEvents.push(rsvp);
          } else {
            pastEvents.push(rsvp);
          }
        } catch (error) {
          pastEvents.push(rsvp); // Default to past if date parsing fails
        }
      }
      
      // Sort upcoming events by start time (earliest first)
      upcomingEvents.sort((a, b) => {
        const dateA = new Date(a.event_start_time || 0);
        const dateB = new Date(b.event_start_time || 0);
        return dateA - dateB;
      });
      
      // Sort past events by start time (most recent first)
      pastEvents.sort((a, b) => {
        const dateA = new Date(a.event_start_time || 0);
        const dateB = new Date(b.event_start_time || 0);
        return dateB - dateA;
      });
      
      // Combine: upcoming events first, then past events
      rsvps = [...upcomingEvents, ...pastEvents];

    } catch (rsvpError) {
      console.error("Error fetching RSVP information:", rsvpError);
      
      // Fallback to scan if GSI doesn't exist
      try {
        const scanParams = {
          TableName: rsvpTableName,
          FilterExpression: "email = :email",
          ExpressionAttributeValues: {
            ":email": email
          }
        };

        const scanResult = await dynamoDB.scan(scanParams).promise();
        const scanItems = scanResult.Items || [];
        
        // Process scan results with same logic but simplified
        for (const rsvp of scanItems) {
          if (rsvp.status === 'cancelled') continue;
          
          const eventData = await getEventDetails(rsvp.event_id);
          if (eventData) {
            rsvps.push({
              event_id: rsvp.event_id,
              event_title: eventData.title || 'Unknown Event',
              event_start_time: eventData.start_time,
              event_display_date: formatEventDisplayDate(eventData),
              created_at: rsvp.created_at,
              submission_date: rsvp.created_at,
              status: rsvp.status || 'active'
            });
          }
        }
      } catch (scanError) {
        console.error("Scan fallback also failed:", scanError);
      }
    }

    // Update session last accessed time
    const updateParams = {
      TableName: sessionTableName,
      Key: { session_id: session.session_id },
      UpdateExpression: 'SET last_accessed = :last_accessed',
      ExpressionAttributeValues: {
        ':last_accessed': new Date().toISOString()
      }
    };

    await dynamoDB.update(updateParams).promise();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email: email,
        waiver: waiverStatus,
        minors: minors,
        rsvps: rsvps,
        session_expires_at: session.expires_at
      })
    };

  } catch (error) {
    console.error('Error loading user dashboard:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' })
    };
  }
};