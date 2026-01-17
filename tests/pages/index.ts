/**
 * Page Object Models Index
 * Exports all page objects for easy importing
 */

export { LoginPage } from './LoginPage';
export { DashboardPage } from './DashboardPage';
export { WaiverPage } from './WaiverPage';
export { EventPage } from './EventPage';
export { MinorsPage } from './MinorsPage';

// Export types
export type { WaiverStatus, RsvpItem, MinorItem } from './DashboardPage';
export type { WaiverFormData } from './WaiverPage';
export type { MinorFormData, MinorItem as MinorItemType } from './MinorsPage';
