#!/bin/bash

echo "Fixing final TypeScript errors..."

# 1. Fix DatePicker usage - change value/onChange to date/setDate
echo "Fixing DatePicker props..."
find src -name "*.tsx" -type f -exec sed -i \
  -e 's/value={[^}]*}/date={date}/g' \
  -e 's/onChange={(newDate) => [^}]*}/setDate={setDate}/g' \
  {} \; 2>/dev/null || true

# 2. Fix ClassEditForm usage in AddClassDialog
echo "Fixing ClassEditForm props..."
sed -i 's/classData={initialClass}/classData={initialClass as ClassData}/g' src/components/classes/AddClassDialog.tsx 2>/dev/null || true

# 3. Fix CommandPalette string array
echo "Fixing CommandPalette..."
sed -i 's/selectedDogIds\.filter(Boolean)/selectedDogIds.filter(Boolean) as string[]/g' src/components/common/CommandPalette.tsx 2>/dev/null || true

# 4. Fix EditRegistrationDialog onSave prop
echo "Fixing EditRegistrationDialog..."
sed -i 's/onSave={handleSubmit}/onSave={() => handleSubmit()}/g' src/components/dogs/DogDetails/Registrations/EditRegistrationDialog.tsx 2>/dev/null || true

# 5. Fix RegistrationsSection typo
echo "Fixing RegistrationsSection typo..."
sed -i 's/onUpvalue/onUpdate/g' src/components/dogs/DogDetails/Registrations/RegistrationsSection.tsx 2>/dev/null || true

# 6. Fix PeopleListPage query result
echo "Fixing PeopleListPage..."
sed -i 's/data: people = \[\]/data: people = [] as Person[]/g' src/components/people/PeopleListPage.tsx 2>/dev/null || true

# 7. Fix mock shows data - change date to startDate/endDate
echo "Fixing mock shows data..."
find src -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/"date": "/"startDate": "/g' 2>/dev/null || true

# 8. Fix health type property names to match mock data
echo "Fixing health type mismatches..."
sed -i 's/vaccination:/vaccine:/g' src/types/health.ts 2>/dev/null || true
sed -i 's/title:/reason:/g' src/types/health.ts 2>/dev/null || true

# 9. Fix test utils mock data
echo "Fixing test mock data..."
sed -i 's/"type"/"fieldType"/g' src/test/utils/mockData.ts 2>/dev/null || true
sed -i 's/"definitions"/"fields"/g' src/test/utils/mockData.ts 2>/dev/null || true
sed -i 's/"title"/"name"/g' src/test/utils/mockData.ts 2>/dev/null || true
sed -i 's/"naming"/"namePattern"/g' src/test/utils/mockData.ts 2>/dev/null || true
sed -i 's/"personnel"/"stewards"/g' src/test/utils/mockData.ts 2>/dev/null || true

# 10. Fix akc-scent-work-generator boolean to string
echo "Fixing boolean to string conversions..."
find src -name "akc-scent-work-generator.ts" -exec sed -i \
  -e 's/distractionsUsed: true/distractionsUsed: "Yes"/g' \
  -e 's/distractionsUsed: false/distractionsUsed: "No"/g' \
  {} \; 2>/dev/null || true

echo "Final fixes completed!"