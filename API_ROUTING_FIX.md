# API Routing Fix Summary

## 🎯 **Root Cause Identified**

The analytics endpoints were pointing to the wrong API Gateway because:

1. **Multiple API Gateways**: The system uses different API Gateways for different purposes:
   - **Events API**: `o2pkfnwqq4` (for events, analytics, volunteers)
   - **Main API**: `hq5bwnnj8h` (for general endpoints)
   - **Volunteer API**: `ppiqomgl8a` / `882dzmsoy5` (for volunteer forms)

2. **Hugo Config Override**: The events API client was using `window.API_CONFIG.BASE_URL` which points to the Main API (`hq5bwnnj8h`), not the Events API (`o2pkfnwqq4`)

3. **Wrong API Gateway**: Analytics endpoints exist on the Events API Gateway but the client was trying to access them on the Main API Gateway

## ✅ **Fix Implemented**

Updated the events API client to use **smart routing**:

### **Events-Specific Endpoints** → Events API Gateway (`o2pkfnwqq4`)
- `analytics`
- `events/*` 
- `volunteers/metrics`
- `volunteers/export`

**Environment Detection:**
- **Localhost**: Uses `/staging/` stage with fallback to `/prod/`
- **staging.domain**: Uses `/staging/` stage  
- **production domain**: Uses `/prod/` stage

### **Other Endpoints** → Main API Gateway (Hugo Config)
- Uses `window.API_CONFIG.BASE_URL` for non-events endpoints
- Maintains compatibility with existing functionality

## 🧪 **Testing the Fix**

### **Quick Test:**
Open `test-api-url.html` in your browser to verify URL routing:

**Expected Results:**
```
analytics: https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/staging/analytics (Events API)
events/export: https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/staging/events/export (Events API)  
volunteers/metrics: https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/staging/volunteers/metrics (Events API)
user-dashboard: https://hq5bwnnj8h.execute-api.us-east-1.amazonaws.com/staging/user-dashboard (Main API)
```

### **In Admin Interface:**
1. **Clear Browser Cache**: Hard refresh (Ctrl+F5 / Cmd+Shift+R)
2. **Check Console**: Should show "Events API URL for analytics: ..." 
3. **Analytics Tab**: Should now try the correct API Gateway

## 🚀 **Next Steps**

### **If Analytics Still Don't Work:**

1. **Deploy Analytics Endpoints** (if not done yet):
   ```bash
   cd terraform
   terraform workspace select staging
   terraform apply
   ```

2. **Check Browser Console** for the new URL pattern:
   ```
   Events API URL for analytics: https://o2pkfnwqq4.execute-api.us-east-1.amazonaws.com/staging/analytics (detected environment: staging)
   ```

3. **Verify Fallback**: If staging fails, should automatically try production:
   ```
   Staging endpoint failed for analytics, trying production fallback...
   Successfully used production fallback for analytics
   ```

## 🔧 **API Gateway Mapping**

| Endpoint Type | API Gateway | Stage | Purpose |
|---------------|-------------|-------|---------|
| `analytics` | `o2pkfnwqq4` | staging/prod | Analytics data |
| `events/*` | `o2pkfnwqq4` | staging/prod | Event management |
| `volunteers/metrics` | `o2pkfnwqq4` | staging/prod | Volunteer analytics |
| `volunteers/export` | `o2pkfnwqq4` | staging/prod | Data export |
| `user-dashboard` | `hq5bwnnj8h` | staging/prod | User dashboard |
| Other endpoints | Hugo Config | staging/prod | General API |

## 🐛 **Troubleshooting**

### **Still Getting CORS Errors:**
- Ensure you've deployed the analytics endpoints with CORS support
- Check that the correct API Gateway is being used (should be `o2pkfnwqq4`)

### **Wrong API Gateway in Console:**
- Clear browser cache completely
- Check that the updated `events-api-client.js` is being loaded

### **Fallback Not Working:**
- Check browser network tab for failed requests
- Verify both staging and production endpoints exist

The routing fix ensures analytics endpoints use the correct API Gateway while maintaining compatibility with existing functionality! 🎉