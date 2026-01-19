import { faker } from '@faker-js/faker';

export interface ShowTestData {
  name: string;
  type: 'AKC' | 'UKC' | 'Other';
  startDate: string;
  endDate: string;
  location: string;
  clubId: string;
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: number;
  dayOfShowFee: number;
  chairman: string;
  secretary: string;
  judgeIds: string[];
}

export interface TrialTestData {
  id: string;
  name: string;
  dateTime: string;
  eventNumber: string;
  type: 'Conformation' | 'Obedience' | 'Agility' | 'Scent Work' | 'Rally';
  classes: ClassTestData[];
}

export interface ClassTestData {
  templateId: string;
  customizations: {
    className: string;
    element?: string;
    level?: string;
    section?: string;
    fieldOverrides: Record<string, any>;
  };
  judgeId: string;
}

export interface JudgeTestData {
  id: string;
  name: string;
  email: string;
  phone: string;
  certifications: string[];
  specialties: string[];
  notes: string;
}

export class ShowTestDataFactory {
  
  /**
   * Generate test show data
   */
  static createShowData(overrides: Partial<ShowTestData> = {}): ShowTestData {
    const startDate = faker.date.future();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + faker.number.int({ min: 1, max: 3 }));
    
    const entryCloseDate = new Date(startDate);
    entryCloseDate.setDate(entryCloseDate.getDate() - faker.number.int({ min: 7, max: 21 }));
    
    const entryOpenDate = new Date(entryCloseDate);
    entryOpenDate.setDate(entryOpenDate.getDate() - faker.number.int({ min: 30, max: 90 }));
    
    return {
      name: faker.company.name() + ' Dog Show',
      type: faker.helpers.arrayElement(['AKC', 'UKC', 'Other'] as const),
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      location: `${faker.location.city()} Convention Center`,
      clubId: `club-${faker.string.uuid()}`,
      entryOpenDate: entryOpenDate.toISOString().split('T')[0],
      entryCloseDate: entryCloseDate.toISOString().split('T')[0],
      preEntryFee: faker.number.int({ min: 25, max: 45 }),
      dayOfShowFee: faker.number.int({ min: 35, max: 55 }),
      chairman: faker.person.fullName(),
      secretary: faker.person.fullName(),
      judgeIds: [faker.string.uuid(), faker.string.uuid()],
      ...overrides,
    };
  }

  /**
   * Generate specific show types
   */
  static createAllBreedShow(): ShowTestData {
    return this.createShowData({
      name: 'Annual All-Breed Championship',
      type: 'AKC',
      preEntryFee: 35,
      dayOfShowFee: 45,
    });
  }

  static createSpecialtyShow(): ShowTestData {
    const breed = faker.helpers.arrayElement([
      'Golden Retriever', 'Labrador Retriever', 'German Shepherd', 
      'Border Collie', 'Poodle', 'French Bulldog'
    ]);
    
    return this.createShowData({
      name: `${breed} Specialty Show`,
      type: 'AKC',
      preEntryFee: 30,
      dayOfShowFee: 40,
    });
  }

  static createMatchShow(): ShowTestData {
    return this.createShowData({
      name: 'Fun Match Show',
      type: 'Other',
      preEntryFee: 15,
      dayOfShowFee: 20,
    });
  }

  /**
   * Generate trial test data
   */
  static createTrialData(overrides: Partial<TrialTestData> = {}): TrialTestData {
    const trialDate = faker.date.future();
    const trialTime = faker.helpers.arrayElement(['08:00', '09:00', '10:00', '13:00', '14:00']);
    
    return {
      id: `trial-${faker.string.uuid()}`,
      name: faker.helpers.arrayElement(['Morning Trial', 'Afternoon Trial', 'Championship Trial']),
      dateTime: `${trialDate.toISOString().split('T')[0]}T${trialTime}:00.000Z`,
      eventNumber: faker.string.numeric(6),
      type: faker.helpers.arrayElement(['Conformation', 'Obedience', 'Agility', 'Scent Work', 'Rally'] as const),
      classes: [],
      ...overrides,
    };
  }

  /**
   * Generate specific trial types
   */
  static createConformationTrial(): TrialTestData {
    return this.createTrialData({
      name: 'Conformation Trial',
      type: 'Conformation',
      classes: [
        this.createConformationClass('Puppy Dog', 'Novice', 'A'),
        this.createConformationClass('Open Dog', 'Open', 'A'),
        this.createConformationClass('Puppy Bitch', 'Novice', 'B'),
        this.createConformationClass('Open Bitch', 'Open', 'B'),
      ],
    });
  }

  static createObedienceTrial(): TrialTestData {
    return this.createTrialData({
      name: 'Obedience Trial',
      type: 'Obedience',
      classes: [
        this.createObedienceClass('Novice A'),
        this.createObedienceClass('Novice B'),
        this.createObedienceClass('Open A'),
        this.createObedienceClass('Open B'),
        this.createObedienceClass('Utility A'),
        this.createObedienceClass('Utility B'),
      ],
    });
  }

  static createAgilityTrial(): TrialTestData {
    return this.createTrialData({
      name: 'Agility Trial',
      type: 'Agility',
      classes: [
        this.createAgilityClass('Standard', 'Novice', '12'),
        this.createAgilityClass('Standard', 'Novice', '16'),
        this.createAgilityClass('Standard', 'Novice', '20'),
        this.createAgilityClass('Jumpers', 'Open', '16'),
        this.createAgilityClass('Jumpers', 'Open', '20'),
      ],
    });
  }

  static createScentWorkTrial(): TrialTestData {
    return this.createTrialData({
      name: 'Scent Work Trial',
      type: 'Scent Work',
      classes: [
        this.createScentWorkClass('Container', 'Novice', 'A'),
        this.createScentWorkClass('Container', 'Advanced', 'A'),
        this.createScentWorkClass('Interior', 'Novice', 'A'),
        this.createScentWorkClass('Buried', 'Novice', 'A'),
      ],
    });
  }

  static createRallyTrial(): TrialTestData {
    return this.createTrialData({
      name: 'Rally Trial',
      type: 'Rally',
      classes: [
        this.createRallyClass('Novice A'),
        this.createRallyClass('Novice B'),
        this.createRallyClass('Advanced A'),
        this.createRallyClass('Advanced B'),
        this.createRallyClass('Excellent A'),
        this.createRallyClass('Excellent B'),
      ],
    });
  }

  /**
   * Helper methods for creating specific class types
   */
  private static createConformationClass(className: string, level: string, section: string): ClassTestData {
    return {
      templateId: `akc-conformation-${level.toLowerCase()}`,
      customizations: {
        className,
        level,
        section,
        fieldOverrides: {
          maxEntries: faker.number.int({ min: 20, max: 50 }),
          preEntryFee: faker.number.int({ min: 25, max: 35 }),
          estimatedJudgingTime: faker.number.int({ min: 30, max: 90 }),
        },
      },
      judgeId: faker.string.uuid(),
    };
  }

  private static createObedienceClass(className: string): ClassTestData {
    return {
      templateId: `akc-obedience-${className.toLowerCase().replace(' ', '-')}`,
      customizations: {
        className,
        level: className.split(' ')[0], // Extract level (Novice, Open, Utility)
        section: className.split(' ')[1] || 'A', // Extract section (A, B)
        fieldOverrides: {
          maxEntries: faker.number.int({ min: 15, max: 30 }),
          preEntryFee: faker.number.int({ min: 20, max: 30 }),
          estimatedJudgingTime: faker.number.int({ min: 45, max: 120 }),
        },
      },
      judgeId: faker.string.uuid(),
    };
  }

  private static createAgilityClass(type: string, level: string, height: string): ClassTestData {
    return {
      templateId: `akc-agility-${type.toLowerCase()}-${level.toLowerCase()}`,
      customizations: {
        className: `${type} ${level} ${height}"`,
        element: type,
        level,
        section: 'A',
        fieldOverrides: {
          height,
          maxEntries: faker.number.int({ min: 25, max: 40 }),
          preEntryFee: faker.number.int({ min: 22, max: 28 }),
          estimatedJudgingTime: faker.number.int({ min: 60, max: 180 }),
        },
      },
      judgeId: faker.string.uuid(),
    };
  }

  private static createScentWorkClass(element: string, level: string, section: string): ClassTestData {
    return {
      templateId: `akc-scent-work-${element.toLowerCase()}-${level.toLowerCase()}`,
      customizations: {
        className: `${element} ${level} ${section}`,
        element,
        level,
        section,
        fieldOverrides: {
          maxEntries: faker.number.int({ min: 20, max: 35 }),
          preEntryFee: faker.number.int({ min: 25, max: 32 }),
          timeLimit1: faker.helpers.arrayElement(['2:00', '3:00', '4:00']),
          timeLimit2: level === 'Advanced' ? faker.helpers.arrayElement(['1:30', '2:00']) : undefined,
          searchAreas: level === 'Advanced' ? 2 : 1,
        },
      },
      judgeId: faker.string.uuid(),
    };
  }

  private static createRallyClass(className: string): ClassTestData {
    return {
      templateId: `akc-rally-${className.toLowerCase().replace(' ', '-')}`,
      customizations: {
        className,
        level: className.split(' ')[0], // Extract level (Novice, Advanced, Excellent)
        section: className.split(' ')[1] || 'A', // Extract section (A, B)
        fieldOverrides: {
          maxEntries: faker.number.int({ min: 20, max: 35 }),
          preEntryFee: faker.number.int({ min: 18, max: 25 }),
          estimatedJudgingTime: faker.number.int({ min: 30, max: 60 }),
        },
      },
      judgeId: faker.string.uuid(),
    };
  }

  /**
   * Generate judge test data
   */
  static createJudgeData(overrides: Partial<JudgeTestData> = {}): JudgeTestData {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    
    return {
      id: faker.string.uuid(),
      name: `${firstName} ${lastName}`,
      email: faker.internet.email({ firstName, lastName }),
      phone: faker.phone.number(),
      certifications: faker.helpers.arrayElements(['AKC', 'UKC', 'CKC'], { min: 1, max: 3 }),
      specialties: faker.helpers.arrayElements([
        'All Breeds', 'Sporting Group', 'Working Group', 'Terrier Group',
        'Toy Group', 'Non-Sporting Group', 'Herding Group', 'Hound Group',
        'Obedience', 'Rally', 'Agility', 'Scent Work'
      ], { min: 1, max: 4 }),
      notes: faker.lorem.sentences(2),
      ...overrides,
    };
  }

  /**
   * Generate test clubs
   */
  static createClubData() {
    return {
      id: faker.string.uuid(),
      name: faker.company.name() + ' Kennel Club',
      email: faker.internet.email(),
      phone: faker.phone.number(),
      address: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        zipCode: faker.location.zipCode(),
        country: 'USA',
      },
      website: faker.internet.url(),
      akc_club_number: faker.string.numeric(6),
    };
  }

  /**
   * Generate complete show workflow test data
   */
  static createCompleteShowWorkflow() {
    const showData = this.createAllBreedShow();
    const judges = [
      this.createJudgeData({ specialties: ['All Breeds', 'Conformation'] }),
      this.createJudgeData({ specialties: ['Obedience', 'Rally'] }),
      this.createJudgeData({ specialties: ['Agility', 'Scent Work'] }),
    ];
    
    const trials = [
      this.createConformationTrial(),
      this.createObedienceTrial(),
      this.createAgilityTrial(),
      this.createScentWorkTrial(),
    ];
    
    // Assign judges to classes
    trials.forEach(trial => {
      const relevantJudge = judges.find(judge => 
        judge.specialties.some(specialty => 
          trial.type === 'Conformation' && specialty.includes('Breed') ||
          trial.type === 'Obedience' && specialty.includes('Obedience') ||
          trial.type === 'Agility' && specialty.includes('Agility') ||
          trial.type === 'Scent Work' && specialty.includes('Scent Work')
        )
      ) || judges[0];
      
      trial.classes.forEach(cls => {
        cls.judgeId = relevantJudge.id;
      });
    });
    
    return {
      show: showData,
      trials,
      judges,
      club: this.createClubData(),
    };
  }
}