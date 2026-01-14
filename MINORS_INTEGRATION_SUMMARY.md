# Minors Management Integration Summary

## Current Status

The minors management system backend is complete, but the frontend integration into the volunteer dashboard needs to be added inline since the dashboard uses Babel standalone for React rendering.

## What's Complete

✅ Backend API endpoints (Node.js in `/api`)
✅ Lambda functions (Python in `/terraform`)
✅ Terraform infrastructure with CORS
✅ DynamoDB schema
✅ Standalone React component (`MinorsManagement.jsx`)
✅ Test page (`test-minors-management.html`)
✅ Documentation

## What Needs to Be Done

The volunteer dashboard at `/volunteer` uses inline React code with Babel standalone. To add minors management, you need to:

### Option 1: Add Inline to Volunteer Dashboard Template

Edit `layouts/volunteer/single.html` and add the MinorsManagement component inline within the existing `<script type="text/babel">` block.

**Location**: After the dashboard data is loaded, add a new section in the `renderDashboard()` function.

**Code to add** (simplified inline version):

```javascript
// Add this inside the renderDashboard() function, after the RSVP section

// Minors Management Section
React.createElement('div', {
  key: 'minors-section',
  className: "mt-6 bg-white p-6 rounded-lg shadow-md"
}, [
  React.createElement('h3', {
    key: 'title',
    className: "text-xl font-semibold mb-4"
  }, 'Minors on Your Account'),
  React.createElement('p', {
    key: 'description',
    className: "text-sm text-gray-600 mb-4"
  }, 'Your waiver covers all minors attached to your account.'),
  
  // Add minor form would go here
  // List of minors would go here
])
```

### Option 2: Create Separate Minors Management Page

Create a new page at `/volunteer/minors` with its own layout:

1. Create `content/en/volunteer/minors.md`
2. Create `layouts/volunteer/minors.html`
3. Embed the full MinorsManagement component inline

### Option 3: Use the Test Page (Quickest)

The test page at `test-minors-management.html` is fully functional. You can:

1. Copy it to `static/volunteer-minors.html`
2. Style it to match your site
3. Link to it from the volunteer dashboard

## Recommended Approach

**For immediate testing**: Use the test page (`test-minors-management.html`)

**For production**: Add inline to the volunteer dashboard template

## Quick Integration Steps

1. **Deploy the backend first**:
   ```bash
   cd terraform
   terraform apply
   ```

2. **Test with the standalone page**:
   - Open `http://localhost:1313/test-minors-management.html`
   - Enter your session token
   - Test all CRUD operations

3. **Once backend works, integrate into dashboard**:
   - Edit `layouts/volunteer/single.html`
   - Add minors section to the dashboard
   - Reload the page

## API Endpoints Needed

Make sure these are accessible from your frontend:

- `POST /api/minors-add`
- `POST /api/minors-list`
- `POST /api/minors-update`
- `POST /api/minors-delete`

## Session Token

The minors API uses the same session token as the volunteer dashboard. Get it from:

```javascript
window.authClient.getSessionToken()
```

## Next Steps

1. Deploy Terraform infrastructure (creates DynamoDB + Lambda + API Gateway)
2. Test endpoints with `test-minors-management.html`
3. Once working, integrate into volunteer dashboard
4. Update waiver language to mention minors coverage

## Files Reference

- **Backend API**: `api/minors-*.js`
- **Lambda Functions**: `terraform/lambda_minors_*.py`
- **Infrastructure**: `terraform/minors_management.tf`
- **Test Page**: `test-minors-management.html`
- **React Component**: `static/js/react-components/MinorsManagement.jsx`
- **Dashboard Template**: `layouts/volunteer/single.html`

## Support

- CORS issues: See `MINORS_CORS_FIX.md`
- Deployment: See `MINORS_DEPLOYMENT_GUIDE.md`
- API docs: See `docs/minors-management.md`
