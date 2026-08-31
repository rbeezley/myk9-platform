# MYK9-269, 273, 274–276, 278–279 implementation plan

## Scope

Implement MYK9-269, MYK9-273, MYK9-274, MYK9-275, MYK9-276, MYK9-278, and MYK9-279. Leave MYK9-277 untouched. MYK9-274 precedes MYK9-278 because both may affect shared accessibility/token surfaces.

## Execution

- Run MYK9-269, MYK9-273, MYK9-275, MYK9-276, and MYK9-279 in isolated agent worktrees.
- Implement MYK9-274 locally, then MYK9-278 after reviewing the token changes.
- Review all diffs for overlap and unrelated changes before integration.

## Testing

- Each issue adds or updates focused tests required by its acceptance criteria.
- Run focused tests/typechecks during implementation.
- Run the relevant app typecheck and test suite after integration; report any pre-existing or environment-blocked failures.
