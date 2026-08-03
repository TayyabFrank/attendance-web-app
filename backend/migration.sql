-- Enable the pgvector extension to enable vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Create profiles table (representing employees with their face embeddings)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    employee_id TEXT UNIQUE NOT NULL,
    face_embedding vector(512),
    password TEXT,
    role TEXT DEFAULT 'employee',
    face_photo TEXT,
    face_photos TEXT[],
    department TEXT,
    departure_time TEXT DEFAULT '05:00 PM',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure the face_embedding column exists if table already existed
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS face_embedding vector(512);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'employee';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS face_photo TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS face_photos TEXT[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS departure_time TEXT DEFAULT '05:00 PM';

-- Create an ivfflat index with vector_cosine_ops for cosine distance queries
-- set to 100 lists for sub-10ms high-concurrency lookups.
CREATE INDEX IF NOT EXISTS profiles_face_embedding_cosine_idx 
ON public.profiles 
USING ivfflat (face_embedding vector_cosine_ops) 
WITH (lists = 100);

-- Create single-use database challenge token table to block replay attacks
CREATE TABLE IF NOT EXISTS public.challenge_tokens (
    token TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create requests table in Supabase
CREATE TABLE IF NOT EXISTS public.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL,
    name TEXT NOT NULL,
    request_type TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT DEFAULT 'Pending' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create attendance table if it does not exist (for syncing logs from backend)
CREATE TABLE IF NOT EXISTS public.attendance (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT DEFAULT '--:--',
    check_out TEXT DEFAULT '--:--',
    status TEXT DEFAULT 'Pending',
    confidence TEXT DEFAULT '--',
    photo TEXT,
    tasks TEXT DEFAULT '',
    work_done TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS tasks TEXT DEFAULT '';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS work_done TEXT DEFAULT '';

-- Create the stored Postgres RPC function 'match_user_face' using Cosine Distance (<=>)
CREATE OR REPLACE FUNCTION match_user_face(
  query_embedding vector(512),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  employee_id TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    profiles.id,
    profiles.name,
    profiles.employee_id,
    (1 - (profiles.face_embedding <=> query_embedding))::FLOAT AS similarity
  FROM profiles
  WHERE profiles.face_embedding IS NOT NULL
    AND (1 - (profiles.face_embedding <=> query_embedding)) > match_threshold
  ORDER BY profiles.face_embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;
