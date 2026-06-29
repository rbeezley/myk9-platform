import { render, screen } from '@/test/utils/testUtils';
import { Tabs, TabsList } from '@/components/ui/tabs';
import { DogTabTrigger } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.components';

describe('DogTabTrigger', () => {
  const renderTrigger = (existingEntryCount: number) =>
    render(
      <Tabs value="d1">
        <TabsList>
          <DogTabTrigger
            dogId="d1"
            dog={undefined}
            isActive
            existingEntryCount={existingEntryCount}
            cartCount={0}
          />
        </TabsList>
      </Tabs>
    );

  it('renders the already-entered count badge when there are existing entries', () => {
    renderTrigger(2);
    expect(screen.getByTitle(/Already entered in 2 classes/i)).toBeInTheDocument();
  });

  // Regression: the badge uses Badge variant="default", whose base styles include
  // hover:bg-primary/80. bg-success overrides the resting background but NOT the
  // hover, so the "already entered" badge turned primary-colored on hover. cn()
  // runs twMerge, so an explicit hover:bg-success/80 on the element wins and the
  // conflicting hover:bg-primary utility is dropped from the rendered class list.
  it('hovers in the success color, never primary', () => {
    renderTrigger(2);
    const badge = screen.getByTitle(/Already entered in 2 classes/i);
    expect(badge.className).toContain('hover:bg-success/80');
    expect(badge.className).not.toContain('hover:bg-primary');
  });
});
