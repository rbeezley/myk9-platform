import React, { forwardRef } from 'react';
import { Separator } from '@/components/ui/separator';
// Icons removed as they are not used in this print component

interface ShowResult {
  placement: number;
  armband: string;
  dogName: string;
  breed: string;
  owner: string;
  points: number;
}

interface ShowResultData {
  showName: string;
  date: string;
  location: string;
  judge: string;
  ring: string;
  className: string;
  results?: ShowResult[];
  comments?: string;
}

interface VaccinationRecord {
  vaccine: string;
  date: string;
  expiration: string;
  vetName: string;
  lotNumber: string;
}

interface VetVisit {
  reason: string;
  date: string;
  vetName: string;
  diagnosis?: string;
  treatment?: string;
}

interface HealthRecordData {
  dogName: string;
  breed: string;
  dateOfBirth: string;
  registration: string;
  microchip: string;
  owner: string;
  vaccinations?: VaccinationRecord[];
  vetVisits?: VetVisit[];
}

interface TrainingSkill {
  name: string;
  sessions: number;
  proficiency: number;
}

interface TrainingSession {
  title: string;
  date: string;
  duration: number;
  progress: string;
  notes?: string;
}

interface TrainingSummaryData {
  dogName: string;
  period: string;
  totalSessions: number;
  totalHours: number;
  averageSession: string;
  skillsLearned: string[];
  skillProgress?: TrainingSkill[];
  recentSessions?: TrainingSession[];
}

interface RegistrationEntry {
  dogName: string;
  breed: string;
  sex: string;
  dateOfBirth: string;
  registration: string;
  className: string;
  entryFee: number;
  armband?: string;
  jumpHeight?: string;
}

interface RegistrationFormData {
  showName: string;
  showDate: string;
  location: string;
  ownerName: string;
  owner: {
    name: string;
    address: string;
    cityStateZip: string;
    phone: string;
    email: string;
    akcNumber: string;
  };
  address: string;
  phone: string;
  email: string;
  dogName: string;
  breed: string;
  registration: string;
  entries?: RegistrationEntry[];
  totalFees: number;
}

export type ReportData = ShowResultData | HealthRecordData | TrainingSummaryData | RegistrationFormData;

interface PrintableReportProps {
  type: 'show_results' | 'health_records' | 'training_summary' | 'registration_form';
  data: ReportData;
  title: string;
  subtitle?: string;
  showLogo?: boolean;
  showDate?: boolean;
}

const PrintableReport = forwardRef<HTMLDivElement, PrintableReportProps>(
  ({ type, data, title, subtitle, showLogo = true, showDate = true }, ref) => {
    const printDate = new Date().toLocaleDateString();

    const ShowResultsReport = ({ data }: { data: ShowResultData }) => (
      <div className="space-y-6">
        {/* Show Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Show:</strong> {data.showName}</p>
            <p><strong>Date:</strong> {data.date}</p>
            <p><strong>Location:</strong> {data.location}</p>
          </div>
          <div>
            <p><strong>Judge:</strong> {data.judge}</p>
            <p><strong>Ring:</strong> {data.ring}</p>
            <p><strong>Class:</strong> {data.className}</p>
          </div>
        </div>

        <Separator />

        {/* Results Table */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Results</h3>
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 p-2 text-left">Placement</th>
                <th className="border border-gray-300 p-2 text-left">Armband</th>
                <th className="border border-gray-300 p-2 text-left">Dog Name</th>
                <th className="border border-gray-300 p-2 text-left">Breed</th>
                <th className="border border-gray-300 p-2 text-left">Owner</th>
                <th className="border border-gray-300 p-2 text-left">Points</th>
              </tr>
            </thead>
            <tbody>
              {data.results?.map((result: ShowResult, index: number) => (
                <tr key={index}>
                  <td className="border border-gray-300 p-2">
                    {result.placement === 1 && "🥇"} 
                    {result.placement === 2 && "🥈"} 
                    {result.placement === 3 && "🥉"} 
                    {result.placement}
                  </td>
                  <td className="border border-gray-300 p-2">{result.armband}</td>
                  <td className="border border-gray-300 p-2 font-medium">{result.dogName}</td>
                  <td className="border border-gray-300 p-2">{result.breed}</td>
                  <td className="border border-gray-300 p-2">{result.owner}</td>
                  <td className="border border-gray-300 p-2">{result.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Judge's Comments */}
        {data.comments && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Judge's Comments</h3>
            <div className="p-3 bg-gray-50 rounded text-sm">
              {data.comments}
            </div>
          </div>
        )}
      </div>
    );

    const HealthRecordsReport = ({ data }: { data: HealthRecordData }) => (
      <div className="space-y-6">
        {/* Dog Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><strong>Dog Name:</strong> {data.dogName}</p>
            <p><strong>Breed:</strong> {data.breed}</p>
            <p><strong>Date of Birth:</strong> {data.dateOfBirth}</p>
          </div>
          <div>
            <p><strong>Registration:</strong> {data.registration}</p>
            <p><strong>Microchip:</strong> {data.microchip}</p>
            <p><strong>Owner:</strong> {data.owner}</p>
          </div>
        </div>

        <Separator />

        {/* Vaccination Records */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Vaccination Records</h3>
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 p-2 text-left">Vaccine</th>
                <th className="border border-gray-300 p-2 text-left">Date Given</th>
                <th className="border border-gray-300 p-2 text-left">Next Due</th>
                <th className="border border-gray-300 p-2 text-left">Veterinarian</th>
                <th className="border border-gray-300 p-2 text-left">Lot Number</th>
              </tr>
            </thead>
            <tbody>
              {data.vaccinations?.map((vax: VaccinationRecord, index: number) => (
                <tr key={index}>
                  <td className="border border-gray-300 p-2 font-medium">{vax.vaccine}</td>
                  <td className="border border-gray-300 p-2">{vax.date}</td>
                  <td className="border border-gray-300 p-2">{vax.expiration}</td>
                  <td className="border border-gray-300 p-2">{vax.vetName}</td>
                  <td className="border border-gray-300 p-2">{vax.lotNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Vet Visits */}
        {data.vetVisits && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Recent Vet Visits</h3>
            <div className="space-y-2">
              {data.vetVisits.map((visit: VetVisit, index: number) => (
                <div key={index} className="p-3 border rounded">
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium">{visit.reason}</p>
                    <p className="text-sm text-gray-600">{visit.date}</p>
                  </div>
                  <p className="text-sm">Veterinarian: {visit.vetName}</p>
                  {visit.diagnosis && <p className="text-sm">Diagnosis: {visit.diagnosis}</p>}
                  {visit.treatment && <p className="text-sm">Treatment: {visit.treatment}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );

    const TrainingSummaryReport = ({ data }: { data: TrainingSummaryData }) => (
      <div className="space-y-6">
        {/* Training Overview */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 border rounded">
            <p className="text-2xl font-bold">{data.totalSessions}</p>
            <p className="text-sm text-gray-600">Total Sessions</p>
          </div>
          <div className="p-3 border rounded">
            <p className="text-2xl font-bold">{data.totalHours}h</p>
            <p className="text-sm text-gray-600">Training Hours</p>
          </div>
          <div className="p-3 border rounded">
            <p className="text-2xl font-bold">{data.skillsLearned}</p>
            <p className="text-sm text-gray-600">Skills Learned</p>
          </div>
        </div>

        <Separator />

        {/* Progress by Skill */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Progress by Skill</h3>
          <div className="space-y-3">
            {data.skillProgress?.map((skill: TrainingSkill, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">{skill.name}</p>
                  <p className="text-sm text-gray-600">{skill.sessions} sessions</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{skill.proficiency}%</p>
                  <div className="w-24 h-2 bg-gray-200 rounded">
                    <div 
                      className="h-2 bg-blue-500 rounded"
                      style={{ width: `${skill.proficiency}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Sessions */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Recent Training Sessions</h3>
          <div className="space-y-2">
            {data.recentSessions?.map((session: TrainingSession, index: number) => (
              <div key={index} className="p-3 border rounded">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-medium">{session.title}</p>
                  <p className="text-sm text-gray-600">{session.date}</p>
                </div>
                <p className="text-sm mb-1">Duration: {session.duration} minutes</p>
                <p className="text-sm">Progress: {session.progress}</p>
                {session.notes && (
                  <p className="text-sm mt-2 p-2 bg-gray-50 rounded">{session.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );

    const RegistrationFormReport = ({ data }: { data: RegistrationFormData }) => (
      <div className="space-y-6">
        {/* Show Information */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold">{data.showName}</h2>
          <p className="text-sm text-gray-600">{data.showDate} • {data.location}</p>
        </div>

        {/* Owner Information */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Owner Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p><strong>Name:</strong> {data.owner.name}</p>
              <p><strong>Address:</strong> {data.owner.address}</p>
              <p><strong>City, State ZIP:</strong> {data.owner.cityStateZip}</p>
            </div>
            <div>
              <p><strong>Phone:</strong> {data.owner.phone}</p>
              <p><strong>Email:</strong> {data.owner.email}</p>
              <p><strong>AKC Number:</strong> {data.owner.akcNumber}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Dog Entries */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Dog Entries</h3>
          {data.entries?.map((entry: RegistrationEntry, index: number) => (
            <div key={index} className="mb-4 p-4 border rounded">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Dog Name:</strong> {entry.dogName}</p>
                  <p><strong>Breed:</strong> {entry.breed}</p>
                  <p><strong>Sex:</strong> {entry.sex}</p>
                  <p><strong>Date of Birth:</strong> {entry.dateOfBirth}</p>
                </div>
                <div>
                  <p><strong>Registration:</strong> {entry.registration}</p>
                  <p><strong>Class:</strong> {entry.className}</p>
                  <p><strong>Entry Fee:</strong> ${entry.entryFee}</p>
                  <p><strong>Armband:</strong> {entry.armband || 'TBD'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Payment Summary */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center">
            <p className="text-lg font-semibold">Total Entry Fees:</p>
            <p className="text-lg font-bold">${data.totalFees}</p>
          </div>
        </div>

        {/* Signature Lines */}
        <div className="mt-8 pt-8 border-t">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="border-b border-gray-400 mb-2 h-8"></div>
              <p className="text-sm text-center">Owner Signature</p>
            </div>
            <div>
              <div className="border-b border-gray-400 mb-2 h-8"></div>
              <p className="text-sm text-center">Date</p>
            </div>
          </div>
        </div>
      </div>
    );

    const renderReportContent = () => {
      switch (type) {
        case 'show_results':
          return <ShowResultsReport data={data as ShowResultData} />;
        case 'health_records':
          return <HealthRecordsReport data={data as HealthRecordData} />;
        case 'training_summary':
          return <TrainingSummaryReport data={data as TrainingSummaryData} />;
        case 'registration_form':
          return <RegistrationFormReport data={data as RegistrationFormData} />;
        default:
          return <div>Report type not supported</div>;
      }
    };

    return (
      <div ref={ref} className="print-report bg-white text-black">
        <style>{`
          @media print {
            .print-report {
              font-size: 12px;
              line-height: 1.4;
            }
            
            .print-report h1 {
              font-size: 18px;
              margin-bottom: 8px;
            }
            
            .print-report h2 {
              font-size: 16px;
              margin-bottom: 6px;
            }
            
            .print-report h3 {
              font-size: 14px;
              margin-bottom: 4px;
            }
            
            .print-report table {
              page-break-inside: avoid;
            }
            
            .print-report thead {
              display: table-header-group;
            }
            
            .print-report tr {
              page-break-inside: avoid;
            }
          }
        `}</style>
        
        <div className="max-w-4xl mx-auto p-8">
          {/* Header */}
          <div className="text-center mb-6">
            {showLogo && (
              <div className="mb-4">
                <h1 className="text-2xl font-bold">myK9Show</h1>
                <p className="text-sm text-gray-600">Professional Dog Show Management</p>
              </div>
            )}
            
            <h2 className="text-xl font-bold mb-2">{title}</h2>
            {subtitle && <p className="text-sm text-gray-600 mb-2">{subtitle}</p>}
            {showDate && (
              <p className="text-xs text-gray-500">Generated on {printDate}</p>
            )}
          </div>

          {/* Report Content */}
          {renderReportContent()}

          {/* Footer */}
          <div className="mt-8 pt-4 border-t text-center text-xs text-gray-500">
            <p>This report was generated by myK9Show on {printDate}</p>
            <p>© 2024 myK9Show. All rights reserved.</p>
          </div>
        </div>
      </div>
    );
  }
);

PrintableReport.displayName = 'PrintableReport';

export { PrintableReport };