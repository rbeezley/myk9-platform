import React, { useState } from 'react';
import { ClassTemplate, ClassDefinition } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Search,
  CheckSquare2,
  Square,
  CheckSquare,
  Filter,
  Grid3X3,
  List,
  Eye,
  Settings,
  Clock,
  Users,
  DollarSign
} from 'lucide-react';

interface ClassSelectionGridProps {
  template: ClassTemplate;
  selectedClasses: ClassDefinition[];
  onSelectionChange: (classes: ClassDefinition[]) => void;
  onPreviewClass?: (classDefinition: ClassDefinition) => void;
}

export const ClassSelectionGrid: React.FC<ClassSelectionGridProps> = ({
  template,
  selectedClasses,
  onSelectionChange,
  onPreviewClass
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterElement, setFilterElement] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const classes = template.classDefinitions || [];
  
  // Get unique elements and levels for filtering
  const elements = Array.from(new Set(classes.map(c => c.element))).sort();
  const levels = Array.from(new Set(classes.map(c => c.level).filter(Boolean))).sort();

  // Filter classes based on search and filters
  const filteredClasses = classes.filter(cls => {
    const matchesSearch = !searchTerm || 
      cls.className.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.element.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.level?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesElement = !filterElement || cls.element === filterElement;
    const matchesLevel = !filterLevel || cls.level === filterLevel;
    
    return matchesSearch && matchesElement && matchesLevel;
  });

  // Check if a class is selected
  const isClassSelected = (classDefinition: ClassDefinition) => {
    return selectedClasses.some(selected => 
      selected.className === classDefinition.className &&
      selected.element === classDefinition.element &&
      selected.level === classDefinition.level &&
      selected.section === classDefinition.section
    );
  };

  // Toggle class selection
  const toggleClassSelection = (classDefinition: ClassDefinition) => {
    if (isClassSelected(classDefinition)) {
      // Remove from selection
      const updated = selectedClasses.filter(selected => 
        !(selected.className === classDefinition.className &&
          selected.element === classDefinition.element &&
          selected.level === classDefinition.level &&
          selected.section === classDefinition.section)
      );
      onSelectionChange(updated);
    } else {
      // Add to selection
      onSelectionChange([...selectedClasses, classDefinition]);
    }
  };

  // Select all filtered classes
  const selectAllFiltered = () => {
    const newSelections = filteredClasses.filter(cls => !isClassSelected(cls));
    onSelectionChange([...selectedClasses, ...newSelections]);
  };

  // Deselect all filtered classes
  const deselectAllFiltered = () => {
    const updated = selectedClasses.filter(selected => 
      !filteredClasses.some(filtered => 
        filtered.className === selected.className &&
        filtered.element === selected.element &&
        filtered.level === selected.level &&
        filtered.section === selected.section
      )
    );
    onSelectionChange(updated);
  };

  // Clear all selections
  const clearAllSelections = () => {
    onSelectionChange([]);
  };

  // Select all classes in template
  const selectAllClasses = () => {
    onSelectionChange([...classes]);
  };

  const allFilteredSelected = filteredClasses.length > 0 && filteredClasses.every(cls => isClassSelected(cls));

  return (
    <div className="space-y-6">
      {/* Header with Template Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-5 w-5" />
              Select Classes for {template.templateName}
            </div>
            <Badge variant="outline">
              {selectedClasses.length} of {classes.length} selected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-blue-500" />
              <span>{template.organization} • {template.showType}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              <span>{template.defaults?.judgingTimeEstimate || 'N/A'} min per class</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-500" />
              <span>${template.defaults?.entryFees?.preEntry} entry fee</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-500" />
              <span>Min {template.defaults?.minimumAge || 6} months</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search classes by name, element, or level..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filters and Controls Row */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Element Filter */}
              <div className="flex items-center gap-2">
                <Label className="text-sm">Element:</Label>
                <select
                  value={filterElement}
                  onChange={(e) => setFilterElement(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="">All Elements</option>
                  {elements.map(element => (
                    <option key={element} value={element}>{element}</option>
                  ))}
                </select>
              </div>

              {/* Level Filter */}
              <div className="flex items-center gap-2">
                <Label className="text-sm">Level:</Label>
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="">All Levels</option>
                  {levels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Bulk Selection Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
                  disabled={filteredClasses.length === 0}
                >
                  {allFilteredSelected ? (
                    <>
                      <Square className="h-4 w-4 mr-1" />
                      Deselect Visible
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-1" />
                      Select Visible
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectedClasses.length === classes.length ? clearAllSelections : selectAllClasses}
                >
                  {selectedClasses.length === classes.length ? (
                    <>
                      <Square className="h-4 w-4 mr-1" />
                      Clear All
                    </>
                  ) : (
                    <>
                      <CheckSquare2 className="h-4 w-4 mr-1" />
                      Select All
                    </>
                  )}
                </Button>
              </div>

              {/* Results Count */}
              <div className="text-sm text-muted-foreground ml-auto">
                Showing {filteredClasses.length} of {classes.length} classes
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Class Grid/List */}
      <Card className="min-h-[400px]">
        <CardContent className="pt-6">
          {filteredClasses.length > 0 ? (
            <div className={
              viewMode === 'grid' 
                ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4"
                : "space-y-2"
            }>
              {filteredClasses.map((classDefinition, index) => {
                const isSelected = isClassSelected(classDefinition);
                
                return viewMode === 'grid' ? (
                  // Grid View
                  <div
                    key={index}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      isSelected 
                        ? 'ring-2 ring-primary bg-primary/5 border-primary' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleClassSelection(classDefinition)}
                  >
                    <div className="space-y-3">
                      {/* Header with Checkbox */}
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => {}} // Handled by parent click
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm leading-tight">
                            {classDefinition.className}
                          </h4>
                        </div>
                        {onPreviewClass && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreviewClass(classDefinition);
                            }}
                            className="p-1 h-6 w-6"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">
                          {classDefinition.element}
                        </Badge>
                        {classDefinition.level && (
                          <Badge variant="secondary" className="text-xs">
                            {classDefinition.level}
                          </Badge>
                        )}
                        {classDefinition.section && (
                          <Badge variant="outline" className="text-xs">
                            {classDefinition.section}
                          </Badge>
                        )}
                      </div>

                      {/* Additional Info */}
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Order: {classDefinition.displayOrder}</div>
                        {classDefinition.fieldOverrides && Object.keys(classDefinition.fieldOverrides).length > 0 && (
                          <div>{Object.keys(classDefinition.fieldOverrides).length} overrides</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  // List View
                  <div
                    key={index}
                    className={`border rounded-lg p-3 cursor-pointer transition-all ${
                      isSelected 
                        ? 'ring-2 ring-primary bg-primary/5 border-primary' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleClassSelection(classDefinition)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => {}} // Handled by parent click
                      />
                      
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                        <div className="md:col-span-2">
                          <span className="font-medium text-sm">{classDefinition.className}</span>
                        </div>
                        <div>
                          <Badge variant="outline" className="text-xs">
                            {classDefinition.element}
                          </Badge>
                        </div>
                        <div>
                          {classDefinition.level && (
                            <Badge variant="secondary" className="text-xs">
                              {classDefinition.level}
                            </Badge>
                          )}
                        </div>
                        <div>
                          {classDefinition.section && (
                            <Badge variant="outline" className="text-xs">
                              {classDefinition.section}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Order: {classDefinition.displayOrder}
                        </div>
                      </div>

                      {onPreviewClass && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPreviewClass(classDefinition);
                          }}
                          className="p-2"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // No Results
            <div className="flex flex-col items-center justify-center py-12">
              <Filter className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Classes Found</h3>
              <p className="text-muted-foreground text-center">
                {searchTerm || filterElement || filterLevel 
                  ? "No classes match your current search and filter criteria."
                  : "This template doesn't have any classes defined."
                }
              </p>
              {(searchTerm || filterElement || filterLevel) && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterElement('');
                    setFilterLevel('');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selection Summary */}
      {selectedClasses.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium">
                  {selectedClasses.length} class{selectedClasses.length !== 1 ? 'es' : ''} selected
                </span>
                <div className="text-sm text-muted-foreground">
                  Estimated judging time: {(selectedClasses.length * (template.defaults?.judgingTimeEstimate || 15))} minutes
                </div>
              </div>
              <Button variant="outline" onClick={clearAllSelections}>
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};