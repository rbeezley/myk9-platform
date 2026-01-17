/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// TODO: Refactor to use correct types once dayOfOperationsQueries.ts is updated to match schema
/**
 * Day-of Operations Page
 *
 * Secretary page for managing day-of-show operations:
 * - Day-of entries (walk-in registrations)
 * - Move-ups
 * - Scratches
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  UserPlus,
  ArrowUpCircle,
  XCircle,
  Search,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { getSecretaryShows } from '@/services/database/queries/showQueries';
import {
  getClassesWithCapacity,
  createDayOfEntry,
  scratchEntry,
  getScratchableEntries,
  processMoveUp,
  getMoveUpEligibleEntries,
  searchDogs,
  ClassWithCapacity,
} from '@/services/database/queries/dayOfOperationsQueries';

interface Show {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

interface ScratchableEntry {
  id: string;
  class_id: string;
  status: string;
  check_in_status: string | null;
  jump_height: string | null;
  run_order: number | null;
  entry: {
    id: string;
    handler: string | null;
    armband_number: string | null;
    dog: {
      id: string;
      name: string;
      call_name: string | null;
    } | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
  } | null;
}

interface DogSearchResult {
  id: string;
  name: string;
  call_name: string | null;
  breed: string | null;
  owner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export default function DayOfOperationsPage() {
  const { user } = useAuth();

  // Show selection
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Classes with capacity
  const [classes, setClasses] = useState<ClassWithCapacity[]>([]);

  // Day-of entry state
  const [showEntryDialog, setShowEntryDialog] = useState(false);
  const [dogSearch, setDogSearch] = useState('');
  const [dogSearchResults, setDogSearchResults] = useState<DogSearchResult[]>([]);
  const [selectedDog, setSelectedDog] = useState<DogSearchResult | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [handler, setHandler] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'check' | 'waived'>('cash');
  const [jumpHeight, setJumpHeight] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);

  // Scratch state
  const [scratchableEntries, setScratchableEntries] = useState<ScratchableEntry[]>([]);
  const [showScratchDialog, setShowScratchDialog] = useState(false);
  const [entryToScratch, setEntryToScratch] = useState<ScratchableEntry | null>(null);
  const [scratchReason, setScratchReason] = useState('');
  const [isScratching, setIsScratching] = useState(false);

  // Move-up state
  const [moveUpEntries, setMoveUpEntries] = useState<ScratchableEntry[]>([]);
  const [showMoveUpDialog, setShowMoveUpDialog] = useState(false);
  const [entryToMoveUp, setEntryToMoveUp] = useState<ScratchableEntry | null>(null);
  const [targetClassId, setTargetClassId] = useState('');
  const [moveUpReason, setMoveUpReason] = useState('');
  const [isProcessingMoveUp, setIsProcessingMoveUp] = useState(false);

  // Load shows on mount
  useEffect(() => {
    const loadShows = async () => {
      if (!user?.id) return;
      const { data } = await getSecretaryShows(user.id);
      if (data) {
        setShows(data);
        if (data.length > 0) {
          setSelectedShowId(data[0].id);
        }
      }
    };
    loadShows();
  }, [user?.id]);

  const loadData = useCallback(async () => {
    if (!selectedShowId) return;
    setIsLoading(true);

    try {
      const [classesRes, scratchRes, moveUpRes] = await Promise.all([
        getClassesWithCapacity(selectedShowId),
        getScratchableEntries(selectedShowId),
        getMoveUpEligibleEntries(selectedShowId),
      ]);

      if (classesRes.data) setClasses(classesRes.data);
      if (scratchRes.data) setScratchableEntries(scratchRes.data);
      if (moveUpRes.data) setMoveUpEntries(moveUpRes.data);
    } finally {
      setIsLoading(false);
    }
  }, [selectedShowId]);

  // Load data when show changes
  useEffect(() => {
    if (selectedShowId) {
      loadData();
    }
  }, [selectedShowId, loadData]);

  // Search for dogs
  const handleDogSearch = async () => {
    if (dogSearch.length < 2) return;
    const { data } = await searchDogs(dogSearch);
    if (data) {
      setDogSearchResults(data);
    }
  };

  // Create day-of entry
  const handleCreateEntry = async () => {
    if (!selectedDog || selectedClasses.length === 0 || !handler || !user?.id) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsCreatingEntry(true);
    try {
      const { data, error } = await createDayOfEntry(
        {
          dogId: selectedDog.id,
          showId: selectedShowId,
          classIds: selectedClasses,
          handler,
          paymentMethod,
          jumpHeight: jumpHeight || undefined,
          notes: entryNotes || undefined,
        },
        user.id
      );

      if (error) {
        toast.error(`Failed to create entry: ${error.message}`);
        return;
      }

      toast.success(
        `Entry created! Armband #${data?.armbandNumber} assigned for ${selectedClasses.length} class(es)`
      );
      setShowEntryDialog(false);
      resetEntryForm();
      loadData();
    } finally {
      setIsCreatingEntry(false);
    }
  };

  const resetEntryForm = () => {
    setDogSearch('');
    setDogSearchResults([]);
    setSelectedDog(null);
    setSelectedClasses([]);
    setHandler('');
    setPaymentMethod('cash');
    setJumpHeight('');
    setEntryNotes('');
  };

  // Scratch entry
  const handleScratch = async () => {
    if (!entryToScratch) return;

    setIsScratching(true);
    try {
      const { error } = await scratchEntry(entryToScratch.id, scratchReason || undefined);

      if (error) {
        toast.error(`Failed to scratch entry: ${error.message}`);
        return;
      }

      toast.success('Entry scratched successfully');
      setShowScratchDialog(false);
      setEntryToScratch(null);
      setScratchReason('');
      loadData();
    } finally {
      setIsScratching(false);
    }
  };

  // Process move-up
  const handleMoveUp = async () => {
    if (!entryToMoveUp || !targetClassId) return;

    setIsProcessingMoveUp(true);
    try {
      const { data, error } = await processMoveUp(
        entryToMoveUp.id,
        targetClassId,
        moveUpReason || undefined
      );

      if (error) {
        toast.error(`Failed to process move-up: ${error.message}`);
        return;
      }

      toast.success(`Move-up processed! Entry moved to ${data?.class?.name || 'new class'}`);
      setShowMoveUpDialog(false);
      setEntryToMoveUp(null);
      setTargetClassId('');
      setMoveUpReason('');
      loadData();
    } finally {
      setIsProcessingMoveUp(false);
    }
  };

  // Get available classes for move-up (classes with capacity)
  const getAvailableTargetClasses = () => {
    return classes.filter((c) => c.available_spots > 0 && c.id !== entryToMoveUp?.class_id);
  };

  const toggleClassSelection = (classId: string) => {
    setSelectedClasses((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Day-of Operations</h1>
          <p className="text-muted-foreground">
            Manage walk-in entries, move-ups, and scratches
          </p>
        </div>
        <Button onClick={loadData} variant="outline" disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Show Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Show</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedShowId} onValueChange={setSelectedShowId}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select a show" />
            </SelectTrigger>
            <SelectContent>
              {shows.map((show) => (
                <SelectItem key={show.id} value={show.id}>
                  {show.name}{' '}
                  {show.start_date && `(${new Date(show.start_date).toLocaleDateString()})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedShowId && (
        <Tabs defaultValue="entries" className="space-y-4">
          <TabsList>
            <TabsTrigger value="entries" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Day-of Entries
            </TabsTrigger>
            <TabsTrigger value="moveups" className="flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4" />
              Move-Ups
            </TabsTrigger>
            <TabsTrigger value="scratches" className="flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Scratches
            </TabsTrigger>
          </TabsList>

          {/* Day-of Entries Tab */}
          <TabsContent value="entries" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Class Availability</CardTitle>
                    <CardDescription>
                      Classes with available spots for day-of entries
                    </CardDescription>
                  </div>
                  <Button onClick={() => setShowEntryDialog(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Day-of Entry
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-center">Limit</TableHead>
                      <TableHead className="text-center">Accepted</TableHead>
                      <TableHead className="text-center">Available</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No classes found
                        </TableCell>
                      </TableRow>
                    ) : (
                      classes.map((cls) => (
                        <TableRow key={cls.id}>
                          <TableCell className="font-medium">
                            {cls.class_number && (
                              <span className="text-muted-foreground mr-2">
                                #{cls.class_number}
                              </span>
                            )}
                            {cls.name}
                          </TableCell>
                          <TableCell className="text-center">
                            {cls.entry_limit || 'No limit'}
                          </TableCell>
                          <TableCell className="text-center">{cls.accepted_count}</TableCell>
                          <TableCell className="text-center">{cls.available_spots}</TableCell>
                          <TableCell className="text-center">
                            {cls.available_spots > 0 ? (
                              <Badge variant="default">Open</Badge>
                            ) : (
                              <Badge variant="destructive">Full</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Move-Ups Tab */}
          <TabsContent value="moveups" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Move-Up Eligible Entries</CardTitle>
                <CardDescription>
                  Entries that can be moved to a higher class after qualifying
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Armband</TableHead>
                      <TableHead>Dog</TableHead>
                      <TableHead>Handler</TableHead>
                      <TableHead>Current Class</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moveUpEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No entries available for move-up
                        </TableCell>
                      </TableRow>
                    ) : (
                      moveUpEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono">
                            {entry.entry?.armband_number || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{entry.entry?.dog?.name}</div>
                            {entry.entry?.dog?.call_name && (
                              <div className="text-sm text-muted-foreground">
                                "{entry.entry.dog.call_name}"
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{entry.entry?.handler || '-'}</TableCell>
                          <TableCell>
                            {entry.class?.class_number && (
                              <span className="text-muted-foreground mr-1">
                                #{entry.class.class_number}
                              </span>
                            )}
                            {entry.class?.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant={entry.status === 'checked_in' ? 'default' : 'outline'}>
                              {entry.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => {
                                setEntryToMoveUp(entry);
                                setShowMoveUpDialog(true);
                              }}
                            >
                              <ArrowUpCircle className="mr-2 h-4 w-4" />
                              Move Up
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Scratches Tab */}
          <TabsContent value="scratches" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Scratch Management</CardTitle>
                <CardDescription>
                  Mark entries as scratched (no refund for day-of scratches)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Armband</TableHead>
                      <TableHead>Dog</TableHead>
                      <TableHead>Handler</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scratchableEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No entries available to scratch
                        </TableCell>
                      </TableRow>
                    ) : (
                      scratchableEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono">
                            {entry.entry?.armband_number || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{entry.entry?.dog?.name}</div>
                            {entry.entry?.dog?.call_name && (
                              <div className="text-sm text-muted-foreground">
                                "{entry.entry.dog.call_name}"
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{entry.entry?.handler || '-'}</TableCell>
                          <TableCell>
                            {entry.class?.class_number && (
                              <span className="text-muted-foreground mr-1">
                                #{entry.class.class_number}
                              </span>
                            )}
                            {entry.class?.name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                entry.check_in_status === 'checked_in'
                                  ? 'default'
                                  : 'outline'
                              }
                            >
                              {entry.check_in_status || 'pending'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setEntryToScratch(entry);
                                setShowScratchDialog(true);
                              }}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Scratch
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Day-of Entry Dialog */}
      <Dialog open={showEntryDialog} onOpenChange={setShowEntryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Day-of Entry</DialogTitle>
            <DialogDescription>
              Create a walk-in entry for a dog at this show
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Dog Search */}
            <div className="space-y-2">
              <Label>Search for Dog</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter dog name..."
                  value={dogSearch}
                  onChange={(e) => setDogSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDogSearch()}
                />
                <Button variant="outline" onClick={handleDogSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {dogSearchResults.length > 0 && !selectedDog && (
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {dogSearchResults.map((dog) => (
                    <div
                      key={dog.id}
                      className="p-2 hover:bg-muted cursor-pointer"
                      onClick={() => {
                        setSelectedDog(dog);
                        setDogSearchResults([]);
                        if (dog.owner) {
                          setHandler(
                            `${dog.owner.first_name || ''} ${dog.owner.last_name || ''}`.trim()
                          );
                        }
                      }}
                    >
                      <div className="font-medium">{dog.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {dog.call_name && `"${dog.call_name}" - `}
                        {dog.breed}
                        {dog.owner && ` - ${dog.owner.first_name} ${dog.owner.last_name}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedDog && (
                <div className="flex items-center justify-between bg-muted p-2 rounded-md">
                  <div>
                    <span className="font-medium">{selectedDog.name}</span>
                    {selectedDog.call_name && (
                      <span className="text-muted-foreground"> "{selectedDog.call_name}"</span>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDog(null)}>
                    Change
                  </Button>
                </div>
              )}
            </div>

            {/* Handler */}
            <div className="space-y-2">
              <Label>Handler Name *</Label>
              <Input
                placeholder="Handler name"
                value={handler}
                onChange={(e) => setHandler(e.target.value)}
              />
            </div>

            {/* Class Selection */}
            <div className="space-y-2">
              <Label>Select Classes *</Label>
              <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-2">
                {classes
                  .filter((c) => c.available_spots > 0)
                  .map((cls) => (
                    <div key={cls.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={cls.id}
                        checked={selectedClasses.includes(cls.id)}
                        onCheckedChange={() => toggleClassSelection(cls.id)}
                      />
                      <label htmlFor={cls.id} className="flex-1 cursor-pointer">
                        {cls.class_number && (
                          <span className="text-muted-foreground mr-1">#{cls.class_number}</span>
                        )}
                        {cls.name}
                        <span className="text-muted-foreground ml-2">
                          ({cls.available_spots} spots available)
                        </span>
                      </label>
                    </div>
                  ))}
                {classes.filter((c) => c.available_spots > 0).length === 0 && (
                  <div className="text-center text-muted-foreground py-4">
                    No classes with available spots
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Payment Method */}
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as 'cash' | 'check' | 'waived')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="waived">Waived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Jump Height */}
              <div className="space-y-2">
                <Label>Jump Height (optional)</Label>
                <Input
                  placeholder="e.g., 20"
                  value={jumpHeight}
                  onChange={(e) => setJumpHeight(e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any special notes..."
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEntryDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateEntry}
              disabled={isCreatingEntry || !selectedDog || selectedClasses.length === 0}
            >
              {isCreatingEntry ? 'Creating...' : 'Create Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scratch Confirmation Dialog */}
      <Dialog open={showScratchDialog} onOpenChange={setShowScratchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Confirm Scratch
            </DialogTitle>
            <DialogDescription>
              This will scratch the entry from the class. Day-of scratches are not eligible for
              refunds.
            </DialogDescription>
          </DialogHeader>

          {entryToScratch && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-md space-y-2">
                <div>
                  <span className="font-medium">Dog:</span> {entryToScratch.entry?.dog?.name}
                </div>
                <div>
                  <span className="font-medium">Armband:</span>{' '}
                  {entryToScratch.entry?.armband_number || '-'}
                </div>
                <div>
                  <span className="font-medium">Class:</span> {entryToScratch.class?.name}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Textarea
                  placeholder="Enter reason for scratch..."
                  value={scratchReason}
                  onChange={(e) => setScratchReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScratchDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleScratch} disabled={isScratching}>
              {isScratching ? 'Scratching...' : 'Confirm Scratch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move-Up Dialog */}
      <Dialog open={showMoveUpDialog} onOpenChange={setShowMoveUpDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5" />
              Process Move-Up
            </DialogTitle>
            <DialogDescription>
              Move this entry to a higher class level after qualifying
            </DialogDescription>
          </DialogHeader>

          {entryToMoveUp && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-md space-y-2">
                <div>
                  <span className="font-medium">Dog:</span> {entryToMoveUp.entry?.dog?.name}
                </div>
                <div>
                  <span className="font-medium">Armband:</span>{' '}
                  {entryToMoveUp.entry?.armband_number || '-'}
                </div>
                <div>
                  <span className="font-medium">Current Class:</span> {entryToMoveUp.class?.name}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Target Class *</Label>
                <Select value={targetClassId} onValueChange={setTargetClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target class" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableTargetClasses().map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.class_number && `#${cls.class_number} `}
                        {cls.name} ({cls.available_spots} spots)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Textarea
                  placeholder="e.g., Qualified in Novice"
                  value={moveUpReason}
                  onChange={(e) => setMoveUpReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveUpDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMoveUp} disabled={isProcessingMoveUp || !targetClassId}>
              {isProcessingMoveUp ? 'Processing...' : 'Process Move-Up'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
