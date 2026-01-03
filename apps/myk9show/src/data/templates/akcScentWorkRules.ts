import { ClassDefinition } from '@/types/template.types';

// Time limit rules based on element and level
export const getTimeLimit = (element: string, level: string | undefined): { 
  timeLimit1: string; 
  timeLimit2?: string; 
  timeLimit3?: string;
  setBy: 'Rules' | 'Judge';
} => {
  // Container and Buried have fixed time limits
  if (element === 'Container' || element === 'Buried') {
    const timeLimits: Record<string, string> = {
      'Novice': '2 minutes',
      'Advanced': element === 'Container' ? '2 minutes' : '3 minutes',
      'Excellent': element === 'Container' ? '3 minutes' : '4 minutes',
      'Master': element === 'Container' ? '4 minutes' : '5 minutes'
    };
    return { 
      timeLimit1: timeLimits[level || ''] || '2 minutes',
      setBy: 'Rules' 
    };
  }

  // Exterior and Interior are judge-set with ranges
  if (element === 'Exterior') {
    const timeRanges: Record<string, string> = {
      'Novice': '2-4 minutes',
      'Advanced': '2-4 minutes',
      'Excellent': '3-5 minutes',
      'Master': '3-5 minutes'
    };
    return { 
      timeLimit1: timeRanges[level || ''] || '2-4 minutes',
      setBy: 'Judge' 
    };
  }

  if (element === 'Interior') {
    const timeRanges: Record<string, string> = {
      'Novice': '1-3 minutes',
      'Advanced': '1-3 minutes',
      'Excellent': '1-3 minutes per area',
      'Master': '1-3 minutes per area'
    };
    
    const result: {
      timeLimit1: string;
      timeLimit2?: string;
      timeLimit3?: string;
      setBy: 'Rules' | 'Judge';
    } = { 
      timeLimit1: timeRanges[level || ''] || '1-3 minutes',
      setBy: 'Judge' 
    };

    // Interior Excellent has 2 areas
    if (level === 'Excellent') {
      result.timeLimit2 = '1-3 minutes per area';
    }
    
    // Interior Master has 3 areas
    if (level === 'Master') {
      result.timeLimit2 = '1-3 minutes per area';
      result.timeLimit3 = '1-3 minutes per area';
    }

    return result;
  }

  // Handler Discrimination
  if (element === 'Handler Discrimination (HD)') {
    const hdTimes: Record<string, { time: string; setBy: 'Rules' | 'Judge' }> = {
      'Novice': { time: '2 minutes', setBy: 'Rules' },
      'Advanced': { time: '2-5 minutes', setBy: 'Judge' },
      'Excellent': { time: '3-6 minutes', setBy: 'Judge' },
      'Master': { time: '2-3 minutes per area', setBy: 'Judge' }
    };
    
    const config = hdTimes[level || ''] || { time: '2 minutes', setBy: 'Rules' };
    const result: {
      timeLimit1: string;
      timeLimit2?: string;
      setBy: 'Rules' | 'Judge';
    } = { 
      timeLimit1: config.time,
      setBy: config.setBy 
    };

    // HD Master has 2 areas
    if (level === 'Master') {
      result.timeLimit2 = '2-3 minutes per area';
    }

    return result;
  }

  // Detective
  if (element === 'Detective') {
    return { 
      timeLimit1: '7-15 minutes',
      setBy: 'Judge' 
    };
  }

  return { timeLimit1: '2 minutes', setBy: 'Rules' };
};

// Search area count rules
export const getSearchAreas = (element: string, level: string | undefined): number => {
  if (element === 'Interior') {
    if (level === 'Excellent') return 2;
    if (level === 'Master') return 3;
  }
  
  if (element === 'Handler Discrimination (HD)' && level === 'Master') {
    return 2;
  }

  return 1; // Default for all other combinations
};

// Hide configuration rules
export const getHideConfiguration = (element: string, level: string | undefined): string => {
  // Fixed hide counts for Novice and Advanced
  if (level === 'Novice') {
    return 'Set by Rules: 1';
  }
  
  if (level === 'Advanced') {
    return element === 'Handler Discrimination (HD)' ? 'Set by Rules: 1' : 'Set by Rules: 2';
  }

  // Variable hide counts for higher levels
  if (level === 'Excellent') {
    if (element === 'Interior') {
      return 'Set by Rules: Unknown (1-3)';
    }
    if (element === 'Handler Discrimination (HD)') {
      return 'Set by Rules: 1';
    }
    return 'Set by Rules: 3';
  }

  if (level === 'Master') {
    if (element === 'Interior') {
      return 'Set by Judge: 0-3 per area, 2-6 per class (Unknown to Exhibitor)';
    }
    if (element === 'Container' || element === 'Exterior') {
      return 'Set by Judge: 1-3 (Unknown to Exhibitor)';
    }
    if (element === 'Buried') {
      return 'Set by Judge: 1-4 (Unknown to Exhibitor)';
    }
    if (element === 'Handler Discrimination (HD)') {
      return 'Set by Rules: 3 per class';
    }
  }

  if (element === 'Detective') {
    return 'Set by Judge: 5-10';
  }

  return 'Set by Rules: 1';
};

// Distraction count rules
export const getDistractionCount = (element: string, level: string | undefined): number => {
  if (level === 'Novice') return 0;
  if (level === 'Advanced') return 1;
  if (level === 'Excellent') {
    return element === 'Handler Discrimination (HD)' ? 1 : 2;
  }
  if (level === 'Master') {
    if (element === 'Handler Discrimination (HD)') return 1; // Set by Judge: 1-2
    return 3;
  }
  if (element === 'Detective') return 4; // Set by Judge: 4-6
  
  return 0;
};

// Estimated judging time defaults
export const getEstimatedJudgingTime = (element: string, level: string | undefined): number => {
  const times: Record<string, Record<string, number>> = {
    'Novice': { default: 2.5 },
    'Advanced': { default: 3 },
    'Excellent': { 
      'Interior': 6.5, // Multiple areas
      'default': 4 
    },
    'Master': { 
      'Interior': 8, // 3 areas
      'default': 5 
    }
  };

  if (element === 'Detective') return 5;

  const levelTimes = times[level || 'Novice'] || times['Novice'];
  return levelTimes[element] || levelTimes.default || 2.5;
};

// Generate all 27 AKC Scent Work classes
export const generateAKCScentWorkClasses = (): ClassDefinition[] => {
  const classes: ClassDefinition[] = [];
  let displayOrder = 1;

  // Standard elements that have all levels
  const standardElements = ['Interior', 'Exterior', 'Container', 'Buried'];
  
  standardElements.forEach(element => {
    // Novice A & B
    ['A', 'B'].forEach(section => {
      classes.push({
        element,
        level: 'Novice',
        section,
        className: `${element} Novice ${section}`,
        displayOrder: displayOrder++,
        fieldOverrides: {
          searchAreas: { ruleValue: 1 },
          hides: { ruleValue: getHideConfiguration(element, 'Novice') },
          distractions: { ruleValue: 0 },
          estimatedJudgingTime: { defaultValue: 2.5 },
          ...getTimeLimitOverrides(element, 'Novice')
        }
      });
    });

    // Advanced, Excellent, Master
    ['Advanced', 'Excellent', 'Master'].forEach(level => {
      classes.push({
        element,
        level,
        className: `${element} ${level}`,
        displayOrder: displayOrder++,
        fieldOverrides: {
          searchAreas: { ruleValue: getSearchAreas(element, level) },
          hides: { ruleValue: getHideConfiguration(element, level) },
          distractions: { ruleValue: getDistractionCount(element, level) },
          estimatedJudgingTime: { defaultValue: getEstimatedJudgingTime(element, level) },
          ...getTimeLimitOverrides(element, level)
        }
      });
    });
  });

  // Handler Discrimination classes
  const hdElement = 'Handler Discrimination (HD)';
  
  // HD Novice A & B
  ['A', 'B'].forEach(section => {
    classes.push({
      element: hdElement,
      level: 'Novice',
      section,
      className: `Handler Discrimination Novice ${section}`,
      displayOrder: displayOrder++,
      fieldOverrides: {
        searchAreas: { ruleValue: 1 },
        hides: { ruleValue: 'Set by Rules: 1' },
        distractions: { ruleValue: 0 },
        estimatedJudgingTime: { defaultValue: 2.5 },
        hcdExclude: { defaultValue: true }, // HD classes excluded from HCD award
        ...getTimeLimitOverrides(hdElement, 'Novice')
      }
    });
  });

  // HD Advanced, Excellent, Master
  ['Advanced', 'Excellent', 'Master'].forEach(level => {
    classes.push({
      element: hdElement,
      level,
      className: `Handler Discrimination ${level}`,
      displayOrder: displayOrder++,
      fieldOverrides: {
        searchAreas: { ruleValue: getSearchAreas(hdElement, level) },
        hides: { ruleValue: getHideConfiguration(hdElement, level) },
        distractions: { ruleValue: getDistractionCount(hdElement, level) },
        estimatedJudgingTime: { defaultValue: getEstimatedJudgingTime(hdElement, level) },
        hcdExclude: { defaultValue: true },
        ...getTimeLimitOverrides(hdElement, level)
      }
    });
  });

  // Detective class (standalone)
  classes.push({
    element: 'Detective',
    className: 'Detective',
    displayOrder: displayOrder++,
    fieldOverrides: {
      searchAreas: { ruleValue: 1 },
      hides: { ruleValue: 'Set by Judge: 5-10' },
      distractions: { ruleValue: 4, helpText: 'Judge sets 4-6 distractions' },
      estimatedJudgingTime: { defaultValue: 5 },
      preEntryFee: { defaultValue: 35 }, // Often higher fee
      dayOfShowFee: { defaultValue: 40 },
      maxEntries: { defaultValue: 30 }, // Usually smaller limit
      ...getTimeLimitOverrides('Detective', undefined)
    }
  });

  return classes;
};

// Helper to get time limit field overrides
const getTimeLimitOverrides = (element: string, level: string | undefined) => {
  const timeLimits = getTimeLimit(element, level);
  const overrides: Record<string, {
    ruleValue: string;
    fieldSource: 'rule-based' | 'judge-set';
  }> = {
    timeLimit1: { 
      ruleValue: timeLimits.timeLimit1,
      fieldSource: timeLimits.setBy === 'Rules' ? 'rule-based' : 'judge-set'
    }
  };

  if (timeLimits.timeLimit2) {
    overrides.timeLimit2 = { 
      ruleValue: timeLimits.timeLimit2,
      fieldSource: timeLimits.setBy === 'Rules' ? 'rule-based' : 'judge-set'
    };
  }

  if (timeLimits.timeLimit3) {
    overrides.timeLimit3 = { 
      ruleValue: timeLimits.timeLimit3,
      fieldSource: timeLimits.setBy === 'Rules' ? 'rule-based' : 'judge-set'
    };
  }

  return overrides;
};

// Validation rules for AKC Scent Work
export const AKC_SCENT_WORK_VALIDATION_RULES = [
  {
    ruleType: 'prohibited' as const,
    fields: ['element', 'level'],
    condition: 'element === "Detective" && level !== undefined',
    message: 'Detective class cannot have levels - it is a standalone complex search'
  },
  {
    ruleType: 'prohibited' as const,
    fields: ['element', 'section'],
    condition: 'element === "Detective" && section !== undefined',
    message: 'Detective class cannot have sections'
  },
  {
    ruleType: 'prohibited' as const,
    fields: ['level', 'section'],
    condition: 'level !== "Novice" && section !== undefined',
    message: 'Only Novice level has A/B sections'
  },
  {
    ruleType: 'required' as const,
    fields: ['level', 'section'],
    condition: 'level === "Novice" && !section',
    message: 'Novice level requires section A or B'
  }
];