-- Enable RLS if not already enabled (this should already be enabled)
ALTER TABLE public.user ENABLE ROW LEVEL SECURITY;

-- Create INSERT policy for authenticated users to create their own profiles
DROP POLICY IF EXISTS "Users can create their own profiles" ON public.user;
CREATE POLICY "Users can create their own profiles" 
ON public.user 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Create UPDATE policy for authenticated users to update their own profiles
DROP POLICY IF EXISTS "Users can update their own profiles" ON public.user;
CREATE POLICY "Users can update their own profiles" 
ON public.user 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Create DELETE policy for authenticated users to delete their own profiles
DROP POLICY IF EXISTS "Users can delete their own profiles" ON public.user;
CREATE POLICY "Users can delete their own profiles" 
ON public.user 
FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);