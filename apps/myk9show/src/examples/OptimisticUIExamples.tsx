import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Edit, 
  Upload, 
  Settings,
  Loader2
} from 'lucide-react';

import { 
  OptimisticProvider,
  useOptimisticEntries
  // useOptimisticDogs, // Currently unused
  // OptimisticUpdateIndicator, // Currently unused
  // SuccessConfirmation, // Currently unused
  // RollbackNotification, // Currently unused
  // ProgressOverlay, // Currently unused
  // UndoToast // Currently unused
} from '@/components/optimistic';

import { OptimisticForm } from '@/components/forms/OptimisticForm';
// import { OptimisticAddDogDialog } from '@/components/dogs/OptimisticAddDogDialog'; // Currently unused
import { OptimisticScoreEntry } from '@/components/scoring/OptimisticScoreEntry';
// // import { optimisticFormSubmit, createOptimisticEntry } from '@/utils/optimisticHelpers'; // Currently unused

// Example 1: Simple Entry Creation
const EntryCreationExample: React.FC = () => {
  // const [showDialog, setShowDialog] = useState(false);
  const [entryName, setEntryName] = useState('');

  const { optimisticCreate, isProcessing } = useOptimisticEntries({
    onSuccess: (operationId, result) => {
      console.log('Entry created successfully:', result);
      setEntryName('');
    }
  });

  const handleCreateEntry = async () => {
    if (!entryName.trim()) return;

    try {
      await optimisticCreate(
        `entry_${Date.now()}`,
        { name: entryName, status: 'pending' },
        async () => {
          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 2000));
          return { id: `entry_${Date.now()}`, name: entryName, status: 'confirmed' };
        }
      );
    } catch (error) {
      console.error('Failed to create entry:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Entry Creation with Optimistic UI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={entryName}
            onChange={(e) => setEntryName(e.target.value)}
            placeholder="Enter entry name"
            disabled={isProcessing}
          />
          <Button
            onClick={handleCreateEntry}
            disabled={!entryName.trim() || isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Entry will appear immediately, then sync in the background
        </p>
      </CardContent>
    </Card>
  );
};

// Example 2: Form with Auto-save
const AutoSaveFormExample: React.FC = () => {
  const [dogData] = useState({
    name: 'Buddy',
    breed: 'Golden Retriever',
    age: 3
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit className="w-5 h-5" />
          Auto-Save Form
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OptimisticForm
          entityType="dog"
          entityId="dog_123"
          initialData={dogData}
          onSave={async (data) => {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1500));
            return data;
          }}
          autoSave={true}
          autoSaveDelay={2000}
        >
          {({ data, updateField, isDirty, isProcessing }) => (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Dog Name</label>
                <Input
                  value={data.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Breed</label>
                <Input
                  value={data.breed}
                  onChange={(e) => updateField('breed', e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Age</label>
                <Input
                  type="number"
                  value={data.age}
                  onChange={(e) => updateField('age', parseInt(e.target.value))}
                  disabled={isProcessing}
                />
              </div>
              {isDirty && (
                <Badge variant="secondary">Changes will be saved automatically</Badge>
              )}
            </div>
          )}
        </OptimisticForm>
      </CardContent>
    </Card>
  );
};

// Example 3: Bulk Operations
const BulkOperationsExample: React.FC = () => {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const mockItems = [
    { id: '1', name: 'Entry 1', status: 'pending' },
    { id: '2', name: 'Entry 2', status: 'approved' },
    { id: '3', name: 'Entry 3', status: 'pending' },
  ];

  const handleBulkApprove = async () => {
    setIsProcessing(true);
    
    try {
      // Simulate bulk operation
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('Bulk approved:', selectedItems);
      setSelectedItems([]);
    } catch (error) {
      console.error('Bulk operation failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedItems(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Bulk Operations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {mockItems.map(item => (
            <div key={item.id} className="flex items-center gap-2 p-2 border rounded">
              <input
                type="checkbox"
                checked={selectedItems.includes(item.id)}
                onChange={() => toggleSelection(item.id)}
                disabled={isProcessing}
              />
              <span className="flex-1">{item.name}</span>
              <Badge variant={item.status === 'approved' ? 'default' : 'secondary'}>
                {item.status}
              </Badge>
            </div>
          ))}
        </div>
        
        <Button
          onClick={handleBulkApprove}
          disabled={selectedItems.length === 0 || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing {selectedItems.length} items...
            </>
          ) : (
            <>
              Approve Selected ({selectedItems.length})
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

// Example 4: File Upload with Progress
const FileUploadExample: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      // Simulate file upload with progress
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setProgress(i);
      }
      
      console.log('File uploaded successfully');
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          File Upload with Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          type="file"
          onChange={handleFileUpload}
          disabled={uploading}
          className="w-full"
        />
        
        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Uploading...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Example 5: Score Entry (Specialized Component)
const ScoreEntryExample: React.FC = () => {
  const mockEntry = {
    id: 'entry_123',
    dogName: 'Max',
    entryNumber: '42',
    currentScore: 85
  };

  const handleScoreUpdate = async (score: number) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate occasional failure
    if (Math.random() < 0.1) {
      throw new Error('Score update failed');
    }
    
    return { score, updatedAt: new Date() };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit className="w-5 h-5" />
          Real-time Score Entry
        </CardTitle>
      </CardHeader>
      <CardContent>
        <OptimisticScoreEntry
          entryId={mockEntry.id}
          dogName={mockEntry.dogName}
          entryNumber={mockEntry.entryNumber}
          currentScore={mockEntry.currentScore}
          maxScore={100}
          onScoreUpdate={handleScoreUpdate}
        />
      </CardContent>
    </Card>
  );
};

// Main Examples Component
export const OptimisticUIExamples: React.FC = () => {
  return (
    <OptimisticProvider
      config={{
        defaultRetries: 3,
        enableUndo: true,
        showProgressIndicators: true
      }}
      showGlobalIndicator={true}
      showProgressOverlay={true}
    >
      <div className="container mx-auto p-6 space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Optimistic UI Examples</h1>
          <p className="text-muted-foreground">
            These examples demonstrate various optimistic UI patterns with rollback capabilities.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <EntryCreationExample />
          <AutoSaveFormExample />
          <BulkOperationsExample />
          <FileUploadExample />
        </div>

        <Separator />

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Specialized Components</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <ScoreEntryExample />
          </div>
        </div>

        {/* Global indicators will be rendered by the OptimisticProvider */}
      </div>
    </OptimisticProvider>
  );
};

export default OptimisticUIExamples;