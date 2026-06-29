import { buildFinishPaymentHref } from './finishPaymentHref';

describe('buildFinishPaymentHref', () => {
  it('builds a /cart recovery link with show + comma-joined entry ids', () => {
    expect(buildFinishPaymentHref('show-1', ['e1', 'e2'])).toBe(
      '/cart?showId=show-1&entryIds=e1%2Ce2'
    );
  });

  it('handles a single entry', () => {
    expect(buildFinishPaymentHref('show-1', ['e1'])).toBe('/cart?showId=show-1&entryIds=e1');
  });

  it('url-encodes ids that contain reserved characters', () => {
    expect(buildFinishPaymentHref('show 1', ['a/b'])).toBe(
      '/cart?showId=show+1&entryIds=a%2Fb'
    );
  });

  it('emits an empty entryIds param when given no entries', () => {
    expect(buildFinishPaymentHref('show-1', [])).toBe('/cart?showId=show-1&entryIds=');
  });
});
