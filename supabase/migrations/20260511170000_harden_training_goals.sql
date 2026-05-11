ALTER TABLE training_goals
  ADD CONSTRAINT training_goals_completed_after_created
  CHECK (completed_at IS NULL OR completed_at >= created_at);

DROP POLICY IF EXISTS "Users can view own training goals" ON training_goals;
DROP POLICY IF EXISTS "Users can create own training goals" ON training_goals;
DROP POLICY IF EXISTS "Users can update own training goals" ON training_goals;
DROP POLICY IF EXISTS "Users can delete own training goals" ON training_goals;

CREATE POLICY "Users can view own training goals"
  ON training_goals FOR SELECT
  USING (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM dogs
      WHERE dogs.id = training_goals.dog_id
        AND (
          dogs.owner_id = (SELECT public.get_my_person_id())
          OR dogs.co_owner_id = (SELECT public.get_my_person_id())
        )
    )
  );

CREATE POLICY "Users can create own training goals"
  ON training_goals FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM dogs
      WHERE dogs.id = training_goals.dog_id
        AND (
          dogs.owner_id = (SELECT public.get_my_person_id())
          OR dogs.co_owner_id = (SELECT public.get_my_person_id())
        )
    )
  );

CREATE POLICY "Users can update own training goals"
  ON training_goals FOR UPDATE
  USING (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM dogs
      WHERE dogs.id = training_goals.dog_id
        AND (
          dogs.owner_id = (SELECT public.get_my_person_id())
          OR dogs.co_owner_id = (SELECT public.get_my_person_id())
        )
    )
  )
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM dogs
      WHERE dogs.id = training_goals.dog_id
        AND (
          dogs.owner_id = (SELECT public.get_my_person_id())
          OR dogs.co_owner_id = (SELECT public.get_my_person_id())
        )
    )
  );

CREATE POLICY "Users can delete own training goals"
  ON training_goals FOR DELETE
  USING (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM dogs
      WHERE dogs.id = training_goals.dog_id
        AND (
          dogs.owner_id = (SELECT public.get_my_person_id())
          OR dogs.co_owner_id = (SELECT public.get_my_person_id())
        )
    )
  );
