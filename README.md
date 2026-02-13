# Capito式シンプルメモ (Simple Memo - Captio-style) Landing Page

A dark-themed, modern landing page for the Simple Memo iOS app, built with HTML, CSS, and Cloudflare Workers.


## Project Structure

```
simple-memo-v2/
├── index.html              # Main landing page
├── privacy.html            # Privacy policy page
├── terms.html              # Terms of service page
├── style.css               # Main stylesheet with dark theme & glassmorphism
├── policy.css              # Policy pages stylesheet
├── wrangler.toml           # Cloudflare Workers configuration
├── public/
│   ├── site.webmanifest    # PWA manifest
│   ├── assets/             # Images, icons, and OG images
│   │   ├── og.webp         # Open Graph image (1200x630)
│   │   ├── favicon.svg     # SVG favicon
│   │   ├── favicon.ico     # ICO favicon
│   │   ├── favicon-32.png  # 32x32 PNG favicon
│   │   └── apple-touch-icon.png  # 180x180 Apple touch icon
│   └── ...
└── README.md               # This file
```

## Design Features

- **Dark Theme**: Deep blue background (#000103, #001A2B) with cyan/blue accents
- **Glassmorphism**: Semi-transparent cards with backdrop blur effects
- **Glow Effects**: Cyan glow on buttons, icons, and text for visual depth
- **Mobile-First**: Fully responsive design optimized for iPhone Safari
- **No External Dependencies**: Pure HTML, CSS, and SVG icons

## Color Palette

```css
--bg0: #000103          /* Almost black */
--bg1: #001A2B          /* Deep blue */
--bg2: #002D4A          /* Darker blue */
--text: #EAF2FF         /* Off-white */
--muted: #B7C7D9        /* Light gray */
--accent: #6AAAD0       /* Cyan */
--accent2: #3E85A2      /* Darker blue */
--glow: rgba(106, 170, 208, 0.55)  /* Glow effect */
```

## Deployment to Cloudflare Workers

### Prerequisites
- Cloudflare account with a domain
- `wrangler` CLI installed (`npm install -g @cloudflare/wrangler`)
- Node.js 16+

### Steps

1. **Clone or download this repository**
   ```bash
   git clone <your-repo-url>
   cd simple-memo-v2
   ```

2. **Install dependencies** (if using build tools)
   ```bash
   npm install
   ```

3. **Configure wrangler.toml**
   - Update `name` to your project name
   - Update the `routes` section with your domain

4. **Deploy to Cloudflare Workers**
   ```bash
   wrangler deploy
   ```

5. **Set up custom domain** (if not already configured)
   - Go to Cloudflare Dashboard
   - Add your domain and configure DNS
   - Ensure Workers route is properly configured

### Alternative: GitHub + Cloudflare Pages

If you prefer Cloudflare Pages instead of Workers:

1. Push this repository to GitHub
2. In Cloudflare Dashboard, go to Pages
3. Click "Connect to Git" and select your repository
4. Set build settings:
   - **Framework preset**: None
   - **Build command**: (leave empty)
   - **Build output directory**: `/`
5. Deploy

## Pages

### `/` - Landing Page
Main landing page with:
- Hero section with CTA buttons
- Features showcase (3 cards)
- Data & Privacy section (3 cards)
- FAQ section (3 items)
- Footer with links

### `/privacy` - Privacy Policy
Comprehensive privacy policy covering:
- Data collection practices
- Local storage of notes
- Resend email delivery
- No analytics/tracking
- Contact information

### `/terms` - Terms of Service
Terms of service covering:
- Service description
- Warranties and limitations
- User responsibilities
- Contact information

### `/support` - Support (mailto)
Redirects to support email: `support@simplememofast.com`

## Assets

Place the following files in `public/assets/`:

- `og.webp` - Open Graph image (1200x630px recommended)
- `favicon.svg` - SVG favicon
- `favicon.ico` - ICO favicon
- `favicon-32.png` - 32x32 PNG favicon
- `apple-touch-icon.png` - 180x180 PNG for Apple devices

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- iOS Safari 14+

## Accessibility

- WCAG 2.1 Level AA compliant
- Supports `prefers-reduced-motion`
- Semantic HTML structure
- Proper color contrast ratios

## Performance

- No external dependencies or frameworks
- Minimal CSS (~12KB)
- Optimized for mobile devices
- Fast page load times

## License

© 2026 Simple Memo. All rights reserved.
