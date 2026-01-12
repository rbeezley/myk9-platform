import React, { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { PrintableReport, type ReportData } from './PrintableReport';
import { 
import { logger } from '@/services/LoggingService';
  Printer, 
  Download, 
  Eye, 
  FileText, 
  Settings,
  Share2,
  Mail,
  Trophy,
  Heart,
  BookOpen
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: 'show_results' | 'health_records' | 'training_summary' | 'registration_form';
  icon: React.ComponentType<{ className?: string }>;
  category: 'shows' | 'health' | 'training' | 'admin';
}

interface PrintManagerProps {
  isOpen: boolean;
  onClose: () => void;
  data?: Record<string, unknown>;
  preselectedType?: string;
}

const reportTemplates: ReportTemplate[] = [
  {
    id: 'show_results',
    name: 'Show Results',
    description: 'Official show results with placements and awards',
    type: 'show_results',
    icon: Trophy,
    category: 'shows'
  },
  {
    id: 'registration_form',
    name: 'Registration Form',
    description: 'Entry forms for dog show registration',
    type: 'registration_form',
    icon: FileText,
    category: 'admin'
  },
  {
    id: 'health_records',
    name: 'Health Records',
    description: 'Vaccination records and vet visit history',
    type: 'health_records',
    icon: Heart,
    category: 'health'
  },
  {
    id: 'training_summary',
    name: 'Training Summary',
    description: 'Progress report and training achievements',
    type: 'training_summary',
    icon: BookOpen,
    category: 'training'
  }
];

const mockData = {
  show_results: {
    showName: 'Annual Championship Dog Show',
    date: '2024-06-15',
    location: 'Metro Convention Center',
    judge: 'Dr. Sarah Johnson',
    ring: 'Ring 1',
    className: 'Open Adult Male',
    results: [
      { placement: 1, armband: '42', dogName: 'Champion Rex', breed: 'German Shepherd', owner: 'John Smith', points: 95 },
      { placement: 2, armband: '18', dogName: 'Duke Thunder', breed: 'Rottweiler', owner: 'Mary Jones', points: 92 },
      { placement: 3, armband: '33', dogName: 'Lady Belle', breed: 'Golden Retriever', owner: 'Robert Wilson', points: 89 }
    ],
    comments: 'Excellent competition with high-quality entries. All dogs demonstrated exceptional breed standards.'
  },
  health_records: {
    dogName: 'Champion Rex',
    breed: 'German Shepherd',
    dateOfBirth: '2022-03-15',
    registration: 'AKC-12345678',
    microchip: '985141001234567',
    owner: 'John Smith',
    vaccinations: [
      { vaccine: 'DHPP', date: '2024-01-15', expiration: '2025-01-15', vetName: 'Dr. Williams', lotNumber: 'VAC123' },
      { vaccine: 'Rabies', date: '2024-01-15', expiration: '2027-01-15', vetName: 'Dr. Williams', lotNumber: 'RAB456' },
      { vaccine: 'Bordetella', date: '2024-03-10', expiration: '2025-03-10', vetName: 'Dr. Williams', lotNumber: 'BOR789' }
    ],
    vetVisits: [
      { date: '2024-05-20', reason: 'Annual Checkup', vetName: 'Dr. Williams', diagnosis: 'Healthy', treatment: 'Routine vaccination updates' },
      { date: '2024-02-14', reason: 'Skin Issue', vetName: 'Dr. Williams', diagnosis: 'Minor dermatitis', treatment: 'Medicated shampoo prescribed' }
    ]
  },
  training_summary: {
    totalSessions: 48,
    totalHours: 72,
    skillsLearned: 12,
    skillProgress: [
      { name: 'Basic Obedience', sessions: 15, proficiency: 95 },
      { name: 'Agility Training', sessions: 20, proficiency: 78 },
      { name: 'Show Stacking', sessions: 8, proficiency: 85 },
      { name: 'Ring Confidence', sessions: 5, proficiency: 72 }
    ],
    recentSessions: [
      { title: 'Advanced Heeling', date: '2024-06-10', duration: 45, progress: 'Excellent', notes: 'Perfect heel position maintained throughout session' },
      { title: 'Show Stacking Practice', date: '2024-06-08', duration: 30, progress: 'Good', notes: 'Improved stance, needs work on staying still longer' },
      { title: 'Agility Course', date: '2024-06-05', duration: 60, progress: 'Fair', notes: 'Completed course but knocked down one jump' }
    ]
  },
  registration_form: {
    showName: 'Summer Classic Dog Show',
    showDate: '2024-07-20',
    location: 'Fairgrounds Expo Center',
    owner: {
      name: 'John Smith',
      address: '123 Main Street',
      cityStateZip: 'Anytown, ST 12345',
      phone: '(555) 123-4567',
      email: 'john.smith@email.com',
      akcNumber: 'AKC-9876543'
    },
    entries: [
      {
        dogName: 'Champion Rex',
        breed: 'German Shepherd',
        sex: 'Male',
        dateOfBirth: '2022-03-15',
        registration: 'AKC-12345678',
        className: 'Open Adult Male',
        entryFee: 35,
        armband: null
      }
    ],
    totalFees: 35
  }
};

export function PrintManager({ isOpen, onClose, data, preselectedType }: PrintManagerProps) {
  const [selectedTemplate, setSelectedTemplate] = React.useState<ReportTemplate | null>(
    preselectedType ? reportTemplates.find(t => t.id === preselectedType) || null : null
  );
  const [previewMode, setPreviewMode] = React.useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: selectedTemplate ? `${selectedTemplate.name} - ${new Date().toLocaleDateString()}` : 'Report',
    pageStyle: `
      @page {
        size: A4;
        margin: 20mm;
      }
      @media print {
        body { -webkit-print-color-adjust: exact; }
      }
    `
  });

  const handleExportPDF = () => {
    // In a real implementation, this would use a library like jsPDF or html2pdf
    logger.debug('Exporting to PDF...', 'components', {});
    handlePrint();
  };

  const handleEmail = () => {
    if (!selectedTemplate) return;
    
    const subject = encodeURIComponent(`${selectedTemplate.name} Report`);
    const body = encodeURIComponent('Please find the attached report from myK9Show.');
    const mailto = `mailto:?subject=${subject}&body=${body}`;
    
    window.open(mailto);
  };

  const getReportData = () => {
    if (data) return data;
    return mockData[selectedTemplate?.type as keyof typeof mockData] || {};
  };

  const categories = Array.from(new Set(reportTemplates.map(t => t.category)));

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'shows': return Trophy;
      case 'health': return Heart;
      case 'training': return BookOpen;
      case 'admin': return FileText;
      default: return FileText;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'shows': return 'Show Reports';
      case 'health': return 'Health Records';
      case 'training': return 'Training Reports';
      case 'admin': return 'Administrative';
      default: return 'Other';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Manager
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template Selection */}
          <div className="lg:col-span-1 space-y-4">
            <h3 className="font-semibold">Select Report Template</h3>
            
            {categories.map(category => {
              const CategoryIcon = getCategoryIcon(category);
              const categoryTemplates = reportTemplates.filter(t => t.category === category);
              
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-2">
                    <CategoryIcon className="h-4 w-4" />
                    <h4 className="text-sm font-medium">{getCategoryLabel(category)}</h4>
                  </div>
                  
                  <div className="space-y-2 ml-6">
                    {categoryTemplates.map(template => {
                      const TemplateIcon = template.icon;
                      return (
                        <Card
                          key={template.id}
                          className={`cursor-pointer transition-all ${
                            selectedTemplate?.id === template.id
                              ? 'ring-2 ring-primary bg-primary/5'
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => setSelectedTemplate(template)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <TemplateIcon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="font-medium text-sm">{template.name}</p>
                                <p className="text-xs text-muted-foreground">{template.description}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Preview/Actions */}
          <div className="lg:col-span-2">
            {selectedTemplate ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{selectedTemplate.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewMode(!previewMode)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {previewMode ? 'Hide Preview' : 'Preview'}
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handlePrint} className="flex items-center gap-2">
                    <Printer className="h-4 w-4" />
                    Print
                  </Button>
                  
                  <Button variant="outline" onClick={handleExportPDF} className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export PDF
                  </Button>
                  
                  <Button variant="outline" onClick={handleEmail} className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Button>
                  
                  <Button variant="outline" className="flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    Share
                  </Button>
                  
                  <Button variant="outline" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Options
                  </Button>
                </div>

                {/* Preview */}
                {previewMode && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Print Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-lg bg-white p-4 max-h-96 overflow-y-auto">
                        <div className="transform scale-75 origin-top-left" style={{ width: '133.33%' }}>
                          <PrintableReport
                            ref={printRef}
                            type={selectedTemplate.type}
                            data={getReportData() as ReportData}
                            title={selectedTemplate.name}
                            subtitle={`Generated on ${new Date().toLocaleDateString()}`}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Print Options */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Print Options</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Paper Size</label>
                        <select className="w-full px-3 py-2 border rounded-md text-sm">
                          <option>A4</option>
                          <option>Letter</option>
                          <option>Legal</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Orientation</label>
                        <select className="w-full px-3 py-2 border rounded-md text-sm">
                          <option>Portrait</option>
                          <option>Landscape</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked />
                        <span className="text-sm">Include header logo</span>
                      </label>
                      
                      <label className="flex items-center gap-2">
                        <input type="checkbox" defaultChecked />
                        <span className="text-sm">Include date stamp</span>
                      </label>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Select a Report Template</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose from the available report templates to generate and print your documents.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Hidden print component */}
        <div style={{ display: 'none' }}>
          {selectedTemplate && (
            <PrintableReport
              ref={printRef}
              type={selectedTemplate.type}
              data={getReportData() as ReportData}
              title={selectedTemplate.name}
              subtitle={`Generated on ${new Date().toLocaleDateString()}`}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}