#!/bin/bash

# Fix unused React imports where React is not used in JSX
echo "Removing unused React imports..."
find src -name "*.tsx" -o -name "*.ts" | while read file; do
    # Check if file contains JSX elements (< followed by uppercase letter or Fragment)
    if ! grep -qE '<[A-Z]|<Fragment|React\.' "$file"; then
        # Remove React import if present and not used
        sed -i '/^import React/d' "$file"
    fi
done

# Fix common import/export issues
echo "Fixing module import/export issues..."

# Fix StandardDialog imports
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/import { StandardDialog }/import StandardDialog/g'
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/import { DialogFooterButtons }/import DialogFooterButtons/g'
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/import { CommonDialog }/import CommonDialog/g'

echo "Build error fixes applied!"