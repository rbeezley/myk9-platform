import { buildEntryReceiptHref } from './entryReceiptHref';

describe('buildEntryReceiptHref', () => {
  it('builds a My Shows link scoped to the order show + comma-joined entry ids', () => {
    expect(buildEntryReceiptHref('show-1', ['e1', 'e2'])).toBe(
      '/exhibitor/entries?showId=show-1&entryIds=e1%2Ce2'
    );
  });

  it('handles a single entry', () => {
    expect(buildEntryReceiptHref('show-1', ['e1'])).toBe(
      '/exhibitor/entries?showId=show-1&entryIds=e1'
    );
  });

  it('url-encodes ids that contain reserved characters', () => {
    expect(buildEntryReceiptHref('show 1', ['a/b'])).toBe(
      '/exhibitor/entries?showId=show+1&entryIds=a%2Fb'
    );
  });

  it('omits entryIds entirely rather than emitting an empty param', () => {
    expect(buildEntryReceiptHref('show-1', [])).toBe('/exhibitor/entries?showId=show-1');
  });

  it('scopes by entries alone when the order carries no show id', () => {
    expect(buildEntryReceiptHref(null, ['e1'])).toBe('/exhibitor/entries?entryIds=e1');
  });

  it('degrades to the plain page when there is nothing to scope by', () => {
    expect(buildEntryReceiptHref(null, [])).toBe('/exhibitor/entries');
  });
});
