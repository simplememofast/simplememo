# Reddit r/productivity Post

**Title:** I used Captio for 10 years to email myself notes. When it died, I built my own replacement.

---

For those who don't know Captio: it was a dead-simple iPhone app. Open, type, tap, and your memo arrives in your email. That's it. No folders, no tags, no sync conflicts. Just the fastest way to capture a thought before it disappears.

I used it every single day for 10 years. Grocery lists, meeting notes, random 3am ideas — all went straight to my inbox. Then one day it vanished from the App Store. No warning, no update, just gone.

When it disappeared, I tried every alternative I could find. Quick-note apps, email drafts, voice memos, Shortcuts automations. Nothing came close to that instant-open-and-type experience. Most apps want you to organize things. I just wanted to *capture* things.

So I spent 6 months building SimpleMemo. Same core concept — open the app, type your note, tap send, it's in your email — but rebuilt from scratch with modern tech: AES-GCM encryption so your memos can't be read in transit, an offline queue that holds your notes when you're in a subway or airplane, and a 0.3-second cold start so the app is ready before your thought fades.

The key insight I keep coming back to: for quick capture, email is the perfect inbox. You already check it multiple times a day. There's no new app to maintain, no separate system to remember. Your memos just show up alongside everything else you need to deal with. It fits into the workflow you already have.

The hardest part of building it wasn't the code — it was resisting the urge to add features. Every week I'd think "maybe I should add tags" or "what about Markdown support." But Captio taught me that doing one thing perfectly beats doing ten things adequately.

Free tier gives you 3 memos per day (plenty for most people). Premium is unlimited for $4/month.

**Link:** [https://simplememofast.com/](https://simplememofast.com/)

Happy to answer any questions about the build process, the "email yourself" workflow, or why I think simple tools beat complex ones for capture.

*Disclosure: I'm the developer.*
