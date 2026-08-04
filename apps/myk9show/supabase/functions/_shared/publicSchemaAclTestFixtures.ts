export const publicSchemaAclFacts = (over: Record<string, unknown> = {}) => ({
  roles: [
    { role: 'anon', can_create: false },
    { role: 'authenticated', can_create: false },
    { role: 'service_role', can_create: false },
  ],
  violations: [],
  ...over,
});
