import {
  mapResultStatusToQualification,
  mapQualificationToResultStatus,
  dbSecondsToInputFormat,
  inputFormatToDbSeconds,
} from './scoringMappings';

describe('mapResultStatusToQualification', () => {
  it('maps DB result_status to display QualificationStatus', () => {
    expect(mapResultStatusToQualification('qualified')).toBe('Qualified');
    expect(mapResultStatusToQualification('nq')).toBe('Not Qualified');
    expect(mapResultStatusToQualification('absent')).toBe('Absent');
    expect(mapResultStatusToQualification('excused')).toBe('Excused');
    expect(mapResultStatusToQualification('withdrawn')).toBe('Withdrawn');
  });

  it('returns empty string for pending or null', () => {
    expect(mapResultStatusToQualification('pending')).toBe('');
    expect(mapResultStatusToQualification(null)).toBe('');
    expect(mapResultStatusToQualification(undefined)).toBe('');
  });
});

describe('mapQualificationToResultStatus', () => {
  it('maps display QualificationStatus to DB result_status', () => {
    expect(mapQualificationToResultStatus('Qualified')).toBe('qualified');
    expect(mapQualificationToResultStatus('Not Qualified')).toBe('nq');
    expect(mapQualificationToResultStatus('Absent')).toBe('absent');
    expect(mapQualificationToResultStatus('Excused')).toBe('excused');
    expect(mapQualificationToResultStatus('Withdrawn')).toBe('withdrawn');
    expect(mapQualificationToResultStatus('Eliminated')).toBe('nq');
  });

  it('returns pending for empty string', () => {
    expect(mapQualificationToResultStatus('')).toBe('pending');
  });
});

describe('dbSecondsToInputFormat', () => {
  it('converts seconds to MM:SS.HH', () => {
    expect(dbSecondsToInputFormat(45.23)).toBe('0:45.23');
    expect(dbSecondsToInputFormat(125.5)).toBe('2:05.50');
    expect(dbSecondsToInputFormat(0)).toBe('');
    expect(dbSecondsToInputFormat(null)).toBe('');
  });
});

describe('inputFormatToDbSeconds', () => {
  it('converts MM:SS.HH to seconds', () => {
    expect(inputFormatToDbSeconds('0:45.23')).toBe(45.23);
    expect(inputFormatToDbSeconds('2:05.50')).toBe(125.5);
    expect(inputFormatToDbSeconds('')).toBe(0);
  });
});
