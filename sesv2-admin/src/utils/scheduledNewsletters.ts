const API_BASE_URL = process.env.REACT_APP_API_GATEWAY_URL ? 
  `${process.env.REACT_APP_API_GATEWAY_URL}/scheduled-newsletters` : 
  'https://882dzmsoy5.execute-api.us-east-1.amazonaws.com/prod/scheduled-newsletters';

export interface ScheduledNewsletter {
  id: string;
  templateName: string;
  contactList: string;
  scheduledTime: string;
  scheduledTimeET?: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  createdAt: string;
  createdBy: string;
  fromEmail: string;
  templateData: Record<string, any>;
  topic?: string;
  sentAt?: string;
  recipientCount?: number;
  error?: string;
  failedAt?: string;
  cancelledAt?: string;
  updatedAt?: string;
}

export interface CreateScheduledNewsletterInput {
  templateName: string;
  contactList: string;
  scheduledTime: string;
  fromEmail: string;
  templateData: Record<string, any>;
  topic?: string;
  createdBy?: string;
}

class ScheduledNewslettersError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'ScheduledNewslettersError';
  }
}

// Get auth headers using Cognito credentials
const getAuthHeaders = async (): Promise<HeadersInit> => {
  try {
    // Get current session from Amplify
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    
    if (!session.tokens?.idToken) {
      throw new Error('No authentication token available');
    }

    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.tokens.idToken.toString()}`
    };
  } catch (error) {
    console.error('Failed to get auth headers:', error);
    throw new ScheduledNewslettersError('Authentication required');
  }
};

/**
 * Create a new scheduled newsletter
 */
export const createScheduledNewsletter = async (
  input: CreateScheduledNewsletterInput
): Promise<ScheduledNewsletter> => {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ScheduledNewslettersError(
        error.error || 'Failed to create scheduled newsletter',
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating scheduled newsletter:', error);
    throw error;
  }
};

/**
 * List all scheduled newsletters
 */
export const listScheduledNewsletters = async (): Promise<{
  newsletters: ScheduledNewsletter[];
  count: number;
}> => {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(API_BASE_URL, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ScheduledNewslettersError(
        error.error || 'Failed to list scheduled newsletters',
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error listing scheduled newsletters:', error);
    throw error;
  }
};

/**
 * Get a specific scheduled newsletter
 */
export const getScheduledNewsletter = async (
  id: string
): Promise<ScheduledNewsletter> => {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/${id}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ScheduledNewslettersError(
        error.error || 'Failed to get scheduled newsletter',
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting scheduled newsletter:', error);
    throw error;
  }
};

/**
 * Update a scheduled newsletter
 */
export const updateScheduledNewsletter = async (
  id: string,
  updates: Partial<CreateScheduledNewsletterInput>
): Promise<ScheduledNewsletter> => {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ScheduledNewslettersError(
        error.error || 'Failed to update scheduled newsletter',
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating scheduled newsletter:', error);
    throw error;
  }
};

/**
 * Delete/cancel a scheduled newsletter
 */
export const deleteScheduledNewsletter = async (
  id: string
): Promise<{ message: string; id: string }> => {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/${id}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new ScheduledNewslettersError(
        error.error || 'Failed to delete scheduled newsletter',
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting scheduled newsletter:', error);
    throw error;
  }
};

/**
 * Format a UTC date to Eastern Time for display
 */
export const formatScheduledTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' ET';
};

/**
 * Get the next available scheduling slot (next hour between 9 AM - 4 PM ET)
 */
export const getNextAvailableSlot = (): Date => {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  // Start with the next hour
  const nextHour = new Date(etNow);
  nextHour.setHours(etNow.getHours() + 1, 0, 0, 0);
  
  // If it's before 9 AM ET, set to 9 AM
  if (nextHour.getHours() < 9) {
    nextHour.setHours(9, 0, 0, 0);
  }
  // If it's after 4 PM ET, set to 9 AM next day
  else if (nextHour.getHours() > 16) {
    nextHour.setDate(nextHour.getDate() + 1);
    nextHour.setHours(9, 0, 0, 0);
  }
  
  // If it's a weekend, move to Monday
  while (nextHour.getDay() === 0 || nextHour.getDay() === 6) {
    nextHour.setDate(nextHour.getDate() + 1);
  }
  
  return nextHour;
};

/**
 * Get available scheduling hours for a given date
 */
export const getAvailableHours = (date: Date): number[] => {
  const hours: number[] = [];
  
  // Available hours are 9 AM to 4 PM ET (9-16 in 24-hour format)
  for (let hour = 9; hour <= 16; hour++) {
    hours.push(hour);
  }
  
  // If it's today, filter out past hours
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const selectedDateET = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  if (
    selectedDateET.getFullYear() === etNow.getFullYear() &&
    selectedDateET.getMonth() === etNow.getMonth() &&
    selectedDateET.getDate() === etNow.getDate()
  ) {
    return hours.filter(hour => hour > etNow.getHours());
  }
  
  return hours;
};
