# Homepage feature banners

The Japanese homepage's four feature banners now use black, ivory and violet studio artwork with live HTML copy. The original banner headlines and feature descriptions remain readable at mobile widths. The first-view photograph, hero copy, navigation, footer, App Store links, tracking attributes, FAQ and structured data are unchanged.

## Assets and content

- AirPods / Siri: voice capture, automatic transcription, offline queue and daily-note append.
- AI tags: voice capture, automatic organization and Obsidian append. The existing on-device explanation and its explicit “for tagging” privacy qualification remain below the banner.
- Apple Watch: voice capture in two taps, automatic transcription, no plugin and daily-note append.
- Obsidian: email and Obsidian destinations, no plugin, background append and Daily Note / Inbox support. The layout shows the two destinations independently, consistent with the surrounding copy.
- App preview: the original three messages about quick capture, sending to one's email and revisiting history are live text. The illustrations of older English screens are replaced with the already published Japanese compose and settings screenshots. No fabricated history screen is introduced.

Feature art is illustrative and contains no application UI or baked-in text. The actual app screenshots are unchanged assets from `assets/img/obsidian-voice-input/`. Decorative feature art has empty alt text because its information is expressed in adjacent HTML. Each banner remains a native keyboard-accessible link to its existing destination.

The four new source images are under `assets/img/home-banners/`, each as a 1536 × 1024 WebP and JPEG. They were created with the built-in image generation tool; the final prompt set and output paths are in [home-banner-prompts-2026-10-05.json](home-banner-prompts-2026-10-05.json). Delivery conversion changes only image encoding. Shared original banner files remain available to other pages.

## Responsive delivery

`scripts/perf/build_home.py` generates five content-addressed AVIF widths per illustration and updates the homepage font subsets. Desktop uses alternating copy/art columns; mobile uses copy followed by art. Image `sizes` follows that layout. JPEG and WebP fallbacks remain available without JavaScript. The first-view AVIF bytes and preload are preserved.

The dedicated `home-banners.css` is referenced only from the Japanese homepage and included in the cache-version guard. Other page styles and the English homepage are unchanged.

## Validation

- Chrome at 320, 375, 390, 430, 768, 1024, 1440 and 1920 px: all feature artwork loads, no horizontal overflow, native link focus works.
- At 375 and 1440 px: no axe WCAG A/AA violations.
- Baseline comparison confirms unchanged first-view HTML, navigation, footer, JSON-LD, App Store URLs and CTA attributes.
- The normal repository checks and homepage browser harness are required before publication; their final results are recorded in the pull request.
