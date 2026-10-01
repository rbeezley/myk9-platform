import { useOverlayStackEntry } from '@/hooks/useOverlayStackEntry';

/**
 * Rendered inside a dialog popup, which Base UI mounts only while the dialog is
 * open, so mounting IS opening. Gives every shared Dialog/AlertDialog a place
 * in the overlay stack by construction (MYK9-910): without it `SlideOverPanel`
 * behind the dialog stays "topmost" and an Escape that reaches the document
 * (focus on <body>, or any target outside the popup) closes the panel.
 */
export function OverlayStackMarker({ label }: { label: string }) {
  useOverlayStackEntry(true, label);
  return null;
}
