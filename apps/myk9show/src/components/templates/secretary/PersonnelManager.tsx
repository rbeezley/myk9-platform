import React, { useState } from 'react';
import { CreatedClass } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
import { logger } from '@/services/LoggingService';
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Users,
  UserPlus,
  Clock,
  AlertTriangle,
  Edit,
  Trash2,
  Mail,
  Phone,
  Award,
  MapPin
} from 'lucide-react';

export interface Personnel {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: PersonnelRole[];
  certifications: string[];
  availability: TimeSlot[];
  preferences: PersonnelPreferences;
  notes?: string;
}

export interface PersonnelRole {
  type: 'judge' | 'gate-steward' | 'table-steward' | 'timer' | 'ring-steward';
  level: 'novice' | 'experienced' | 'expert';
  elements: string[]; // Which elements they can work
}

export interface TimeSlot {
  start: string; // HH:MM format
  end: string;   // HH:MM format
  date?: string; // Optional date restriction
}

export interface PersonnelPreferences {
  maxConsecutiveHours: number;
  minBreakBetween: number; // minutes
  preferredElements: string[];
  avoidElements: string[];
  canWorkWithJudges: string[]; // Judge IDs they can work with
}

export interface PersonnelAssignment {
  classId: string;
  className: string;
  role: string;
  personnelId: string;
  startTime: Date;
  endTime: Date;
  conflicts: string[];
}

interface PersonnelManagerProps {
  classes: CreatedClass[];
  personnel: Personnel[];
  assignments: PersonnelAssignment[];
  onPersonnelAdd: (personnel: Personnel) => void;
  onPersonnelUpdate: (id: string, updates: Partial<Personnel>) => void;
  onPersonnelDelete: (id: string) => void;
  onAssignmentChange: (classId: string, role: string, personnelId: string | null) => void;
}

export const PersonnelManager: React.FC<PersonnelManagerProps> = ({
  classes,
  personnel,
  assignments,
  onPersonnelAdd,
  onPersonnelUpdate,
  onPersonnelDelete,
  onAssignmentChange
}) => {
  const [activeTab, setActiveTab] = useState('assignments');
  const [addPersonnelOpen, setAddPersonnelOpen] = useState(false);
  const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null);

  // Group classes by time conflicts for assignment validation
  const detectConflicts = (
    classId: string, 
    role: string, 
    personnelId: string
  ): string[] => {
    const conflicts: string[] = [];
    const targetClass = classes.find(c => c.id === classId);
    if (!targetClass) return conflicts;

    const person = personnel.find(p => p.id === personnelId);
    if (!person) return conflicts;

    // Check if person has required role
    const hasRole = person.roles.some(r => {
      const roleMap = {
        'judgeId': 'judge',
        'gate': 'gate-steward',
        'table': 'table-steward',
        'timer': 'timer',
        'ring': 'ring-steward'
      };
      return r.type === roleMap[role as keyof typeof roleMap];
    });

    if (!hasRole) {
      conflicts.push(`${person.name} is not certified for ${role} role`);
    }

    // Check element compatibility
    if (role === 'judgeId' && person.roles.some(r => r.type === 'judge')) {
      const judgeRole = person.roles.find(r => r.type === 'judge')!;
      if (!judgeRole.elements.includes(targetClass.element)) {
        conflicts.push(`${person.name} is not certified to judge ${targetClass.element}`);
      }
    }

    // Check time conflicts with other assignments
    const conflictingAssignments = assignments.filter(a => 
      a.personnelId === personnelId && 
      a.classId !== classId &&
      a.startTime < new Date(targetClass.plannedStartTime || Date.now()) &&
      a.endTime > new Date(targetClass.plannedStartTime || Date.now())
    );

    conflictingAssignments.forEach(assignment => {
      conflicts.push(`Conflict with ${assignment.className} (${assignment.role})`);
    });

    return conflicts;
  };

  // Get available personnel for a specific role and class
  const getAvailablePersonnel = (classId: string, role: string): Personnel[] => {
    const roleMap = {
      'judgeId': 'judge',
      'gate': 'gate-steward',
      'table': 'table-steward',
      'timer': 'timer',
      'ring': 'ring-steward'
    };

    return personnel.filter(person => {
      // Check if person has the required role
      const hasRequiredRole = person.roles.some(r => 
        r.type === roleMap[role as keyof typeof roleMap]
      );
      
      if (!hasRequiredRole) return false;

      // Check conflicts
      const conflicts = detectConflicts(classId, role, person.id);
      return conflicts.length === 0;
    });
  };

  // Get assignment statistics
  const getAssignmentStats = () => {
    const totalRoles = classes.length * 4; // judge + 3 steward roles per class
    const assignedRoles = assignments.length;
    const conflictCount = assignments.reduce((count, a) => count + a.conflicts.length, 0);
    
    return {
      totalRoles,
      assignedRoles,
      unassignedRoles: totalRoles - assignedRoles,
      conflictCount,
      completionRate: Math.round((assignedRoles / totalRoles) * 100)
    };
  };

  const stats = getAssignmentStats();

  // Render personnel assignment form for a class
  const renderAssignmentForm = (cls: CreatedClass) => {
    const roles = [
      { key: 'judgeId', label: 'Judge', icon: Award },
      { key: 'gate', label: 'Gate Steward', icon: MapPin },
      { key: 'table', label: 'Table Steward', icon: Users },
      { key: 'timer', label: 'Timer', icon: Clock }
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{cls.className}</h3>
          <Badge variant="outline">
            {cls.element}{cls.level ? ` ${cls.level}` : ''}
          </Badge>
        </div>

        <div className="grid gap-4">
          {roles.map(role => {
            const available = getAvailablePersonnel(cls.id, role.key);
            const currentAssignment = assignments.find(a => 
              a.classId === cls.id && a.role === role.key
            );

            return (
              <div key={role.key} className="space-y-2">
                <Label className="flex items-center gap-2">
                  <role.icon className="h-4 w-4" />
                  {role.label}
                </Label>
                
                <Select
                  value={currentAssignment?.personnelId || ''}
                  onValueChange={(value) => 
                    onAssignmentChange(cls.id, role.key, value || null)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select personnel..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {available.map(person => (
                      <SelectItem key={person.id} value={person.id}>
                        <div className="flex items-center gap-2">
                          <span>{person.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {person.roles.find(r => r.type === role.key)?.level}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {currentAssignment?.conflicts && currentAssignment.conflicts.length > 0 && (
                  <div className="text-sm text-red-600">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    {currentAssignment.conflicts.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Personnel Management
            </div>
            <Badge variant={stats.conflictCount > 0 ? "destructive" : "default"}>
              {stats.completionRate}% complete
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{personnel.length}</div>
              <div className="text-sm text-muted-foreground">Personnel</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.assignedRoles}</div>
              <div className="text-sm text-muted-foreground">Assigned</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.unassignedRoles}</div>
              <div className="text-sm text-muted-foreground">Unassigned</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${stats.conflictCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.conflictCount}
              </div>
              <div className="text-sm text-muted-foreground">Conflicts</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="assignments">Assignments</TabsTrigger>
              <TabsTrigger value="personnel">Personnel</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
            </TabsList>

            {/* Assignments Tab */}
            <TabsContent value="assignments" className="space-y-4 mt-6">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Class Assignments</h3>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Auto-assign based on availability
                    logger.debug('Auto-assign functionality to be implemented', 'components', {});
                  }}
                >
                  Auto Assign Available
                </Button>
              </div>

              <div className="grid gap-4">
                {classes.map(cls => (
                  <Card key={cls.id}>
                    <CardContent className="pt-4">
                      {renderAssignmentForm(cls)}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Personnel Tab */}
            <TabsContent value="personnel" className="space-y-4 mt-6">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Personnel Directory</h3>
                <Dialog open={addPersonnelOpen} onOpenChange={setAddPersonnelOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Personnel
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add New Personnel</DialogTitle>
                    </DialogHeader>
                    <PersonnelForm
                      onSave={(person) => {
                        onPersonnelAdd(person);
                        setAddPersonnelOpen(false);
                      }}
                      onCancel={() => setAddPersonnelOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4">
                {personnel.map(person => (
                  <Card key={person.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <h4 className="font-medium">{person.name}</h4>
                          <div className="flex flex-wrap gap-1">
                            {person.roles.map((role, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {role.type} ({role.level})
                              </Badge>
                            ))}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            {person.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-3 w-3" />
                                {person.email}
                              </div>
                            )}
                            {person.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-3 w-3" />
                                {person.phone}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingPersonnel(person)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onPersonnelDelete(person.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Schedule Tab */}
            <TabsContent value="schedule" className="space-y-4 mt-6">
              <h3 className="font-medium">Personnel Schedule</h3>
              
              <div className="space-y-4">
                {personnel.map(person => {
                  const personAssignments = assignments.filter(a => a.personnelId === person.id);
                  
                  return (
                    <Card key={person.id}>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center justify-between">
                          {person.name}
                          <Badge variant="outline">
                            {personAssignments.length} assignment{personAssignments.length !== 1 ? 's' : ''}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {personAssignments.length > 0 ? (
                          <div className="space-y-2">
                            {personAssignments.map(assignment => (
                              <div key={`${assignment.classId}-${assignment.role}`} 
                                   className="flex items-center justify-between p-2 bg-muted rounded">
                                <div>
                                  <span className="font-medium">{assignment.className}</span>
                                  <span className="text-sm text-muted-foreground ml-2">
                                    as {assignment.role}
                                  </span>
                                </div>
                                <div className="text-sm font-mono">
                                  {assignment.startTime.toTimeString().slice(0, 5)} - 
                                  {assignment.endTime.toTimeString().slice(0, 5)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">No assignments</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit Personnel Dialog */}
      {editingPersonnel && (
        <Dialog open={true} onOpenChange={() => setEditingPersonnel(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Personnel</DialogTitle>
            </DialogHeader>
            <PersonnelForm
              personnel={editingPersonnel}
              onSave={(updates) => {
                onPersonnelUpdate(editingPersonnel.id, updates);
                setEditingPersonnel(null);
              }}
              onCancel={() => setEditingPersonnel(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// Personnel Form Component
interface PersonnelFormProps {
  personnel?: Personnel;
  onSave: (personnel: Personnel) => void;
  onCancel: () => void;
}

const PersonnelForm: React.FC<PersonnelFormProps> = ({ personnel, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<Personnel>>(
    personnel || {
      name: '',
      email: '',
      phone: '',
      roles: [],
      certifications: [],
      availability: [],
      preferences: {
        maxConsecutiveHours: 4,
        minBreakBetween: 15,
        preferredElements: [],
        avoidElements: [],
        canWorkWithJudges: []
      }
    }
  );

  const handleSave = () => {
    if (!formData.name) return;
    
    const completePersonnel: Personnel = {
      id: personnel?.id || `person-${Date.now()}`,
      name: formData.name!,
      email: formData.email || '',
      phone: formData.phone || '',
      roles: formData.roles || [],
      certifications: formData.certifications || [],
      availability: formData.availability || [],
      preferences: formData.preferences!,
      notes: formData.notes
    };

    onSave(completePersonnel);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Full name"
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={formData.email || ''}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="email@example.com"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Phone</Label>
        <Input
          value={formData.phone || ''}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="(555) 123-4567"
        />
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes about this person..."
          rows={3}
        />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!formData.name}>
          Save Personnel
        </Button>
      </div>
    </div>
  );
};