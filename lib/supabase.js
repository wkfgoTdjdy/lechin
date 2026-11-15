import { createClient } from '@supabase/supabase-js';

// .env.local 의 값을 쓴다. 비어 있으면 null → 가입 없이 오두막만 혼자 둘러보는 모드.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
