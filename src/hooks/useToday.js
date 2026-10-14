import { useEffect, useState } from 'react';
import { dateKey } from '../data';
export default function useToday() {
  const [today, setToday] = useState(dateKey);
  useEffect(() => {
    let timer;
    const sync = () => {
      setToday(dateKey());
      clearTimeout(timer);
      const next = new Date();
      next.setHours(24, 0, 0, 30);
      timer = setTimeout(sync, next.getTime() - Date.now());
    };
    sync();
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return today;
}
