#!/bin/bash
# Create test users for myK9Show application
# This script creates users via Supabase Admin API

set -e

# Check if required environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "Error: Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables"
    echo "Example:"
    echo "export SUPABASE_URL='https://your-project.supabase.co'"
    echo "export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'"
    exit 1
fi

# Array of test users (email:password:first_name:last_name:role)
declare -a users=(
    "testadmin@example.com:TestAdmin123!:Test:Admin:site_admin"
    "testsecretary@example.com:TestSecretary123!:Test:Secretary:secretary"
    "testjudge@example.com:TestJudge123!:Test:Judge:judge"
    "testclubadmin@example.com:TestClubAdmin123!:Test:ClubAdmin:club_admin"
    "testexhibitor@example.com:TestExhibitor123!:Test:Exhibitor:exhibitor"
)

echo "🚀 Creating test users for myK9Show..."
echo "Supabase URL: $SUPABASE_URL"
echo ""

# Function to create a user
create_user() {
    local email=$1
    local password=$2
    local first_name=$3
    local last_name=$4
    local role=$5
    
    echo "Creating user: $email ($first_name $last_name) with role: $role"
    
    response=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -d "{
            \"email\": \"$email\",
            \"password\": \"$password\",
            \"email_confirm\": true,
            \"user_metadata\": {
                \"first_name\": \"$first_name\",
                \"last_name\": \"$last_name\",
                \"role\": \"$role\"
            }
        }")
    
    # Check if the response contains an error
    if echo "$response" | grep -q '"error"'; then
        echo "❌ Error creating user $email:"
        echo "$response" | jq -r '.error_description // .message // .error'
    else
        user_id=$(echo "$response" | jq -r '.id')
        echo "✅ User $email created successfully (ID: $user_id)"
    fi
}

# Create all users
for user_data in "${users[@]}"; do
    IFS=':' read -r email password first_name last_name role <<< "$user_data"
    create_user "$email" "$password" "$first_name" "$last_name" "$role"
    echo ""
done

echo "🎯 Now running database script to create user profiles and role assignments..."

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "⚠️  psql not found. Please install PostgreSQL client tools or run the SQL script manually:"
    echo "   psql \"$SUPABASE_URL\" -f create_test_users.sql"
else
    # Run the SQL script to create profiles and roles
    if [ -f "create_test_users.sql" ]; then
        echo "Executing create_test_users.sql..."
        psql "$SUPABASE_URL" -f create_test_users.sql
        echo "✅ Database profiles and roles created successfully!"
    else
        echo "⚠️  create_test_users.sql not found. Please run it manually."
    fi
fi

echo ""
echo "🎉 Test user setup complete!"
echo ""
echo "📋 Test Users Created:"
echo "├── Site Admin:     testadmin@example.com     (TestAdmin123!)"
echo "├── Secretary:      testsecretary@example.com (TestSecretary123!)"
echo "├── Judge:          testjudge@example.com     (TestJudge123!)"
echo "├── Club Admin:     testclubadmin@example.com (TestClubAdmin123!)"
echo "└── Exhibitor:      testexhibitor@example.com (TestExhibitor123!)"
echo ""
echo "🔍 To verify users were created, run:"
echo "supabase db psql -c \"SELECT email, first_name, last_name, roles FROM public.user WHERE email LIKE 'test%@example.com';\""