import { useState, type FormEvent } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { login } from '../lib/api';
import { Button } from './Button';

interface LoginGateProps {
  onSuccess: () => void;
}

export function LoginGate({ onSuccess }: LoginGateProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-bg">
      <form onSubmit={submit} className="w-full max-w-xs bg-card border border-line rounded-2xl p-6">
        <div className="w-10 h-10 rounded-full bg-raised flex items-center justify-center mb-4">
          <Lock size={16} className="text-ink-5" />
        </div>
        <h1 className="text-[15px] font-semibold text-ink">Slidesmith</h1>
        <p className="text-[12px] text-ink-5 mt-1 mb-4">This deployment is password-protected.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full h-9 bg-surface border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
        />
        {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}
        <Button type="submit" variant="primary" fullWidth className="mt-3" disabled={busy || !password}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {busy ? 'Checking…' : 'Unlock'}
        </Button>
      </form>
    </div>
  );
}
