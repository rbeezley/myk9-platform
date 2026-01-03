import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { JudgeScoringInterface, type CompetitorScore } from '@/components/judges/JudgeScoringInterface';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Gavel, 
  Trophy, 
  Users, 
  Clock,
  Star,
  Smartphone,
  Tablet,
  Monitor
} from 'lucide-react';

// Mock data for judge scoring
const mockCompetitors = [
  { id: '1', dogName: 'Champion Rex', ownerName: 'John Smith', breed: 'German Shepherd', armband: '42' },
  { id: '2', dogName: 'Lady Belle', ownerName: 'Mary Johnson', breed: 'Golden Retriever', armband: '18' },
  { id: '3', dogName: 'Duke Thunder', ownerName: 'Robert Wilson', breed: 'Rottweiler', armband: '33' },
  { id: '4', dogName: 'Princess Luna', ownerName: 'Sarah Davis', breed: 'Border Collie', armband: '27' },
  { id: '5', dogName: 'Storm Walker', ownerName: 'Mike Brown', breed: 'Australian Shepherd', armband: '15' },
  { id: '6', dogName: 'Golden Arrow', ownerName: 'Lisa Martinez', breed: 'Labrador Retriever', armband: '09' }
];

const mockScoringCriteria = [
  { id: 'gait', name: 'Gait', maxPoints: 25, description: 'Movement and coordination' },
  { id: 'structure', name: 'Structure', maxPoints: 25, description: 'Physical conformation' },
  { id: 'presentation', name: 'Presentation', maxPoints: 25, description: 'Ring presence and handling' },
  { id: 'overall', name: 'Overall Impression', maxPoints: 25, description: 'General quality and breed type' }
];

export default function JudgeScoringPage() {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [showInterface, setShowInterface] = useState(false);

  const mockClasses = [
    { id: 'open-male', name: 'Open Adult Male', entries: 6, status: 'ready' },
    { id: 'open-female', name: 'Open Adult Female', entries: 8, status: 'pending' },
    { id: 'puppy-male', name: 'Puppy Male (6-12 months)', entries: 4, status: 'pending' },
    { id: 'puppy-female', name: 'Puppy Female (6-12 months)', entries: 5, status: 'pending' },
    { id: 'veteran', name: 'Veteran (7+ years)', entries: 3, status: 'pending' }
  ];

  const handleStartJudging = (classId: string) => {
    setSelectedClass(classId);
    setShowInterface(true);
  };

  const handleSaveScores = (scores: CompetitorScore[]) => {
    console.log('Scores saved:', scores);
    // In real app, this would save to backend
  };

  const handleSubmitResults = (scores: CompetitorScore[]) => {
    console.log('Results submitted:', scores);
    setShowInterface(false);
    setSelectedClass(null);
    // In real app, this would submit final results
  };

  if (showInterface && selectedClass) {
    return (
      <div className="min-h-screen bg-background">
        <JudgeScoringInterface
          competitors={mockCompetitors}
          scoringCriteria={mockScoringCriteria}
          onSaveScores={handleSaveScores}
          onSubmitResults={handleSubmitResults}
        />
      </div>
    );
  }

  return (
    <motion.div 
      className="min-h-screen pt-20 pb-8 px-4 sm:px-6 lg:px-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
            <Gavel className="h-8 w-8 text-blue-600" />
            Judge Scoring Interface
          </h1>
          <p className="text-muted-foreground mt-2">
            Mobile-optimized scoring system for ringside judging
          </p>
        </div>

        {/* Device Compatibility Notice */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-6 text-center">
              <div className="flex flex-col items-center">
                <Smartphone className="h-8 w-8 text-green-600 mb-2" />
                <p className="text-sm font-medium">Mobile Optimized</p>
              </div>
              <div className="flex flex-col items-center">
                <Tablet className="h-8 w-8 text-green-600 mb-2" />
                <p className="text-sm font-medium">Tablet Ready</p>
              </div>
              <div className="flex flex-col items-center">
                <Monitor className="h-8 w-8 text-blue-600 mb-2" />
                <p className="text-sm font-medium">Desktop Compatible</p>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Touch-friendly interface designed for quick scoring at ringside
            </p>
          </CardContent>
        </Card>

        {/* Class Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Select Class to Judge
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockClasses.map(classItem => (
                <Card key={classItem.id} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">{classItem.name}</h3>
                        <div className="flex items-center gap-2 mt-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {classItem.entries} entries
                          </span>
                        </div>
                      </div>
                      <Badge variant={
                        classItem.status === 'ready' ? 'default' :
                        classItem.status === 'judging' ? 'secondary' :
                        'outline'
                      }>
                        {classItem.status}
                      </Badge>
                    </div>
                    
                    <Button 
                      className="w-full"
                      onClick={() => handleStartJudging(classItem.id)}
                      disabled={classItem.status !== 'ready'}
                    >
                      {classItem.status === 'ready' ? 'Start Judging' : 'Not Ready'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Scoring Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6 text-center">
              <Star className="h-8 w-8 mx-auto mb-3 text-amber-500" />
              <h3 className="font-semibold mb-2">Point-Based Scoring</h3>
              <p className="text-sm text-muted-foreground">
                Flexible scoring system with customizable criteria and point allocations
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6 text-center">
              <Clock className="h-8 w-8 mx-auto mb-3 text-blue-500" />
              <h3 className="font-semibold mb-2">Real-Time Timer</h3>
              <p className="text-sm text-muted-foreground">
                Built-in timer to track judging time and maintain consistent pacing
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6 text-center">
              <Trophy className="h-8 w-8 mx-auto mb-3 text-green-500" />
              <h3 className="font-semibold mb-2">Instant Results</h3>
              <p className="text-sm text-muted-foreground">
                Automatic placement calculation and immediate results generation
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How to Use</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3">Scoring Process</h4>
                <ol className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">1</span>
                    Select a class from the list above
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">2</span>
                    Use the competitor grid to navigate between dogs
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">3</span>
                    Score each criteria using the point buttons
                  </li>
                  <li className="flex gap-2">
                    <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">4</span>
                    Complete each dog and view final results
                  </li>
                </ol>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">Mobile Tips</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <span className="text-green-600">•</span>
                    Use landscape mode for better visibility
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600">•</span>
                    Tap scoring buttons for quick point entry
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600">•</span>
                    Swipe between competitors if supported
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600">•</span>
                    Use timer to maintain consistent pacing
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}