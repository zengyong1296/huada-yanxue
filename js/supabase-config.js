/**
 * Supabase 配置文件
 *
 * 使用步骤：
 * 1. 注册 https://supabase.com 账号
 * 2. 创建新项目（Free 即可）
 * 3. 在左侧菜单找到 "SQL Editor"，粘贴并运行 supabase-setup.sql
 * 4. 在左侧菜单找到 "Settings" → "API"
 * 5. 复制 "Project URL" 和 "anon public" 密钥，粘贴到下方
 */

const SUPABASE_URL = 'https://bqyibvetyoooyogjtqeu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxeWlidmV0eW9vb3lvZ2p0cWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Njk5ODYsImV4cCI6MjA5OTE0NTk4Nn0.j5fixYec9ASscTeDTX8jvo6GdBr90sY3ZIQ4Y5FbMSg';

// ---- 以下不需要修改 ----

let _supabaseClient = null;

function getSupabase() {
  if (!_supabaseClient) {
    if (!isSupabaseConfigured()) {
      console.error('[Supabase] 未配置！请编辑 js/supabase-config.js');
      return null;
    }
    if (typeof window.supabase === 'undefined') {
      console.error('[Supabase] SDK 未加载，请检查网络连接');
      return null;
    }
    _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabaseClient;
}

function isSupabaseConfigured() {
  return SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
         SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' &&
         SUPABASE_URL.startsWith('https://');
}
