-- supabase_schema.sql
-- Create the conversations table
CREATE TABLE public.conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'model')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Create policies so users can only read and insert their own messages
CREATE POLICY "Users can insert their own messages" ON public.conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own messages" ON public.conversations
    FOR SELECT USING (auth.uid() = user_id);

-- Create an index for faster querying by user_id
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
