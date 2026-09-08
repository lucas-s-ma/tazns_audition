'use client';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
export function Realtime({ refresh }: { refresh: () => void }) {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let timer: ReturnType<typeof setTimeout>;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    };
    const channel = client
      .channel('audition-change-signal')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'change_signal' }, reload)
      .subscribe((status) => {
        setOnline(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') refresh();
      });
    // Periodic reconciliation also recovers events missed while sleeping/disconnected.
    const poll = setInterval(refresh, 15000);
    const heartbeat = setInterval(() => void api('heartbeat', {}).catch(() => {}), 60000);
    const focus = () => {
      refresh();
      void api('heartbeat', {}).catch(() => {});
    };
    window.addEventListener('focus', focus);
    window.addEventListener('online', focus);
    void api('heartbeat', {}).catch(() => {});
    return () => {
      clearInterval(poll);
      clearInterval(heartbeat);
      clearTimeout(timer);
      window.removeEventListener('focus', focus);
      window.removeEventListener('online', focus);
      void client.removeChannel(channel);
    };
  }, [refresh]);
  return (
    <span className={`connection ${online ? 'connected' : ''}`}>
      <i />
      {online ? 'Live sync' : 'Reconnecting · checks every 15s'}
    </span>
  );
}
