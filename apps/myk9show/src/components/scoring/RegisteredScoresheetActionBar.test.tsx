import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ScoresheetActionBar } from '@myk9/scoring-ui';
import { useActionBarStore, selectReservedBottom } from '@/store/actionBarStore';
import { RegisteredScoresheetActionBar } from './RegisteredScoresheetActionBar';

const bar = (
  <RegisteredScoresheetActionBar>
    <ScoresheetActionBar
      onCancel={() => {}}
      onSave={() => {}}
      saveDisabled={false}
      isSubmitting={false}
    />
  </RegisteredScoresheetActionBar>
);

describe('RegisteredScoresheetActionBar', () => {
  afterEach(() => {
    useActionBarStore.setState({ heights: {} });
  });

  it('reserves bottom space while the footer is mounted and withdraws it on unmount', () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({ height: 68 }) as DOMRect;
    try {
      const { getByTestId, unmount } = render(bar);
      expect(getByTestId('scoresheet-action-bar')).toBeTruthy();
      expect(selectReservedBottom(useActionBarStore.getState())).toBe(68);
      unmount();
      expect(selectReservedBottom(useActionBarStore.getState())).toBe(0);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  it('registers nothing without the provider (package stays host-agnostic)', () => {
    render(
      <ScoresheetActionBar
        onCancel={() => {}}
        onSave={() => {}}
        saveDisabled={false}
        isSubmitting={false}
      />
    );
    expect(selectReservedBottom(useActionBarStore.getState())).toBe(0);
  });
});
