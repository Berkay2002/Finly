import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Reads `?add=1` once (from the quick-add sheet) and clears it from the URL. */
export function useAutoAdd(): boolean {
  const [params, setParams] = useSearchParams();
  const [auto] = useState(() => params.get('add') === '1');
  useEffect(() => {
    if (params.get('add') === '1') {
      const next = new URLSearchParams(params);
      next.delete('add');
      setParams(next, { replace: true });
    }
  }, []); // run once on mount
  return auto;
}
