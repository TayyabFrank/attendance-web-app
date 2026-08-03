const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Use credentials provided by the user in env variables (using local/MongoDB fallback if not defined)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client initialized successfully');
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
  }
} else {
  console.log('Supabase credentials not found in env variables. Using MongoDB fallback.');
}

module.exports = supabase;
