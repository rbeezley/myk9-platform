-- Create health_records table (depends on dogs)
CREATE TABLE IF NOT EXISTS health_records (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE,
  
  -- Record metadata
  record_type TEXT NOT NULL CHECK (record_type IN ('vaccination', 'medication', 'allergy', 'vet_visit', 'general')),
  title TEXT,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vaccinations table (depends on health_records)
CREATE TABLE IF NOT EXISTS vaccinations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  health_record_id UUID REFERENCES health_records(id) ON DELETE CASCADE,
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE, -- Denormalized for performance
  
  -- Vaccination details
  vaccine_name TEXT NOT NULL,
  date_given DATE NOT NULL,
  expiration_date DATE,
  
  -- Veterinary information
  vet_name TEXT,
  clinic_name TEXT,
  clinic_address TEXT,
  lot_number TEXT,
  manufacturer TEXT,
  
  -- Additional info
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create medications table (depends on health_records)
CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  health_record_id UUID REFERENCES health_records(id) ON DELETE CASCADE,
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE, -- Denormalized for performance
  
  -- Medication details
  medication_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  start_date DATE,
  end_date DATE,
  
  -- Prescription information
  prescribed_by TEXT,
  prescription_number TEXT,
  pharmacy TEXT,
  
  -- Additional info
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create allergies table (depends on health_records)
CREATE TABLE IF NOT EXISTS allergies (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  health_record_id UUID REFERENCES health_records(id) ON DELETE CASCADE,
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE, -- Denormalized for performance
  
  -- Allergy details
  allergen TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'life-threatening')),
  reaction TEXT,
  
  -- Discovery information
  discovered_date DATE,
  discovered_by TEXT, -- Vet, owner, etc.
  
  -- Additional info
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vet_visits table (depends on health_records)
CREATE TABLE IF NOT EXISTS vet_visits (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  health_record_id UUID REFERENCES health_records(id) ON DELETE CASCADE,
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE, -- Denormalized for performance
  
  -- Visit details
  visit_date DATE NOT NULL,
  reason TEXT NOT NULL,
  diagnosis TEXT,
  treatment TEXT,
  
  -- Veterinary information
  vet_name TEXT,
  clinic_name TEXT,
  clinic_address TEXT,
  clinic_phone TEXT,
  
  -- Financial information
  cost DECIMAL(10,2),
  
  -- Follow-up
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date DATE,
  follow_up_notes TEXT,
  
  -- Additional info
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for all health tables
CREATE INDEX IF NOT EXISTS health_records_dog_id_idx ON health_records(dog_id);
CREATE INDEX IF NOT EXISTS health_records_record_type_idx ON health_records(record_type);

CREATE INDEX IF NOT EXISTS vaccinations_dog_id_idx ON vaccinations(dog_id);
CREATE INDEX IF NOT EXISTS vaccinations_health_record_id_idx ON vaccinations(health_record_id);
CREATE INDEX IF NOT EXISTS vaccinations_expiration_date_idx ON vaccinations(expiration_date);

CREATE INDEX IF NOT EXISTS medications_dog_id_idx ON medications(dog_id);
CREATE INDEX IF NOT EXISTS medications_health_record_id_idx ON medications(health_record_id);
CREATE INDEX IF NOT EXISTS medications_is_active_idx ON medications(is_active);

CREATE INDEX IF NOT EXISTS allergies_dog_id_idx ON allergies(dog_id);
CREATE INDEX IF NOT EXISTS allergies_health_record_id_idx ON allergies(health_record_id);
CREATE INDEX IF NOT EXISTS allergies_is_active_idx ON allergies(is_active);

CREATE INDEX IF NOT EXISTS vet_visits_dog_id_idx ON vet_visits(dog_id);
CREATE INDEX IF NOT EXISTS vet_visits_health_record_id_idx ON vet_visits(health_record_id);
CREATE INDEX IF NOT EXISTS vet_visits_visit_date_idx ON vet_visits(visit_date);

-- Enable RLS on all health tables
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_visits ENABLE ROW LEVEL SECURITY;

-- Create policies for all health tables
CREATE POLICY "Users can view health records" ON health_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view vaccinations" ON vaccinations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view medications" ON medications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view allergies" ON allergies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view vet visits" ON vet_visits FOR SELECT TO authenticated USING (true);

-- Insert sample health data
INSERT INTO health_records (dog_id, record_type, title, notes)
SELECT d.id, 'vaccination', 'Annual Vaccinations', 'Routine vaccination schedule'
FROM dogs d WHERE d.name = 'Champion Goldenworth Max'
UNION ALL
SELECT d.id, 'allergy', 'Food Allergies', 'Known food sensitivities'
FROM dogs d WHERE d.name = 'Bella of the Valley'
ON CONFLICT DO NOTHING;

-- Insert sample vaccinations
INSERT INTO vaccinations (health_record_id, dog_id, vaccine_name, date_given, expiration_date, vet_name, clinic_name)
SELECT hr.id, hr.dog_id, 'DHPP', '2024-03-15'::DATE, '2025-03-15'::DATE, 'Dr. Sarah Johnson', 'Main Street Veterinary Clinic'
FROM health_records hr WHERE hr.record_type = 'vaccination'
ON CONFLICT DO NOTHING;

-- Insert sample allergies
INSERT INTO allergies (health_record_id, dog_id, allergen, severity, reaction, discovered_by)
SELECT hr.id, hr.dog_id, 'Chicken', 'moderate', 'Skin irritation and digestive upset', 'Owner observation'
FROM health_records hr WHERE hr.record_type = 'allergy'
ON CONFLICT DO NOTHING;