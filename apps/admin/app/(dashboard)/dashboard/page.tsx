'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Users, Activity, Gamepad2, Layers, Eye, Rocket } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { apiFetch, fmtDate } from '@/lib/api';
import type { DashboardResponse } from '@goh/types';

const STAT_CARDS = [
  { key: 'totalUsers', label: 'Total Users', icon: Users },
  { key: 'activeUsers7d', label: 'Active Users (7d)', icon: Activity },
  { key: 'totalGames', label: 'Total Games', icon: Gamepad2 },
  { key: 'publishedGames', label: 'Published', icon: Gamepad2 },
  { key: 'totalProfiles', label: 'Optimization Profiles', icon: Layers },
  { key: 'totalViews', label: 'Total Views', icon: Eye },
  { key: 'appVersions', label: 'App Versions', icon: Rocket },
] as const;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardResponse>('/admin/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="text-sm text-destructive">Failed to load dashboard: {error}</div>;
  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform overview and analytics</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="mt-1 text-2xl font-bold">{data.stats[key]}</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Views</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyViews} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="views" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(357 92% 47%)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(357 92% 47%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 16%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(215 20% 62%)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(215 20% 62%)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(222 44% 9%)', border: '1px solid hsl(217 33% 16%)', borderRadius: 8, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="views" stroke="hsl(357 92% 47%)" fill="url(#views)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most Viewed Games</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topGames.length === 0 && <p className="text-sm text-muted-foreground">No views recorded yet.</p>}
            {data.topGames.map((g, i) => (
              <div key={g.gameId} className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary text-xs font-semibold">
                  {g.coverUrl ? <img src={g.coverUrl} alt="" className="h-full w-full object-cover" /> : `#${i + 1}`}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground">{g.views} views</div>
                </div>
                <Badge variant="secondary">#{i + 1}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recently Added</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentGames.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">{g.name}</span>
                <span className="text-muted-foreground">{g.genres.map((x) => x.name).join(', ') || '—'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recently Updated</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentUpdates.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">{g.name}</span>
                <span className="text-muted-foreground">{fmtDate(g.updatedAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
