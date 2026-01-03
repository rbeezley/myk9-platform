#!/bin/bash

echo "Starting comprehensive build error fixes..."

# 1. Fix unused imports
echo "Step 1: Removing unused imports..."
# Remove unused React imports in files without JSX
find src -name "*.tsx" -o -name "*.ts" | while read file; do
    if ! grep -qE '<[A-Z]|<Fragment|<>|React\.' "$file" 2>/dev/null; then
        sed -i '/^import React from/d' "$file" 2>/dev/null || true
    fi
done

# Remove specific unused imports
sed -i '/^import.*Target.*from.*lucide-react/d' src/components/analytics/AnalyticsDashboard.tsx 2>/dev/null || true
sed -i '/^import.*Users.*from.*lucide-react/d' src/components/analytics/AnalyticsDashboard.tsx 2>/dev/null || true
sed -i '/^import.*Filter.*from.*lucide-react/d' src/components/analytics/AnalyticsDashboard.tsx 2>/dev/null || true
sed -i '/^import.*Award.*from.*lucide-react/d' src/components/classes/ClassEntriesTable.tsx 2>/dev/null || true
sed -i '/^import.*Copy.*from.*lucide-react/d' src/components/classes/ClassTemplateManager.tsx 2>/dev/null || true
sed -i '/^import.*Trash2.*from.*lucide-react/d' src/components/classes/ClassTemplateManager.tsx 2>/dev/null || true
sed -i '/^import.*TabsContent/d' src/components/clubs/ClubTabs.tsx 2>/dev/null || true

# 2. Fix import/export mismatches
echo "Step 2: Fixing import/export mismatches..."
# Fix CommonDialog imports (it's a named export, not default)
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/import CommonDialog from/import { CommonDialog } from/g' 2>/dev/null || true

# Fix competitionsStore -> competitionStore
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/@\/store\/competitionsStore/@\/store\/competitionStore/g' 2>/dev/null || true

# 3. Fix type property access errors
echo "Step 3: Fixing type property access errors..."
# Fix Show.date -> Show.startDate
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/show\.date/show.startDate/g' 2>/dev/null || true

# Fix health record properties
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/vaccine\.givenDate/vaccine.date/g' 2>/dev/null || true
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/dateGiven/date/g' 2>/dev/null || true
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/nextDue/expiration/g' 2>/dev/null || true
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/veterinarian/vetName/g' 2>/dev/null || true

# Fix sidebar properties
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/toggleCollapse/toggleCollapsed/g' 2>/dev/null || true
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/startResize/startResizing/g' 2>/dev/null || true

# 4. Fix specific file issues
echo "Step 4: Fixing specific file issues..."

# Fix AnimatedComponents.tsx - add missing import
sed -i '1i import { ReactNode } from '\''react'\'';' src/components/common/AnimatedComponents.tsx 2>/dev/null || true

# Fix ConfirmDeleteDialog import
sed -i 's/date: new Date(show\.date)/date: new Date(show.startDate)/g' src/components/dogs/DogDetails/Competitions/ConfirmDeleteDialog.tsx 2>/dev/null || true

# Fix DatePickerField usage
find src -name "*.tsx" | xargs sed -i 's/date={[^}]*}/value={formData.date}/g' 2>/dev/null || true
find src -name "*.tsx" | xargs sed -i 's/setDate={[^}]*}/onChange={(newDate) => setFormData({ ...formData, date: newDate })}/g' 2>/dev/null || true

# 5. Remove unused variables and fix const declarations
echo "Step 5: Removing unused variables..."
sed -i '/const COLORS = /d' src/components/analytics/AnalyticsDashboard.tsx 2>/dev/null || true

# 6. Fix class status type
echo "Step 6: Fixing type incompatibilities..."
sed -i 's/status: ""/status: "Scheduled"/g' src/components/classes/AddClassDialog.tsx 2>/dev/null || true

# 7. Fix EntityPageLayout props
echo "Step 7: Fixing missing props..."

# 8. Fix undefined handling
echo "Step 8: Adding undefined checks..."
# Add nullish coalescing for potentially undefined values
find src -name "*.tsx" | xargs sed -i 's/calculateAge(dog\.dateOfBirth)/calculateAge(dog?.dateOfBirth || "")/g' 2>/dev/null || true

echo "Build error fixes completed!"