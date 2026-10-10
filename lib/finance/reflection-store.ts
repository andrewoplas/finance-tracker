import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReflectionStore } from './reflections';

export function reflectionStore(db: SupabaseClient, owner: string): ReflectionStore {
  return {
    async read(month) {
      const { data, error } = await db.from('retro_plans').select('month,notes,updated_at').eq('user_id', owner).eq('month', month).maybeSingle();
      if (error) throw new Error('Read failed');
      return data;
    },
    async save(month, notes) {
      const { data, error } = await db.from('retro_plans').upsert({ user_id: owner, month, notes, updated_at: new Date().toISOString() }, { onConflict: 'user_id,month' }).select('month,notes,updated_at').single();
      if (error) throw new Error('Save failed');
      return data;
    },
  };
}
