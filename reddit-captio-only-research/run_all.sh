#!/usr/bin/env bash
# Captio-only Reddit research pipeline.
# Usage:
#   ./run_all.sh              # full pipeline
#   ./run_all.sh --light      # PullPush only (faster)
#   ./run_all.sh --skip-pullpush

set -e
cd "$(dirname "$0")"

if [ -z "$REDDIT_USER_AGENT" ]; then
    export REDDIT_USER_AGENT="captio-research/1.0 by /u/anon-researcher"
fi

LIGHT=0
SKIP_PULLPUSH=0
for arg in "$@"; do
    case "$arg" in
        --light) LIGHT=1 ;;
        --skip-pullpush) SKIP_PULLPUSH=1 ;;
    esac
done

echo "=== Phase 1: Reddit public JSON search ==="
if [ "$LIGHT" -eq 0 ]; then
    python3 scripts/search_reddit_captio.py
else
    echo "  (skipped in --light mode)"
fi

if [ "$SKIP_PULLPUSH" -eq 0 ]; then
    echo "=== Phase 2: PullPush.io ==="
    python3 scripts/fetch_pullpush.py
fi

echo "=== Phase 3: Pipeline (dedupe + score + classify + reports) ==="
python3 scripts/process_pipeline.py

echo ""
echo "=== Done. ==="
echo "Ranked CSV: $(pwd)/data/exports/reddit_captio_only_ranked.csv"
echo "Insights:   $(pwd)/reports/reddit_captio_only_insights.md"
