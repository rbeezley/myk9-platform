import { useEffect } from 'react';

/**
 * Registers a save handler on the window object for EntityCreationPanel's footer buttons.
 * EntityCreationPanel looks for `window[handleSave_${panelId}]` to delegate save actions.
 *
 * @param panelId - The panel's unique ID
 * @param handleSubmit - The panel's submit handler (must be a stable reference via useCallback)
 */
export function usePanelSaveHandler(
  panelId: string,
  handleSubmit: (action: 'save_close' | 'save_continue') => void
) {
  useEffect(() => {
    const handleParentSave = (action: 'save' | 'save_and_continue' | 'save_and_close') => {
      handleSubmit(
        action === 'save_and_close' || action === 'save' ? 'save_close' : 'save_continue'
      );
    };

    (window as unknown as Window & { [key: string]: unknown })[`handleSave_${panelId}`] =
      handleParentSave;

    return () => {
      delete (window as unknown as Window & { [key: string]: unknown })[`handleSave_${panelId}`];
    };
  }, [panelId, handleSubmit]);
}
