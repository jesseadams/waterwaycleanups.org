# Hosting Multiple SPAs with Separate CloudFront Distributions

This document explains the approach for hosting the main website and SESv2 admin app using separate CloudFront distributions:

1. Main website: `https://waterwaycleanups.org/`
2. SESv2 Admin app: `https://sesv2-admin.waterwaycleanups.org/`

## Architecture

Our solution uses separate CloudFront distributions and DNS records for a clean separation between applications:

![Architecture Diagram](https://mermaid.ink/img/pako:eNptkstuwyAQRX-FzTYt8iJSm7hVF910U3VX0a1ZDGRsUwEDzdRqlH8vBMvGjlkw3Dncx4R7ZpXJGbNM20_pQUHwVBnld6xF2KbIIfTFGEY3a8JEpVDv5opQXnLZhT0dVK7VN96Eh-nnjYrGJk2ytuFYJrMk8er5rRc-N6NT6BG03QeeYbe7-f8B6OM-Kp0xoKHsaRZt_XEWeHW8KKQ3hFXiCt7dcYUbaTrhIImHkTpPN57jpZAnhLBU-IlkYlVHRQ_cUDiFxpMGCzkdeKE7UAkzyOksJH4cW-X7cZhNhO-d1BDCmwZHbm7BlgZkJdlXuVccO3EqA-NEJ73m7h0nG9D-AM5ZpSQaOG4OBSghBUnz44pFqCWKdnBwEk0JaC0koBS7zXE3eXflwZnp5idPhv-ZHQ?type=png)

Key components:

1. **Two S3 Buckets**:
   - `waterwaycleanups.org` - Main website
   - `waterwaycleanups-sesv2-admin` - SESv2 admin app

2. **Two CloudFront Distributions**:
   - Main distribution - Serves the main website at `waterwaycleanups.org`
   - Admin distribution - Serves the SESv2 admin app at `sesv2-admin.waterwaycleanups.org`

3. **Route 53 Configuration**:
   - `waterwaycleanups.org` - A record pointing to the main CloudFront distribution
   - `www.waterwaycleanups.org` - CNAME record pointing to `waterwaycleanups.org`
   - `sesv2-admin.waterwaycleanups.org` - A record pointing to the admin CloudFront distribution

## Benefits of This Approach

1. **Simplified Configuration**: Each app has its own CloudFront distribution, making the configuration cleaner and less error-prone.

2. **Independent Cache Management**: Each distribution can have its own cache settings, invalidation strategy, and behaviors.

3. **Better Separation of Concerns**: The admin app is completely isolated from the main website, improving security.

4. **Simpler SPA Routing**: Each app can use standard SPA routing configurations without path prefix conflicts.

5. **Independent Scaling**: Each app can scale independently based on its own usage patterns.

6. **Improved Maintainability**: Changes to one app don't affect the other, making development and deployment safer.

## Deployment Process

To deploy the apps using separate CloudFront distributions:

1. **Run the Deployment Script**:
   ```bash
   cd terraform
   ./deploy-separate-distributions.sh
   ```

2. **Update the SESv2 Admin App's React Router Configuration**:
   ```jsx
   // Before (with path prefix)
   <BrowserRouter basename="/sesv2-admin">
     <App />
   </BrowserRouter>

   // After (with subdomain)
   <BrowserRouter basename="/">
     <App />
   </BrowserRouter>
   ```

3. **Deploy the SESv2 Admin App**:
   ```bash
   cd sesv2-admin
   ./deploy.sh
   ```

## Important Update for SESv2 Admin App

For the SESv2 admin app to work correctly with its own subdomain, make the following changes:

1. **Update PUBLIC_URL in your build process**:
   ```
   PUBLIC_URL=https://sesv2-admin.waterwaycleanups.org
   ```

2. **Update any API endpoints or CORS settings** to work with the new domain.

## CloudFront Best Practices

Both CloudFront distributions are configured with:

1. **Origin Access Control (OAC)**: Secures S3 buckets by restricting access to CloudFront only.

2. **Custom Error Responses**: Configures 403/404 responses to serve `index.html` for SPA routing.

3. **HTTPS Enforcement**: Redirects HTTP requests to HTTPS for improved security.

4. **Caching Optimization**: Uses AWS managed caching policies for better performance.

## Troubleshooting

If you encounter issues:

1. **CloudFront Cache**: Changes may take up to 15 minutes to propagate. Try invalidating the cache:
   ```bash
   aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
   ```

2. **DNS Propagation**: DNS changes can take time to propagate globally. Wait a few minutes and try again.

3. **S3 Bucket Policies**: Ensure the bucket policies allow access from the respective CloudFront distributions.

4. **React Router**: Verify that the basename is correctly set for the SESv2 admin app.
