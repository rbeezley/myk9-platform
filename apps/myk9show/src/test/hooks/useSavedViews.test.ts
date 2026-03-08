import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedViews, type ViewConfig, type SavedView } from '@/hooks/useSavedViews';

const TEST_PAGE = 'test-page';
const STORAGE_KEY = `myk9:saved-views:${TEST_PAGE}`;

function makeConfig(overrides: Partial<ViewConfig> = {}): ViewConfig {
  return {
    filters: { status: 'active' },
    viewMode: 'grid',
    ...overrides,
  };
}

function makeSavedView(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: crypto.randomUUID(),
    name: 'Test View',
    config: makeConfig(),
    isDefault: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('useSavedViews', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('saveView', () => {
    it('should add a view and persist to localStorage', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));
      const config = makeConfig();

      act(() => {
        result.current.saveView('My View', config);
      });

      expect(result.current.views).toHaveLength(1);
      expect(result.current.views[0].name).toBe('My View');
      expect(result.current.views[0].config).toEqual(config);
      expect(result.current.views[0].isDefault).toBe(false);
      expect(result.current.views[0].id).toBeDefined();
      expect(result.current.views[0].createdAt).toBeDefined();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('My View');
    });

    it('should set the new view as active', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('Active View', makeConfig());
      });

      expect(result.current.activeViewId).toBe(result.current.views[0].id);
      expect(result.current.activeView).toEqual(result.current.views[0]);
    });

    it('should append multiple views', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('View 1', makeConfig());
      });

      act(() => {
        result.current.saveView('View 2', makeConfig({ viewMode: 'list' }));
      });

      expect(result.current.views).toHaveLength(2);
      expect(result.current.views[0].name).toBe('View 1');
      expect(result.current.views[1].name).toBe('View 2');
    });
  });

  describe('updateView', () => {
    it('should modify an existing view', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('Original', makeConfig());
      });

      const viewId = result.current.views[0].id;
      const updatedConfig = makeConfig({ viewMode: 'list', sortColumn: 'name' });

      act(() => {
        result.current.updateView(viewId, updatedConfig);
      });

      expect(result.current.views[0].config).toEqual(updatedConfig);
      expect(result.current.views[0].name).toBe('Original');

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored[0].config).toEqual(updatedConfig);
    });

    it('should not modify other views', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('View A', makeConfig());
      });
      act(() => {
        result.current.saveView('View B', makeConfig({ viewMode: 'list' }));
      });

      const viewAId = result.current.views[0].id;

      act(() => {
        result.current.updateView(viewAId, makeConfig({ viewMode: 'calendar' }));
      });

      expect(result.current.views[1].config.viewMode).toBe('list');
    });
  });

  describe('deleteView', () => {
    it('should remove a view', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('To Delete', makeConfig());
      });

      const viewId = result.current.views[0].id;

      act(() => {
        result.current.deleteView(viewId);
      });

      expect(result.current.views).toHaveLength(0);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored).toHaveLength(0);
    });

    it('should clear activeViewId when deleting the active view', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('Active', makeConfig());
      });

      const viewId = result.current.views[0].id;
      expect(result.current.activeViewId).toBe(viewId);

      act(() => {
        result.current.deleteView(viewId);
      });

      expect(result.current.activeViewId).toBeNull();
      expect(result.current.activeView).toBeNull();
    });

    it('should not clear activeViewId when deleting a non-active view', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('View 1', makeConfig());
      });
      act(() => {
        result.current.saveView('View 2', makeConfig());
      });

      // activeViewId is View 2 (last saved)
      const view1Id = result.current.views[0].id;
      const view2Id = result.current.views[1].id;
      expect(result.current.activeViewId).toBe(view2Id);

      act(() => {
        result.current.deleteView(view1Id);
      });

      expect(result.current.activeViewId).toBe(view2Id);
    });
  });

  describe('setDefault', () => {
    it('should mark a view as default and unmark others', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('View 1', makeConfig());
      });
      act(() => {
        result.current.saveView('View 2', makeConfig());
      });

      const view1Id = result.current.views[0].id;

      act(() => {
        result.current.setDefault(view1Id);
      });

      expect(result.current.views[0].isDefault).toBe(true);
      expect(result.current.views[1].isDefault).toBe(false);

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored[0].isDefault).toBe(true);
      expect(stored[1].isDefault).toBe(false);
    });

    it('should switch default from one view to another', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('View 1', makeConfig());
      });
      act(() => {
        result.current.saveView('View 2', makeConfig());
      });

      const view1Id = result.current.views[0].id;
      const view2Id = result.current.views[1].id;

      act(() => {
        result.current.setDefault(view1Id);
      });

      expect(result.current.views[0].isDefault).toBe(true);

      act(() => {
        result.current.setDefault(view2Id);
      });

      expect(result.current.views[0].isDefault).toBe(false);
      expect(result.current.views[1].isDefault).toBe(true);
    });
  });

  describe('applyView', () => {
    it('should set the active view', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('View 1', makeConfig());
      });
      act(() => {
        result.current.saveView('View 2', makeConfig());
      });

      const view1Id = result.current.views[0].id;

      act(() => {
        result.current.applyView(view1Id);
      });

      expect(result.current.activeViewId).toBe(view1Id);
      expect(result.current.activeView).toEqual(result.current.views[0]);
    });
  });

  describe('clearActiveView', () => {
    it('should clear the active view', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('Active', makeConfig());
      });

      expect(result.current.activeViewId).not.toBeNull();

      act(() => {
        result.current.clearActiveView();
      });

      expect(result.current.activeViewId).toBeNull();
      expect(result.current.activeView).toBeNull();
    });
  });

  describe('Loading from localStorage on init', () => {
    it('should load saved views from localStorage', () => {
      const existingViews: SavedView[] = [
        makeSavedView({ name: 'Preloaded 1' }),
        makeSavedView({ name: 'Preloaded 2', isDefault: true }),
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existingViews));

      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      expect(result.current.views).toHaveLength(2);
      expect(result.current.views[0].name).toBe('Preloaded 1');
      expect(result.current.views[1].name).toBe('Preloaded 2');
      expect(result.current.views[1].isDefault).toBe(true);
    });

    it('should start with empty views when localStorage has no data', () => {
      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      expect(result.current.views).toHaveLength(0);
      expect(result.current.activeViewId).toBeNull();
      expect(result.current.activeView).toBeNull();
    });

    it('should use page-scoped storage keys', () => {
      const viewsA: SavedView[] = [makeSavedView({ name: 'Page A View' })];
      const viewsB: SavedView[] = [makeSavedView({ name: 'Page B View' })];
      localStorage.setItem('myk9:saved-views:page-a', JSON.stringify(viewsA));
      localStorage.setItem('myk9:saved-views:page-b', JSON.stringify(viewsB));

      const { result: resultA } = renderHook(() => useSavedViews('page-a'));
      const { result: resultB } = renderHook(() => useSavedViews('page-b'));

      expect(resultA.current.views[0].name).toBe('Page A View');
      expect(resultB.current.views[0].name).toBe('Page B View');
    });
  });

  describe('Handling corrupt localStorage data', () => {
    it('should return empty views when localStorage contains invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');

      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      expect(result.current.views).toHaveLength(0);
    });

    it('should fall back to empty views when localStorage.getItem throws', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      expect(result.current.views).toHaveLength(0);

      getItemSpy.mockRestore();
    });

    it('should handle localStorage.setItem throwing gracefully', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const { result } = renderHook(() => useSavedViews(TEST_PAGE));

      act(() => {
        result.current.saveView('Still Works', makeConfig());
      });

      // State should still update even if localStorage write fails
      expect(result.current.views).toHaveLength(1);
      expect(result.current.views[0].name).toBe('Still Works');

      setItemSpy.mockRestore();
    });
  });
});
