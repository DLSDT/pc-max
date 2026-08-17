'use client';

import { useRouter } from 'next/navigation';
import { GameForm } from '@/components/game-form';
import type { GameDetail } from '@goh/types';

export default function NewGamePage() {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Add Game</h1>
        <p className="text-sm text-muted-foreground">Publishing makes the game visible in the desktop app immediately — no rebuild required.</p>
      </div>
      <GameForm onSaved={(g: GameDetail) => router.push(`/games/${g.id}`)} />
    </div>
  );
}
