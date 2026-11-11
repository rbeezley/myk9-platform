/** Shown in place of an official AKC form that cannot print yet because a class has no judge. */
export function JudgeBlockedNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center p-8 text-center text-muted-foreground"
    >
      <p className="max-w-prose">{message}</p>
    </div>
  );
}
