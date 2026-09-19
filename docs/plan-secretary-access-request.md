# Additional access request flow

## Scope

- Make the existing role-intent checkboxes visible before Google and Apple OAuth.
- Carry elevated-role intent through OAuth and materialize it in the existing role-request approval queue.
- Add one plain-English `/request-access` page linked from the exhibitor sidebar and Account.
- Let a first-time club requester submit a new-club setup request without using onboarding.
- Let an existing exhibitor search for a club and request secretary access from the same page.

## Testing phase

- Unit-test OAuth role-intent serialization and the signup UI payload.
- Add a source contract test for the authenticated RPC and run the targeted auth/account suites.
- Run TypeScript/lint checks for touched files and inspect the final diff for unrelated changes.

## Non-goals

- Granting secretary or club-officer access automatically.
- Changing the existing club-admin approval workflow.
