import React from 'react';
import { Button } from '@/components/ui/button';
import { JUDGE_ORGANIZATIONS } from '@/features/judges/judgeOrganizations';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, Award } from 'lucide-react';
import type { JudgeQualification } from '@/types/user-types';
import { cn } from '@/lib/utils';

// Organization-specific disciplines sourced from official org websites:
// AKC: akc.org/sports/ and akc.org/sports/titles-and-abbreviations/titles-by-sport/
// UKC: ukcdogs.com/all-breed-sports
// NACSW: nacsw.net/understanding-nw1-nw2-nw3-levels-competition
// CPE: cpe.dog (2026 Agility Rulebook)
const SHOW_TYPE_GROUPS_BY_ORG: Record<string, Record<string, string[]>> = {
  AKC: {
    'Companion Events': ['Agility', 'Obedience', 'Rally', 'Tracking'],
    'Scent Sports': ['Scent Work', 'Barn Hunt'],
    Conformation: ['Conformation'],
    'Field Events': ['Field Trials', 'Hunt Tests', 'Herding', 'Earthdog', 'Lure Coursing'],
    'Other AKC Events': ['Fast CAT', 'Dock Diving', 'Flyball'],
  },
  UKC: {
    'Companion Events': ['Agility', 'Obedience', 'Rally Obedience'],
    'Nose & Scent': ['Nosework'],
    Conformation: ['Conformation'],
    'Hunting & Field': [
      'Coonhound Events',
      'Cur/Feist Events',
      'Pointing Dog',
      'Hunting Retriever',
    ],
    'Other UKC Events': [
      'Dock Jumping',
      'Lure Coursing',
      'Precision Coursing',
      'Weight Pull',
      'Drag Racing',
    ],
  },
  NACSW: {
    'Trial Levels': ['NW1', 'NW2', 'NW3'],
    Advanced: ['Elite Division', 'Summit League', 'Element Specialty'],
  },
  CPE: {
    'Agility Games': [
      'Standard',
      'Jumpers',
      'Colors',
      'Wildcard',
      'Snooker',
      'Jackpot',
      'Full House',
    ],
    'Other CPE Sports': ['Canine Scent Sport', 'SpeedWay'],
  },
  OTHER: {
    General: ['Agility', 'Obedience', 'Rally', 'Conformation', 'Scent Work', 'Other'],
  },
};

function getShowTypeGroups(org: string): Record<string, string[]> {
  return SHOW_TYPE_GROUPS_BY_ORG[org] || SHOW_TYPE_GROUPS_BY_ORG.OTHER;
}

// Individual qualification card component
interface QualificationCardProps {
  qualification: JudgeQualification;
  index: number;
  onUpdate: (index: number, updates: Partial<JudgeQualification>) => void;
  onRemove: (index: number) => void;
  onToggleShowType: (qualIndex: number, showType: string) => void;
}

export const QualificationCard: React.FC<QualificationCardProps> = ({
  qualification,
  index,
  onUpdate,
  onRemove,
  onToggleShowType,
}) => {
  return (
    <div className="border-0 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 backdrop-blur-sm">
      {/* Card Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <h4 className="font-medium text-foreground">Qualification {index + 1}</h4>
          </div>
          <Badge
            variant={
              qualification.status === 'Active'
                ? 'default'
                : qualification.status === 'Suspended'
                  ? 'destructive'
                  : 'secondary'
            }
            className="text-xs"
          >
            {qualification.status}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Card Content */}
      <div className="p-4 space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor={`judgeNumber-${index}`}
              style={{
                color: 'rgba(148, 163, 184, 0.8)',
                fontSize: '12px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Judge Number *
            </Label>
            <Input
              id={`judgeNumber-${index}`}
              value={qualification.judgeNumber}
              onChange={e => onUpdate(index, { judgeNumber: e.target.value })}
              placeholder="12345"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={`organization-${index}`}
              style={{
                color: 'rgba(148, 163, 184, 0.8)',
                fontSize: '12px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Organization *
            </Label>
            <Select
              value={qualification.organization}
              onValueChange={value =>
                onUpdate(index, {
                  organization: value as JudgeQualification['organization'],
                  showTypes: [],
                  disciplines: [],
                })
              }
            >
              <SelectTrigger className="h-9 border-0 bg-input rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JUDGE_ORGANIZATIONS.map(org => (
                  <SelectItem key={org.value} value={org.value}>
                    {org.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label
              htmlFor={`status-${index}`}
              style={{
                color: 'rgba(148, 163, 184, 0.8)',
                fontSize: '12px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Status *
            </Label>
            <Select
              value={qualification.status}
              onValueChange={value =>
                onUpdate(index, {
                  status: value as JudgeQualification['status'],
                })
              }
            >
              <SelectTrigger className="h-9 border-0 bg-input rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={`certificationDate-${index}`}
              style={{
                color: 'rgba(148, 163, 184, 0.8)',
                fontSize: '12px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Certification Date
            </Label>
            <Input
              id={`certificationDate-${index}`}
              type="date"
              value={qualification.certificationDate}
              onChange={e => onUpdate(index, { certificationDate: e.target.value })}
              className="h-9"
            />
          </div>
        </div>

        {/* Show Types Selection */}
        <div className="space-y-3">
          <Label
            style={{
              color: 'rgba(148, 163, 184, 0.8)',
              fontSize: '12px',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Qualified Show Types
          </Label>
          <div className="border-0 rounded-xl p-4 bg-input">
            {Object.entries(getShowTypeGroups(qualification.organization)).map(
              ([groupName, types]) => (
                <div key={groupName} className="mb-4 last:mb-0">
                  <h5 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    {groupName}
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {types.map(showType => {
                      const isSelected = qualification.showTypes.includes(showType);
                      return (
                        <button
                          key={showType}
                          type="button"
                          onClick={() => onToggleShowType(index, showType)}
                          className={cn(
                            'px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 hover:scale-105',
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'bg-background hover:bg-muted border-border text-foreground hover:border-border-hover'
                          )}
                        >
                          {isSelected && <span className="mr-1">✓</span>}
                          {showType}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Selected count */}
          {qualification.showTypes.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {qualification.showTypes.length} show type
              {qualification.showTypes.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
