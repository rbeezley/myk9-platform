import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SECRETARY_SHOW_DAY_PROMPTS } from '@/components/askq/askq-config';
import type { ShowWorkbenchPhase } from '@/hooks/useActivePhase';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';

interface ShowWorkbenchAskQHelpProps {
  phase: ShowWorkbenchPhase;
}

export function ShowWorkbenchAskQHelp({ phase }: ShowWorkbenchAskQHelpProps) {
  const openWithPrompt = useAskQPanelStore(state => state.openWithPrompt);
  const prompts = SECRETARY_SHOW_DAY_PROMPTS.filter(prompt => prompt.phases.includes(phase));

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="workbench-askq-title">
      <div className="flex items-start gap-3">
        <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 id="workbench-askq-title" className="text-base font-semibold text-foreground">
            What do I do if...
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Open AskQ with this show's context when a rule, workflow, or exhibitor question comes
            up.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map(prompt => (
          <Button
            key={prompt.label}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal text-left"
            onClick={() => openWithPrompt(prompt.prompt)}
          >
            {prompt.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
