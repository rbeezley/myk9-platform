-- Allow secretaries to read vaccinations for dogs they manage.
-- Secretaries need vaccination records to verify show entry compliance,
-- but should not see private health data (medications, allergies, vet visits).
-- Write access remains owner/co-owner/admin only (vaccinations_owner_access).

CREATE POLICY "vaccinations_secretary_select" ON vaccinations
  FOR SELECT TO authenticated
  USING (is_trial_secretary());
