# Memo Inbox static distribution

Source: https://github.com/simplememofast/memo-inbox/tree/ee7a487bbb5f397d474dae7c7439451ee872b148

MIT-licensed browser app. The deployed copies change only asset paths and site metadata. JavaScript/CSS filenames include SHA-256 prefixes for immutable caching. No analytics scripts or Cloudflare permission changes are added.

The app lives at `/memo-inbox/`, and its user guide at `/memo-inbox/guide`. Browser storage belongs to the current origin, so GitHub Pages notes do not migrate automatically. Use JSON backup and restore to move notes.

Validation upstream: 11 core tests, independent Python ZIP checks, and browser verification of save/reload/search/import/recovery and multi-tab conflict handling.
