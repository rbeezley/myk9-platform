# Supabase Storage Policies

**Impact: HIGH (Secure file access, prevent unauthorized downloads/uploads)**

Storage buckets use RLS-like policies. Without proper policies, files may be publicly accessible or inaccessible.

## Incorrect (no policies or overly permissive)

```sql
-- Bucket created but no policies = no access
insert into storage.buckets (id, name) values ('avatars', 'avatars');

-- Or overly permissive policy
create policy "Anyone can do anything"
on storage.objects for all
using (true)
with check (true);
-- Security vulnerability: anyone can read/write all files
```

## Correct (scoped storage policies)

```sql
-- Create bucket with appropriate settings
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,  -- Not public, requires auth
  5242880,  -- 5MB limit
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Policy: Users can upload their own avatar
create policy "Users can upload own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update/delete their own avatar
create policy "Users can manage own avatar"
on storage.objects for update, delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Avatars are publicly readable
create policy "Avatars are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'avatars');
```

## Common Patterns

### Private user files (only owner can access)

```sql
create policy "Private user files"
on storage.objects for all
to authenticated
using (
  bucket_id = 'private-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'private-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

### Team-shared files

```sql
create policy "Team members can access team files"
on storage.objects for all
to authenticated
using (
  bucket_id = 'team-files'
  and exists (
    select 1 from team_members
    where team_members.team_id = (storage.foldername(name))[1]::uuid
    and team_members.user_id = auth.uid()
  )
);
```

### Signed URLs for temporary access

```typescript
// Generate signed URL (server-side or with service role)
const { data, error } = await supabase.storage
  .from('private-files')
  .createSignedUrl('folder/file.pdf', 3600); // 1 hour expiry

// Use the URL for temporary access
// data.signedUrl = 'https://...?token=...'
```

## Storage Helper Functions

```sql
-- Get folder path from object name
select storage.foldername('user123/documents/file.pdf');
-- Returns: {user123, documents}

-- Get filename from object name
select storage.filename('user123/documents/file.pdf');
-- Returns: file.pdf

-- Get file extension
select storage.extension('user123/documents/file.pdf');
-- Returns: pdf
```

Reference: https://supabase.com/docs/guides/storage/security/access-control
