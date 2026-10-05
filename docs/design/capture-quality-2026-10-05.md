# Capture page design quality

The Japanese `/obsidian/` landing page is the visual reference. This pass covers the homepage, the ten existing priority guides, and that reference page. Priority reflects existing conversion relevance and search evidence; it is not a measured ranking of customer lifetime value.

## Scope

- `/`
- `/blog/obsidian-voice-input`
- `/obsidian/pricing/`
- `/apple-watch/`
- `/obsidian/sync/`
- `/obsidian/journaling/`
- `/obsidian/getting-started/`
- `/obsidian/sync/icloud/`
- `/obsidian/compare/logseq/`
- `/obsidian/what-is-vault/`
- `/blog/captio-discontinued`
- `/obsidian/`

## Visual rules

Use the reference's Hiragino-first Japanese font stack, near-black background (`#07070b`), neutral surface (`#0d0e14`), white headings, and lavender accent (`#c4b5fd`). Guide headings use weight 900 with 1.22 line height; longer article titles remain smaller than the short landing-page headline. Break headlines at meaningful Japanese phrases without rewriting their content. Body copy remains 16px on small screens and 17px on desktop, with a comfortable reading measure of 760px.

Separate decorative diagrams from app interfaces. Voice-input and Captio guide covers use the published Japanese `01-compose.webp` screen, with its original blue send and microphone controls. Their captions identify SimpleMemo. The reference landing page retains its existing illustrative phone; conceptual workflow diagrams remain labelled as diagrams. Do not invent product UI or use visual treatments that suggest an unavailable feature.

Guide illustrations use larger labels and a single main surface instead of nested cards. On small screens, navigation routes become full-width rows with at least 44px targets. Article phones are intentionally smaller than the landing-page phone so they do not delay access to the article. Homepage feature illustrations and the first-view photograph remain unchanged; its duplicate AI-tag heading is consolidated into the feature card.

FAQ controls share a neutral panel, one border, and lavender control states. Keyboard focus must stay visible. The reference demo supports Arrow Left/Right, Home, and End, with linked tab and panel labels and one active tab stop.

## Review and acceptance

First review found inconsistent fonts, undersized diagram labels, blue legacy FAQ controls, and an overly low-contrast reference caption color. These were corrected. Adversarial review then found that the mobile phone was too tall for an article and was off-center at tablet widths. The phone width and route padding were reduced, and the mobile figure's automatic inline margins restored. A second review prompted moving the reading routes ahead of the image on mobile, so the reader can reach the relevant article section before passing the decorative screen.

Acceptance requires readable layouts at 320–430px, tablet, and desktop widths; no horizontal page overflow; accurate app imagery; keyboard-operable navigation, disclosures, and demo tabs; no serious accessibility findings; and preserved metadata, FAQ schema, copy facts, and CTA tracking. Automated checks supplement visual review and do not establish award-winning quality or certify all assistive technologies.

This is a shared, scoped design system, not a global stylesheet replacement. The other languages and pages outside this list are unchanged.

## 遅延画像の位置安定性

Firefox CIで主要機能への直接リンクに約19pxの位置差を検出。ホームのアプリ画面は太い枠と `border-box` の組み合わせで、画像の読み込み前後に高さが変化していました。画像を `content-box` にし、枠幅を除いた横幅を明示することで、完成時の見た目を保ちつつ未読み込み時も同じ高さを確保します。遅延読み込みを強制した検証では高さ390px→390px、スクロール位置の変化0pxを確認しました。CIの許容差や比較条件は変更していません。
