#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== verify ==="
npx tsx "$SCRIPT_DIR/verify.ts"
if [[ $? -ne 0 ]]; then
    echo ""
    echo "METRIC: 0"
    echo "FAILED: correctness check"
    exit 1
fi

echo ""
echo "=== bench ==="
npx tsx "$SCRIPT_DIR/bench.ts"
