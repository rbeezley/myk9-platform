-- Allow authenticated users to insert their own profile records
DROP POLICY IF EXISTS "Users can create their own profiles" ON public.user;
CREATE POLICY "Users can create their own profiles" ON public.user
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update their own profiles  
DROP POLICY IF EXISTS "Users can update their own profiles" ON public.user;
CREATE POLICY "Users can update their own profiles" ON public.user
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);