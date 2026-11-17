import React, { useState } from 'react';
import { ArrowLeft, Building2, Search, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBrowseClubsData } from '@/hooks/useBrowseClubsData';
import type { Club } from '@/types/club-types';
import { ExistingClubRequestPanel } from '@/features/club-requests/ExistingClubRequestPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageShell } from '@/components/common/PageShell';
import {
  ADD_YOUR_CLUB_PATH,
  ADD_YOUR_CLUB_PROMPT,
} from '@/components/landing/lifecycle/landingCtas';

// MYK9-2048: a new club is asked for in one place, the home page form. This page keeps
// only the search for joining a club that is already on myK9Show.
const RequestAccessPage: React.FC = () => {
  const [findingClub, setFindingClub] = useState(false);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const { filteredClubs, filters, setFilters, isLoading, hasError, handleRetry } =
    useBrowseClubsData();

  const reset = () => {
    setFindingClub(false);
    setSelectedClub(null);
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <Link
            to="/exhibitor/entries"
            className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to My Shows
          </Link>
          <h1 className="text-3xl font-semibold">Request additional access</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Use this page if you are helping run a club or setting up a new club. You keep this same
            myK9Show account, dogs, entries, and email address.
          </p>
        </div>

        {!findingClub && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <Building2 className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Set up a new club</CardTitle>
                <CardDescription>
                  Your club is not listed yet, or this is the first time it is using myK9Show.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="min-h-11 w-full">
                  <Link to={ADD_YOUR_CLUB_PATH}>Add your club</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <UserRound className="mb-2 h-8 w-8 text-primary" />
                <CardTitle>Join an existing club</CardTitle>
                <CardDescription>
                  Ask a club that already uses myK9Show to add you as a member, or to give you
                  secretary access for its shows.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="min-h-11 w-full"
                  onClick={() => setFindingClub(true)}
                >
                  Find an existing club
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {findingClub && (
          <Card>
            <CardHeader>
              <CardTitle>{selectedClub ? selectedClub.name : 'Find your club'}</CardTitle>
              <CardDescription>
                {selectedClub
                  ? 'The club’s admins review every request. Nothing changes until they approve it.'
                  : 'Search by club name, city, or state. Select your club to continue.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!selectedClub ? (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      aria-label="Search clubs"
                      className="min-h-11 pl-10"
                      value={filters.search}
                      onChange={event =>
                        setFilters(previous => ({ ...previous, search: event.target.value }))
                      }
                      placeholder="Type the club name"
                    />
                  </div>
                  {isLoading && <p className="text-sm text-muted-foreground">Loading clubs…</p>}
                  {hasError && (
                    <div className="space-y-2" role="alert">
                      <p className="text-sm text-destructive">We couldn&apos;t load the clubs.</p>
                      <Button variant="outline" className="min-h-11" onClick={handleRetry}>
                        Try again
                      </Button>
                    </div>
                  )}
                  {!isLoading &&
                    !hasError &&
                    filters.search.trim().length >= 2 &&
                    filteredClubs.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        We couldn&apos;t find that club.{' '}
                        <Link
                          to={ADD_YOUR_CLUB_PATH}
                          className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                        >
                          {ADD_YOUR_CLUB_PROMPT}
                        </Link>
                      </p>
                    )}
                  {filters.search.trim().length >= 2 && (
                    <div className="space-y-2">
                      {filteredClubs.slice(0, 8).map(club => (
                        <Button
                          key={club.id}
                          type="button"
                          variant="outline"
                          className="min-h-12 w-full justify-start text-left"
                          onClick={() => setSelectedClub(club)}
                        >
                          <Building2 className="mr-3 h-5 w-5 shrink-0" />
                          <span>
                            <span className="block font-medium">{club.name}</span>
                            {(club.address?.city || club.address?.state) && (
                              <span className="block text-sm font-normal text-muted-foreground">
                                {[club.address.city, club.address.state].filter(Boolean).join(', ')}
                              </span>
                            )}
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                  <Button type="button" variant="ghost" className="min-h-11" onClick={reset}>
                    Back
                  </Button>
                </>
              ) : (
                <>
                  <ExistingClubRequestPanel key={selectedClub.id} club={selectedClub} />
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setSelectedClub(null)}
                  >
                    Choose a different club
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
};

export default RequestAccessPage;
