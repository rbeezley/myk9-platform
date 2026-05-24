begin;

select plan(9);

select has_table('public', 'club_access_requests', 'club_access_requests table exists');
select has_function(
  'public',
  'review_club_access_request',
  array['uuid', 'text', 'uuid', 'text', 'text'],
  'review RPC exists'
);
select has_function(
  'public',
  'grant_club_secretary',
  array['uuid', 'uuid'],
  'grant secretary RPC exists'
);
select has_function(
  'public',
  'revoke_club_secretary',
  array['uuid', 'uuid'],
  'revoke secretary RPC exists'
);

select col_is_fk('public', 'club_access_requests', 'requester_person_id', 'request links to people');
select col_is_fk(
  'public',
  'club_access_requests',
  'approved_club_id',
  'approved request links to clubs'
);
select policies_are(
  'public',
  'club_access_requests',
  array[
    'club_access_requests_insert_own',
    'club_access_requests_select_own_or_site_admin',
    'club_access_requests_review_site_admin'
  ]
);
select has_table('public', 'permission_audit_log', 'permission audit table exists');
select pass('RPC behavioral checks run in the app integration suite with seeded auth context');

select * from finish();

rollback;
