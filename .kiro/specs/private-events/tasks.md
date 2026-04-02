# Implementation Plan: Private Events Feature

## Overview

This implementation plan breaks down the private events feature into discrete coding tasks. The feature adds a privacy flag to event front matter that excludes events from public listings while maintaining direct URL access and full RSVP functionality. Implementation uses Hugo template modifications to filter events at build time.

## Tasks

- [x] 1. Implement event listing filter for private events
  - Modify `layouts/partials/brick_events.html` to filter out events with `private: true`
  - Add `$public_events` variable using Hugo's `where` clause with `"!=" true` condition
  - Update `$upcoming_events` to filter from `$public_events` instead of `$events`
  - Ensure backward compatibility: events without `private` field remain public
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 8.1, 8.2_

- [ ]* 1.1 Write property test for listing exclusion
  - **Property 4: Listing Exclusion**
  - **Validates: Requirements 2.1, 2.2, 7.2**
  - Generate random combinations of private and public events
  - Build Hugo site and parse events listing HTML
  - Verify private events are excluded and public events are included

- [x] 2. Add SEO meta tags for private events
  - Modify `layouts/_default/baseof.html` to add conditional noindex/nofollow meta tags
  - Add conditional block checking `.Params.private` in the `<head>` section
  - Insert `<meta name="robots" content="noindex, nofollow">` for private events
  - Place after existing meta tags, before canonical link (after line 8)
  - _Requirements: 5.1, 5.2, 5.4_

- [ ]* 2.1 Write property test for SEO meta tag differentiation
  - **Property 12: SEO Meta Tag Differentiation**
  - **Validates: Requirements 5.1, 5.2, 5.4**
  - Generate events with various privacy settings
  - Parse individual event page HTML
  - Verify private events have noindex meta tag and public events don't

- [x] 3. Update tag filter to exclude private event tags
  - Modify tag filter dropdown in `layouts/partials/brick_events.html`
  - Generate tag options only from `$public_events` instead of all events
  - Extract tags from public events, create unique sorted list
  - Replace taxonomy-based tag generation with manual tag collection
  - _Requirements: 2.3_

- [ ]* 3.1 Write property test for tag filter exclusion
  - **Property 5: Tag Filter Exclusion**
  - **Validates: Requirements 2.3**
  - Generate events with overlapping tags (some private, some public)
  - Parse tag filter dropdown options
  - Verify tags from private-only events don't appear in filter

- [x] 4. Checkpoint - Verify core functionality
  - Build Hugo site with test events (mix of private and public)
  - Verify private events excluded from `/events/` listing
  - Verify private event pages accessible via direct URL
  - Verify noindex meta tags present on private event pages
  - Ensure all tests pass, ask the user if questions arise

- [ ]* 5. Write property tests for front matter and URL access
  - [ ]* 5.1 Property test for front matter privacy recognition
    - **Property 1: Front Matter Privacy Recognition**
    - **Validates: Requirements 1.1, 1.2**
    - Generate events with `private: true`, `private: false`, and no private field
    - Verify Hugo correctly parses and recognizes privacy status
  
  - [ ]* 5.2 Property test for direct URL accessibility
    - **Property 2: Direct URL Accessibility**
    - **Validates: Requirements 1.3, 3.1, 7.3**
    - Generate private events and build site
    - Verify HTML files exist at expected permalinks
    - Verify pages return complete content

  - [ ]* 5.3 Property test for backward compatibility
    - **Property 3: Backward Compatibility**
    - **Validates: Requirements 1.4, 8.3**
    - Generate events without `private` field
    - Verify they appear in public listings

- [ ]* 6. Write property tests for page rendering and consistency
  - [ ]* 6.1 Property test for complete page rendering
    - **Property 6: Complete Page Rendering**
    - **Validates: Requirements 3.2, 3.3**
    - Generate private events with various content (images, descriptions)
    - Verify all standard components present in rendered HTML
  
  - [ ]* 6.2 Property test for URL structure consistency
    - **Property 7: URL Structure Consistency**
    - **Validates: Requirements 3.4**
    - Generate events with same filename but different privacy settings
    - Verify permalink structure is identical regardless of privacy status
  
  - [ ]* 6.3 Property test for navigation element consistency
    - **Property 13: Navigation Element Consistency**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Parse private and public event pages
    - Verify header, footer, and breadcrumb elements are present in both

- [ ]* 7. Write property tests for RSVP system compatibility
  - [ ]* 7.1 Property test for RSVP functionality parity
    - **Property 8: RSVP Functionality Parity**
    - **Validates: Requirements 4.1**
    - Generate events with `event_rsvp` shortcode (private and public)
    - Verify RSVP form HTML is identical in structure
  
  - [ ]* 7.2 Property test for RSVP identifier format
    - **Property 9: RSVP Identifier Format**
    - **Validates: Requirements 4.2**
    - Parse RSVP forms from private and public events
    - Verify event identifiers follow same format

- [ ]* 8. Write property tests for archive and build success
  - [ ]* 8.1 Property test for archive location independence
    - **Property 15: Archive Location Independence**
    - **Validates: Requirements 7.1**
    - Create private events in both `events/` and `events-archive/` directories
    - Verify private status maintained in both locations
  
  - [ ]* 8.2 Property test for build success with mixed events
    - **Property 17: Build Success with Mixed Events**
    - **Validates: Requirements 8.4**
    - Generate various combinations of private and public events
    - Verify Hugo build completes without errors

- [ ] 9. Create test event files for manual verification
  - Create 2-3 private event markdown files in `content/en/events/` with `private: true`
  - Create 2-3 public event markdown files without `private` field
  - Include realistic content: titles, dates, tags, images, RSVP forms
  - Use for manual testing and demonstration
  - _Requirements: All requirements (manual verification)_

- [ ] 10. Final checkpoint - End-to-end verification
  - Run full Hugo build with test events
  - Manually verify private events excluded from listings
  - Manually verify private event direct URLs work
  - Manually verify RSVP forms function on private events
  - Manually verify tag filters exclude private events
  - Verify no build errors or warnings
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Hugo template language (Go templates) is used for all implementation
- Property tests require test infrastructure setup (fast-check, Hugo build helpers)
- Manual testing is essential since automated testing infrastructure doesn't exist yet
- RSVP system testing focuses on HTML structure; actual API testing may require mocking
- All template changes maintain backward compatibility with existing events
