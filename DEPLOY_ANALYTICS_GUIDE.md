# Analytics Deployment Guide

## 🚀 Quick Fix for CORS Issues

The analytics endpoints need to be deployed with proper CORS configuration. Here's how to deploy them:

### Option 1: Deploy to Staging (Recommended for Development)

```bash
# Navigate to terraform directory
cd terraform

# Select staging workspace
terraform workspace select staging

# Plan the deployment to see what will be created
terraform plan

# Apply the changes to deploy analytics endpoints
terraform apply
```

### Option 2: Deploy to Production (If you want to use production endpoints)

```bash
# Navigate to terraform directory
cd terraform

# Select production workspace
terraform workspace select production

# Plan the deployment
terraform plan

# Apply the changes
terraform apply
```

## 🔧 What Gets Deployed

The deployment will create:

1. **3 New Lambda Functions:**
   - `events_export` - Handles events data export
   - `analytics` - Provides comprehensive analytics
   - `volunteer_metrics` - Volunteer performance metrics

2. **New API Gateway Endpoints:**
   - `GET /events/export` - Export events data
   - `GET /analytics` - Get analytics data
   - `GET /volunteers/metrics` - Get volunteer metrics
   - `OPTIONS` methods for all endpoints (CORS support)

3. **Proper CORS Configuration:**
   - Allows requests from localhost during development
   - Supports all necessary headers and methods

## 🌐 Environment Detection

The frontend now automatically detects the environment:

- **Localhost (127.0.0.1:1313)**: Uses staging endpoints with production fallback
- **staging.waterwaycleanups.org**: Uses staging endpoints
- **waterwaycleanups.org**: Uses production endpoints

## 🧪 Testing the Deployment

After deployment, test the analytics:

1. **Go to Admin Interface**: Navigate to `/admin`
2. **Login**: Use your admin credentials
3. **Click Analytics Tab**: Should now load real analytics data
4. **Check Browser Console**: Look for successful API calls

### Expected Console Output:
```
API URL for analytics: https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/staging/analytics (detected environment: staging)
```

## 🐛 Troubleshooting

### If Analytics Still Don't Load:

1. **Check Terraform Workspace:**
   ```bash
   terraform workspace show
   ```

2. **Verify Deployment:**
   ```bash
   terraform output events_api_url
   ```

3. **Check Lambda Functions:**
   ```bash
   aws lambda list-functions --query 'Functions[?contains(FunctionName, `analytics`) || contains(FunctionName, `export`) || contains(FunctionName, `metrics`)].FunctionName'
   ```

### If CORS Errors Persist:

1. **Verify API Gateway Deployment:**
   - Check that the deployment includes the new CORS endpoints
   - Ensure the stage name matches your environment

2. **Check Browser Network Tab:**
   - Look for OPTIONS preflight requests
   - Verify the response includes proper CORS headers

### If Staging Endpoints Don't Exist:

The frontend now includes automatic fallback:
- Tries staging endpoints first (for localhost)
- Falls back to production if staging fails
- Logs the fallback attempt in console

## 📊 Expected Analytics Data

Once deployed, you should see:

### Analytics Cards:
- **Attendance Rate**: Percentage of volunteers who attended vs no-shows
- **Cancellation Rate**: Percentage of RSVPs that were cancelled
- **Total Volunteers**: Count of registered volunteers
- **Retention Rate**: Percentage of volunteers who attended multiple events

### Detailed Breakdowns:
- **Cancellation Timing**: When volunteers typically cancel
- **Volunteer Engagement**: Distribution of volunteer participation levels

### Export Functionality:
- **Events Export**: Download comprehensive event data
- **Volunteers Export**: Download volunteer performance data
- **Multiple Formats**: JSON and CSV options

## 🔄 Next Steps

1. **Deploy the Infrastructure**: Run the terraform commands above
2. **Test the Analytics**: Verify everything works in your browser
3. **Monitor Performance**: Check CloudWatch logs for any issues
4. **Gather Feedback**: See how useful the analytics are for your team

## 📝 Deployment Checklist

- [ ] Navigate to terraform directory
- [ ] Select appropriate workspace (staging/production)
- [ ] Run `terraform plan` to review changes
- [ ] Run `terraform apply` to deploy
- [ ] Test analytics in admin interface
- [ ] Verify export functionality works
- [ ] Check browser console for errors
- [ ] Confirm CORS headers are present

The analytics system should be fully functional after deployment! 🎉