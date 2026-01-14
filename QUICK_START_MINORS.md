# Quick Start: Minors Management

## Immediate Access

I've created a standalone page for managing minors that you can access right now:

**URL**: `http://localhost:1313/volunteer-minors.html`

This page:
- ✅ Uses your existing authentication (session token)
- ✅ Styled with DaisyUI/Tailwind
- ✅ Full CRUD functionality (Add, List, Delete)
- ✅ Works independently of the main dashboard

## How to Use

1. **Login first** at `/volunteer` to get a session token
2. **Navigate to** `/volunteer-minors.html`
3. **Add minors** using the form
4. **View/manage** all minors on your account

## Before It Works

You need to deploy the backend infrastructure:

```bash
cd terraform
terraform apply
```

This creates:
- DynamoDB table for minors
- 4 Lambda functions (add, list, update, delete)
- API Gateway endpoints with CORS
- All necessary permissions

## Testing Without Deployment

Use the test page to verify your setup:

```bash
open test-minors-management.html
```

Enter your session token manually and test all operations.

## Integration into Main Dashboard

Once the backend is deployed and working, you can integrate minors management into the main volunteer dashboard at `/volunteer`.

The standalone page (`/volunteer-minors.html`) will work immediately after backend deployment.

## Files Created

### Ready to Use
- `static/volunteer-minors.html` - Standalone minors management page
- `test-minors-management.html` - Testing interface

### Backend (Need to Deploy)
- `terraform/minors_management.tf` - Infrastructure
- `terraform/lambda_minors_*.py` - Lambda functions
- `api/minors-*.js` - API endpoints (if using Node.js)

### Documentation
- `MINORS_INTEGRATION_SUMMARY.md` - Integration guide
- `MINORS_DEPLOYMENT_GUIDE.md` - Deployment steps
- `MINORS_CORS_FIX.md` - CORS troubleshooting
- `docs/minors-management.md` - API documentation

## Next Steps

1. **Deploy backend**: `cd terraform && terraform apply`
2. **Test**: Visit `/volunteer-minors.html` after logging in
3. **Verify**: Add/remove minors to confirm it works
4. **Integrate**: Add link to main dashboard (optional)

## Adding Link to Dashboard

To add a link from the main volunteer dashboard to the minors page, you can add this to the dashboard:

```html
<a href="/volunteer-minors.html" class="btn btn-primary">
  Manage Minors
</a>
```

Or wait for full integration into the dashboard itself.

## Support

- **CORS errors**: See `MINORS_CORS_FIX.md`
- **Deployment issues**: See `MINORS_DEPLOYMENT_GUIDE.md`
- **API questions**: See `docs/minors-management.md`
