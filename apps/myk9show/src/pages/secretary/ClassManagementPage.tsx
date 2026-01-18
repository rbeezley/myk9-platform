import React, { useState, startTransition } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClassCreationStore } from '@/store/classCreationStore';
import type { ClassStatus } from '@/types/template.types';
import { CLASS_STATUS, getClassStatusBadgeClasses } from '@myk9/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Play,
  Pause,
  CheckCircle,
  Clock,
  Settings,
  MoreVertical,
  ListOrdered,
  Users
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export const ClassManagementPage: React.FC = () => {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const { getClassesByTrial, updateClassStatus, deleteClass } = useClassCreationStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [elementFilter, setElementFilter] = useState<string>('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  // Get classes for this trial
  const allClasses = trialId ? getClassesByTrial(trialId) : [];
  
  // Filter classes
  const filteredClasses = allClasses.filter(cls => {
    const matchesSearch = !searchTerm || 
      cls.className.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.element.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.level?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = !statusFilter || cls.status === statusFilter;
    const matchesElement = !elementFilter || cls.element === elementFilter;
    
    return matchesSearch && matchesStatus && matchesElement;
  });

  // Get unique elements for filtering
  const elements = Array.from(new Set(allClasses.map(c => c.element))).sort();
  const statuses = Object.values(CLASS_STATUS);

  // Toggle class selection
  const toggleClassSelection = (classId: string) => {
    setSelectedClasses(prev => 
      prev.includes(classId) 
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  // Select all filtered classes
  const selectAllFiltered = () => {
    const filteredIds = filteredClasses.map(c => c.id);
    setSelectedClasses(prev => {
      const newSelection = [...prev];
      filteredIds.forEach(id => {
        if (!newSelection.includes(id)) {
          newSelection.push(id);
        }
      });
      return newSelection;
    });
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedClasses([]);
  };

  // Handle status change
  const handleStatusChange = (classId: string, newStatus: string) => {
    updateClassStatus(classId, newStatus as ClassStatus);
  };

  // Handle delete
  const handleDelete = (classId: string) => {
    if (confirm('Are you sure you want to delete this class?')) {
      deleteClass(classId);
    }
  };

  // Bulk operations
  const handleBulkStatusChange = (newStatus: string) => {
    selectedClasses.forEach(classId => {
      updateClassStatus(classId, newStatus as ClassStatus);
    });
    setSelectedClasses([]);
  };

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedClasses.length} classes?`)) {
      selectedClasses.forEach(classId => {
        deleteClass(classId);
      });
      setSelectedClasses([]);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case CLASS_STATUS.IN_PROGRESS: return <Play className="h-4 w-4" />;
      case CLASS_STATUS.COMPLETED: return <CheckCircle className="h-4 w-4" />;
      case CLASS_STATUS.CANCELLED: return <Pause className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    return getClassStatusBadgeClasses(status);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => startTransition(() => navigate(-1))}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trial
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Manage Classes</h1>
            <p className="text-muted-foreground">
              {trialId ? `Trial: ${trialId}` : 'No trial selected'}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => startTransition(() => navigate('/secretary/waitlist'))}>
            <ListOrdered className="h-4 w-4 mr-2" />
            Manage Waitlist
          </Button>
          <Button onClick={() => startTransition(() => navigate(`/trials/${trialId}/classes/create`))}>
            <Plus className="h-4 w-4 mr-2" />
            Add Classes
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center p-4">
            <Settings className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <div className="text-2xl font-bold">{allClasses.length}</div>
              <div className="text-sm text-muted-foreground">Total Classes</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center p-4">
            <Clock className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <div className="text-2xl font-bold">
                {allClasses.filter(c => c.status === CLASS_STATUS.SCHEDULED).length}
              </div>
              <div className="text-sm text-muted-foreground">Upcoming</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <Play className="h-8 w-8 text-amber-500 mr-3" />
            <div>
              <div className="text-2xl font-bold">
                {allClasses.filter(c => c.status === CLASS_STATUS.IN_PROGRESS).length}
              </div>
              <div className="text-sm text-muted-foreground">In Progress</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
            <div>
              <div className="text-2xl font-bold">
                {allClasses.filter(c => c.status === CLASS_STATUS.COMPLETED).length}
              </div>
              <div className="text-sm text-muted-foreground">Complete</div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => startTransition(() => navigate('/secretary/waitlist'))}
        >
          <CardContent className="flex items-center p-4">
            <Users className="h-8 w-8 text-yellow-500 mr-3" />
            <div>
              <div className="text-2xl font-bold">
                {allClasses.reduce((sum, c) => sum + (c.entries.waitlistEntries || 0), 0)}
              </div>
              <div className="text-sm text-muted-foreground">On Waitlist</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search classes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Element Filter */}
            <Select value={elementFilter} onValueChange={setElementFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Elements" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Elements</SelectItem>
                {elements.map(element => (
                  <SelectItem key={element} value={element}>{element}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setElementFilter('');
              }}
            >
              <Filter className="h-4 w-4 mr-2" />
              Clear
            </Button>

            <div className="text-sm text-muted-foreground">
              Showing {filteredClasses.length} of {allClasses.length} classes
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedClasses.length > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium">
                  {selectedClasses.length} class{selectedClasses.length !== 1 ? 'es' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Select onValueChange={handleBulkStatusChange}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Change Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={handleBulkDelete} className="text-red-600">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
              <Button variant="outline" onClick={clearSelection}>
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Classes List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Classes ({filteredClasses.length})</CardTitle>
            {filteredClasses.length > 0 && (
              <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                Select All Visible
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredClasses.length > 0 ? (
            <div className="space-y-2">
              {filteredClasses.map((cls) => (
                <div
                  key={cls.id}
                  className={`border rounded-lg p-4 transition-all ${
                    selectedClasses.includes(cls.id) 
                      ? 'ring-2 ring-primary bg-primary/5' 
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Checkbox */}
                    <Checkbox
                      checked={selectedClasses.includes(cls.id)}
                      onCheckedChange={() => toggleClassSelection(cls.id)}
                    />

                    {/* Class Info */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                      <div className="md:col-span-2">
                        <div className="font-medium">{cls.className}</div>
                        <div className="text-sm text-muted-foreground">
                          Order: {cls.runOrder}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{cls.element}</Badge>
                        {cls.level && <Badge variant="secondary">{cls.level}</Badge>}
                        {cls.section && <Badge variant="outline">{cls.section}</Badge>}
                      </div>
                      
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(cls.status)}`}>
                        {getStatusIcon(cls.status)}
                        {cls.status}
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        <div>Entries: {cls.entries.currentEntries}/{cls.entries.maxEntries}</div>
                        {(cls.entries.waitlistEntries || 0) > 0 && (
                          <div className="flex items-center gap-1 text-yellow-600">
                            <Users className="h-3 w-3" />
                            {cls.entries.waitlistEntries} waitlisted
                          </div>
                        )}
                        <div>Est: {String(cls.fieldValues.estimatedJudgingTime || 30)}min</div>
                      </div>
                      
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => startTransition(() => navigate('/secretary/waitlist'))}
                            >
                              <ListOrdered className="h-4 w-4 mr-2" />
                              View Waitlist
                            </DropdownMenuItem>
                            {statuses.map(status => (
                              <DropdownMenuItem
                                key={status}
                                onClick={() => handleStatusChange(cls.id, status)}
                              >
                                Set to {status}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem
                              onClick={() => handleDelete(cls.id)}
                              className="text-red-600"
                            >
                              Delete Class
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Classes Found</h3>
              <p className="text-muted-foreground mb-4">
                {allClasses.length === 0 
                  ? "No classes have been created for this trial yet."
                  : "No classes match your current filters."
                }
              </p>
              {allClasses.length === 0 ? (
                <Button onClick={() => startTransition(() => navigate(`/trials/${trialId}/classes/create`))}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Classes
                </Button>
              ) : (
                <Button variant="outline" onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('');
                  setElementFilter('');
                }}>
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};