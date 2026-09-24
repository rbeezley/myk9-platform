import React, { useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, Search, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBrowseClubsData } from '@/hooks/useBrowseClubsData';
import { submitNewClubAccessRequest } from '@/services/database/club-access-requests';
import type { Club } from '@/types/club-types';
import { ExistingClubRequestPanel } from '@/features/club-requests/ExistingClubRequestPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageShell } from '@/components/common/PageShell';

type AccessPath = 'new-club' | 'existing-club';

const RequestAccessPage: React.FC = () => {
  const [path, setPath] = useState<AccessPath | null>(null);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [clubName, setClubName] = useState('');
  const [website, setWebsite] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { filteredClubs, filters, setFilters, isLoading, hasError, handleRetry } =
    useBrowseClubsData();

  const reset = () => {
    setPath(null);
    setSelectedClub(null);
    setError(null);
    setSubmitted(false);
  };

  const submitNewClub = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = clubName.trim();
    if (!trimmedName) {
      setError('Enter the club name before sending your request.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await submitNewClubAccessRequest({
        clubName: trimmedName,
        website: website.trim(),
        note: note.trim(),
      });
      setSubmitted(true);
    } catch {
      setError("We couldn't send your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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

        {!path && (
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
                <Button className="min-h-11 w-full" onClick={() => setPath('new-club')}>
                  Request a new club
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
                  onClick={() => setPath('existing-club')}
                >
                  Find an existing club
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {path === 'new-club' && !submitted && (
          <Card>
            <CardHeader>
              <CardTitle>Set up a new club</CardTitle>
              <CardDescription>
                Send us the club name. We will review the request and help finish the setup. This
                request does not grant access immediately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={submitNewClub}>
                <div className="space-y-2">
                  <Label htmlFor="requested-club-name">Club name</Label>
                  <Input
                    id="requested-club-name"
                    value={clubName}
                    onChange={event => setClubName(event.target.value)}
                    placeholder="Example: Heartland Dog Club"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requested-club-website">Club website (optional)</Label>
                  <Input
                    id="requested-club-website"
                    type="url"
                    value={website}
                    onChange={event => setWebsite(event.target.value)}
                    placeholder="https://"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requested-club-note">Message (optional)</Label>
                  <Textarea
                    id="requested-club-note"
                    value={note}
                    onChange={event => setNote(event.target.value)}
                    placeholder="Tell us how you will use myK9Show."
                    rows={4}
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" className="min-h-11" disabled={isSubmitting}>
                    {isSubmitting ? 'Sending request…' : 'Send request'}
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11" onClick={reset}>
                    Back
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {path === 'new-club' && submitted && (
          <Card>
            <CardContent className="space-y-4 py-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h2 className="text-xl font-semibold">Request sent</h2>
              <p className="text-base text-muted-foreground">
                We received your club request. We will review it and contact you using the email on
                your account.
              </p>
              <Button asChild className="min-h-11">
                <Link to="/exhibitor/entries">Return to My Shows</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {path === 'existing-club' && (
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
                        We couldn&apos;t find that club. If it is new to myK9Show, go back and
                        choose “Set up a new club.”
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
