import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { LateEntryContact } from '../LateEntryContact';
import { LateEntryContactContext, ShowHasHappenedContext } from '../lateEntryContactContext';

function renderContact(value: { name: string | null; email: string | null } | null | undefined) {
  return render(
    <LateEntryContactContext.Provider value={value}>
      <p>
        <LateEntryContact />
      </p>
    </LateEntryContactContext.Provider>
  );
}

describe('LateEntryContact (MYK9-1288)', () => {
  it('names the secretary with a mailto link when an email is listed', () => {
    renderContact({ name: 'Pat Secretary', email: 'pat@example.com' });

    const link = screen.getByRole('link', { name: 'Pat Secretary' });
    expect(link).toHaveAttribute('href', 'mailto:pat@example.com');
    expect(screen.getByText(/for late-entry help/)).toBeInTheDocument();
  });

  it('links the email itself when the secretary has no name', () => {
    renderContact({ name: null, email: 'pat@example.com' });

    expect(screen.getByRole('link', { name: 'pat@example.com' })).toHaveAttribute(
      'href',
      'mailto:pat@example.com'
    );
  });

  it('names the secretary without a link when no email is listed', () => {
    renderContact({ name: 'Pat Secretary', email: null });

    expect(screen.getByText(/Pat Secretary/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says the club has not listed a secretary when there is none', () => {
    renderContact(null);

    expect(screen.getByText('The club has not listed a secretary yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/late-entry help/)).not.toBeInTheDocument();
  });

  it.each([['still loading or failed (unknown)', undefined]])(
    'makes no claim about the secretary while the read is %s',
    (_label, value) => {
      renderContact(value);

      expect(
        screen.getByText('Contact the trial secretary for late-entry help.')
      ).toBeInTheDocument();
      expect(screen.queryByText(/has not listed/)).not.toBeInTheDocument();
    }
  );

  it('makes no claim when rendered without a provider', () => {
    render(
      <p>
        <LateEntryContact />
      </p>
    );

    expect(screen.queryByText(/has not listed/)).not.toBeInTheDocument();
    expect(screen.getByText(/Contact the trial secretary/)).toBeInTheDocument();
  });

  it('keeps the whole sentence, lead included, in one wrapper element around the link', () => {
    render(
      <LateEntryContactContext.Provider value={{ name: 'Pat Secretary', email: 'pat@example.com' }}>
        <p style={{ display: 'inline-flex' }}>
          <LateEntryContact lead="Entries are closed for this show. " />
        </p>
      </LateEntryContactContext.Provider>
    );

    const wrapper = screen.getByRole('link', { name: 'Pat Secretary' }).parentElement!;
    expect(wrapper.tagName).toBe('SPAN');
    expect(wrapper.textContent).toBe(
      'Entries are closed for this show. Contact Pat Secretary for late-entry help.'
    );
    // The paragraph's only child is that wrapper, so a flex parent sees one item.
    expect(wrapper.parentElement!.children).toHaveLength(1);
    expect(wrapper.parentElement!.childNodes).toHaveLength(1);
  });
});

describe('LateEntryContact on a show that has happened (MYK9-1423)', () => {
  function renderWith(happened: boolean, lead?: string) {
    return render(
      <LateEntryContactContext.Provider value={{ name: 'Pat Secretary', email: 'pat@example.com' }}>
        <ShowHasHappenedContext.Provider value={happened}>
          <p>
            <LateEntryContact lead={lead} />
          </p>
        </ShowHasHappenedContext.Provider>
      </LateEntryContactContext.Provider>
    );
  }

  it('past show: past-tense sentence, lead ignored, no late-entry copy, no mailto', () => {
    const { container } = renderWith(true, 'Entries are closed for this show. ');

    expect(container.querySelector('p')!.textContent).toBe('This show has already taken place.');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(screen.queryByText(/late-entry/)).not.toBeInTheDocument();
  });

  it('closed but upcoming show: sentence and mailto unchanged', () => {
    renderWith(false, 'Entries are closed for this show. ');

    expect(screen.getByRole('link', { name: 'Pat Secretary' })).toHaveAttribute(
      'href',
      'mailto:pat@example.com'
    );
    expect(screen.getByText(/for late-entry help/)).toBeInTheDocument();
  });
});
