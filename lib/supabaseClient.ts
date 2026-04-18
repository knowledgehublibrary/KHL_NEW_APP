import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://emidjsucmejyxepbbwuu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtaWRqc3VjbWVqeXhlcGJid3V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNDY1MjAsImV4cCI6MjA5MTkyMjUyMH0.cMTj62mu72Qn9SRLAJLKXjpmiI8SNkW0HYwJjg0O-D8'

export const supabase = createClient(supabaseUrl, supabaseKey)