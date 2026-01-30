# Simple Memo - Deployment Guide

## Option 1: Cloudflare Workers + Static Assets (Recommended)

### Prerequisites
- Cloudflare account
- Domain registered with Cloudflare
- `wrangler` CLI installed

### Steps

1. **Install Wrangler**
   ```bash
   npm install -g @cloudflare/wrangler
   ```

2. **Authenticate with Cloudflare**
   ```bash
   wrangler login
   ```

3. **Update wrangler.toml**
   ```toml
   name = "simple-memo"
   main = "src/index.ts"
   compatibility_date = "2024-01-01"
   
   [[assets]]
   directory = "public"
   binding = "ASSETS"
   ```

4. **Deploy**
   ```bash
   wrangler deploy
   ```

5. **Configure DNS**
   - Go to Cloudflare Dashboard
   - Add Workers route for your domain
   - Example: `simplememofast.com/*`

---

## Option 2: Cloudflare Pages (Simplest)

### Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Connect to Cloudflare Pages**
   - Go to Cloudflare Dashboard
   - Navigate to Pages
   - Click "Connect to Git"
   - Select your GitHub repository

3. **Configure Build Settings**
   - **Framework preset**: None
   - **Build command**: (leave empty)
   - **Build output directory**: `/`

4. **Deploy**
   - Click "Save and Deploy"
   - Your site will be live in minutes

5. **Add Custom Domain**
   - In Pages settings, add your domain
   - Update DNS records if needed

---

## Option 3: Traditional Static Hosting

### GitHub Pages
1. Push to GitHub
2. Go to Settings → Pages
3. Select `main` branch as source
4. Enable custom domain

### Netlify
1. Connect GitHub repository
2. Build settings:
   - Build command: (leave empty)
   - Publish directory: `/`
3. Deploy

### Vercel
1. Import GitHub repository
2. Framework: Other
3. Deploy

---

## File Structure for Deployment

```
simple-memo-v2/
├── index.html
├── privacy.html
├── terms.html
├── style.css
├── policy.css
├── wrangler.toml (for Workers)
├── public/
│   ├── favicon.svg
│   ├── favicon.ico
│   ├── favicon-32.png
│   ├── apple-touch-icon.png
│   ├── site.webmanifest
│   └── assets/
│       └── og.webp
└── README.md
```

---

## Environment Variables (if needed)

None required for this static site. All configuration is in HTML/CSS.

---

## DNS Configuration

### For Cloudflare Workers
```
Type: CNAME
Name: simplememofast.com
Content: simplememofast.com.workers.dev
```

### For Cloudflare Pages
```
Type: CNAME
Name: simplememofast.com
Content: simplememofast.pages.dev
```

---

## Monitoring & Maintenance

- Monitor Cloudflare Analytics
- Check for 404 errors on `/privacy` and `/terms`
- Verify OG image appears in social shares
- Test on mobile devices (iPhone Safari)

---

## Support Email

All support inquiries should go to: `support@simplememofast.com`

---

## Troubleshooting

### Pages not loading
- Check DNS configuration
- Verify domain is added to Cloudflare
- Clear browser cache

### Images not showing
- Ensure `public/assets/` files exist
- Check file paths in HTML
- Verify WebP format is supported

### OG image not appearing
- Verify `og.webp` exists in `public/assets/`
- Check meta tags in `index.html`
- Test with social media debuggers (Facebook, Twitter)

---

## Performance Tips

- All files are already optimized
- Use Cloudflare's caching rules
- Enable Gzip compression
- Monitor Core Web Vitals

---

## Security

- HTTPS enabled by default (Cloudflare)
- No sensitive data stored
- No cookies or tracking
- CSP headers recommended (configure in Workers)

---

## Next Steps

1. Deploy to production
2. Test all pages and links
3. Verify email links work
4. Test on mobile devices
5. Monitor analytics
