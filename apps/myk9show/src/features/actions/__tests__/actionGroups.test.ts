import { describe, expect, it } from 'vitest';
import {
  groupActions,
  headerShowsActions,
  listHeading,
  pageObjectHeading,
  type ActionGroupHeadings,
} from '@/features/actions/actionGroups';
import { ACTION_ICONS } from '@/features/actions/actionIcons';
import { resolveActions, type AppAction } from '@/features/actions/actionRegistry';

const HEADINGS: ActionGroupHeadings = {
  page: 'Ruby',
  show: 'Fall Scent Weekend',
  list: 'Dogs',
  create: 'Create',
};

function action(id: string, group: AppAction['group']): AppAction {
  return { id, label: id, href: `/${id}`, group, icon: 'edit' };
}

describe('groupActions', () => {
  it('orders sections page, show, list, create whatever order the items arrive in', () => {
    const groups = groupActions(
      [action('c', 'create'), action('l', 'list'), action('s', 'show'), action('p', 'page')],
      HEADINGS
    );
    expect(groups.map(group => [group.id, group.heading])).toEqual([
      ['page', 'Ruby'],
      ['show', 'Fall Scent Weekend'],
      ['list', 'Dogs'],
      ['create', 'Create'],
    ]);
  });

  it('drops empty sections, so no heading ever sits over nothing', () => {
    const groups = groupActions([action('p', 'page'), action('c', 'create')], HEADINGS);
    expect(groups.map(group => group.id)).toEqual(['page', 'create']);
  });

  it('keeps the resolved order inside a section', () => {
    const groups = groupActions(
      [action('a', 'show'), action('b', 'show'), action('c', 'show')],
      HEADINGS
    );
    expect(groups[0]?.actions.map(item => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for an empty list, which hides the header button', () => {
    expect(groupActions([], HEADINGS)).toEqual([]);
  });
});

describe('headerShowsActions', () => {
  it('hides the button when its only item would be Add Dog (an exhibitor off their own pages)', () => {
    expect(headerShowsActions(groupActions([action('create-dog', 'create')], HEADINGS))).toBe(
      false
    );
  });

  it('hides it when there is nothing at all', () => {
    expect(headerShowsActions([])).toBe(false);
  });

  it('shows it as soon as anything else is there', () => {
    for (const extra of [
      action('dog-edit', 'page'),
      action('page-export-dogs', 'list'),
      action('create-show', 'create'),
    ]) {
      expect(
        headerShowsActions(groupActions([action('create-dog', 'create'), extra], HEADINGS)),
        extra.id
      ).toBe(true);
    }
  });

  it('shows a staff Create section without Add Dog', () => {
    expect(headerShowsActions(groupActions([action('create-club', 'create')], HEADINGS))).toBe(
      true
    );
  });
});

describe('section headings', () => {
  it('names a known list, and falls back for an unknown or multiple lists', () => {
    expect(listHeading(['people'])).toBe('People');
    expect(listHeading(['class-results'])).toBe('Results');
    expect(listHeading(['something-new'])).toBe('This list');
    expect(listHeading(['trials', 'classes'])).toBe('Lists on this page');
  });

  it("uses the page object's name, or 'This ‹kind›' while it loads", () => {
    expect(pageObjectHeading('person', 'Richard Beezley')).toBe('Richard Beezley');
    expect(pageObjectHeading('dog', undefined)).toBe('This dog');
    expect(pageObjectHeading('club', '   ')).toBe('This club');
  });
});

describe('every resolved action has a real icon', () => {
  it('maps each icon name a resolved action carries to a component', () => {
    const actions = resolveActions(
      { kind: 'show', showId: 's1', shellMounted: true },
      {
        canManageShow: true,
        canOperateShow: true,
        canCreateShows: true,
        canCreateDogs: true,
        canCreatePeople: true,
        canCreateClubs: true,
        pageObject: { kind: 'trial', addClassesHref: '/wizard' },
        pageExports: [{ id: 'trials' }],
      }
    );
    expect(new Set(actions.map(item => item.group))).toEqual(
      new Set(['page', 'show', 'list', 'create'])
    );
    for (const item of actions) expect(ACTION_ICONS[item.icon], item.id).toBeDefined();
  });
});
