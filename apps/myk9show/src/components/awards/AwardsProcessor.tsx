import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { logger } from '@/services/LoggingService';
import {
  Trophy, 
  Award, 
  Star, 
  Medal,
  Crown,
  Target,
  CheckCircle2,
  Clock,
  Calculator
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AwardResult {
  id: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  awardType: 'High_In_Trial' | 'High_Combined' | 'Class_Winner' | 'Qualifying_Score' | 'New_Title';
  awardName: string;
  points: number;
  score?: number;
  time?: number;
  className: string;
  trialName: string;
  qualified: boolean;
  placement: number;
}

interface ProcessingStats {
  totalClasses: number;
  processedClasses: number;
  totalAwards: number;
  highInTrial?: AwardResult;
  newTitles: number;
  qualifyingScores: number;
}

interface AwardsProcessorProps {
  trialId: string;
  trialName: string;
  onProcessingComplete: (awards: AwardResult[]) => void;
  onClose: () => void;
}

export function AwardsProcessor({
  trialId: _trialId,
  trialName,
  onProcessingComplete,
  onClose
}: AwardsProcessorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ProcessingStats>({
    totalClasses: 0,
    processedClasses: 0,
    totalAwards: 0,
    newTitles: 0,
    qualifyingScores: 0
  });
  const [awards, setAwards] = useState<AwardResult[]>([]);
  const [completed, setCompleted] = useState(false);

  const processAwards = async () => {
    setIsProcessing(true);
    setProgress(0);
    
    try {
      // Step 1: Calculate class placements
      setProcessingStep('Calculating class placements...');
      await simulateProcessing(500);
      setProgress(20);
      
      // Step 2: Determine qualifying scores
      setProcessingStep('Determining qualifying scores...');
      await simulateProcessing(700);
      setProgress(40);
      
      // Step 3: Calculate trial awards
      setProcessingStep('Calculating trial awards...');
      await simulateProcessing(800);
      setProgress(60);
      
      // Step 4: Process title achievements
      setProcessingStep('Processing title achievements...');
      await simulateProcessing(600);
      setProgress(80);
      
      // Step 5: Generate award certificates
      setProcessingStep('Generating award certificates...');
      await simulateProcessing(400);
      setProgress(100);
      
      // Generate mock awards data
      const mockAwards: AwardResult[] = [
        {
          id: 'hit-1',
          dogId: 'dog-1',
          dogName: 'Champion Rex',
          ownerName: 'John Smith',
          awardType: 'High_In_Trial',
          awardName: 'High In Trial',
          points: 200,
          score: 100,
          time: 28.45,
          className: 'Open A',
          trialName: trialName,
          qualified: true,
          placement: 1
        },
        {
          id: 'winner-1',
          dogId: 'dog-2',
          dogName: 'Lady Belle',
          ownerName: 'Mary Johnson',
          awardType: 'Class_Winner',
          awardName: 'First Place - Novice A',
          points: 15,
          score: 95,
          time: 32.18,
          className: 'Novice A',
          trialName: trialName,
          qualified: true,
          placement: 1
        },
        {
          id: 'title-1',
          dogId: 'dog-3',
          dogName: 'Duke Thunder',
          ownerName: 'Robert Wilson',
          awardType: 'New_Title',
          awardName: 'Novice Agility (NA)',
          points: 10,
          score: 88,
          time: 35.67,
          className: 'Novice A',
          trialName: trialName,
          qualified: true,
          placement: 2
        },
        {
          id: 'qual-1',
          dogId: 'dog-4',
          dogName: 'Princess Luna',
          ownerName: 'Sarah Davis',
          awardType: 'Qualifying_Score',
          awardName: 'Qualifying Score',
          points: 5,
          score: 92,
          time: 31.89,
          className: 'Open A',
          trialName: trialName,
          qualified: true,
          placement: 2
        }
      ];
      
      setAwards(mockAwards);
      setStats({
        totalClasses: 6,
        processedClasses: 6,
        totalAwards: mockAwards.length,
        highInTrial: mockAwards.find(a => a.awardType === 'High_In_Trial'),
        newTitles: mockAwards.filter(a => a.awardType === 'New_Title').length,
        qualifyingScores: mockAwards.filter(a => a.awardType === 'Qualifying_Score').length
      });
      
      setCompleted(true);
      setProcessingStep('Awards processing complete!');
      
    } catch (error) {
      logger.error('Awards processing error:', 'components', {}, error as Error);
      setProcessingStep('Error processing awards');
    } finally {
      setIsProcessing(false);
    }
  };

  const simulateProcessing = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  const getAwardIcon = (awardType: string) => {
    switch (awardType) {
      case 'High_In_Trial': return Crown;
      case 'High_Combined': return Trophy;
      case 'Class_Winner': return Medal;
      case 'New_Title': return Star;
      case 'Qualifying_Score': return Target;
      default: return Award;
    }
  };

  const getAwardColor = (awardType: string) => {
    switch (awardType) {
      case 'High_In_Trial': return 'text-yellow-600';
      case 'High_Combined': return 'text-blue-600';
      case 'Class_Winner': return 'text-green-600';
      case 'New_Title': return 'text-purple-600';
      case 'Qualifying_Score': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  if (completed && awards.length > 0) {
    return (
      <motion.div 
        className="space-y-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Success Header */}
        <Card className="border-green-200 bg-green-50 dark:bg-green-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
              <CheckCircle2 className="h-6 w-6" />
              Awards Processing Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.totalAwards}</div>
                <div className="text-sm text-muted-foreground">Total Awards</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.newTitles}</div>
                <div className="text-sm text-muted-foreground">New Titles</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.qualifyingScores}</div>
                <div className="text-sm text-muted-foreground">Qualifying Scores</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.processedClasses}</div>
                <div className="text-sm text-muted-foreground">Classes Processed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* High in Trial Spotlight */}
        {stats.highInTrial && (
          <Card className="border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950 dark:to-amber-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                <Crown className="h-6 w-6" />
                High In Trial Winner
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{stats.highInTrial.dogName}</h3>
                  <p className="text-muted-foreground">Owner: {stats.highInTrial.ownerName}</p>
                  <p className="text-sm text-muted-foreground">{stats.highInTrial.className}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-yellow-600">
                    {stats.highInTrial.score}/100
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {stats.highInTrial.time}s
                  </div>
                  <Badge variant="secondary" className="mt-1">
                    {stats.highInTrial.points} Points
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Awards List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              All Awards ({awards.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {awards.map((award) => {
                const IconComponent = getAwardIcon(award.awardType);
                const iconColor = getAwardColor(award.awardType);
                
                return (
                  <div 
                    key={award.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-full bg-muted", iconColor)}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-medium">{award.awardName}</h4>
                        <p className="text-sm text-muted-foreground">
                          {award.dogName} • {award.ownerName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {award.className} • {award.score ? `${award.score}/100` : ''} 
                          {award.time ? ` • ${award.time}s` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="mb-1">
                        {award.points} Points
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        {award.placement === 1 ? '1st Place' : 
                         award.placement === 2 ? '2nd Place' : 
                         award.placement === 3 ? '3rd Place' : 
                         `${award.placement}th Place`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button 
            onClick={() => onProcessingComplete(awards)}
            className="flex-1"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Finalize Awards
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-6 w-6" />
            Awards Processing - {trialName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Process trial awards, calculate placements, and determine title achievements.
          </p>
        </CardContent>
      </Card>

      {/* Processing Status */}
      {isProcessing && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">{processingStep}</span>
              </div>
              <Progress value={progress} className="w-full" />
              <div className="text-xs text-muted-foreground text-center">
                {progress}% Complete
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Processing Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-3">Awards to Process</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm">High In Trial</span>
                </div>
                <div className="flex items-center gap-2">
                  <Medal className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Class Winners</span>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">New Titles</span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-orange-600" />
                  <span className="text-sm">Qualifying Scores</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-3">Processing Steps</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>1. Calculate class placements</div>
                <div>2. Determine qualifying scores</div>
                <div>3. Calculate trial awards</div>
                <div>4. Process title achievements</div>
                <div>5. Generate certificates</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button 
          onClick={processAwards}
          disabled={isProcessing}
          className="flex-1"
        >
          {isProcessing ? (
            <>
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Calculator className="h-4 w-4 mr-2" />
              Process Awards
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={isProcessing}>
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}