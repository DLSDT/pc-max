import { assert, eq, oneOf } from '../harness.mjs';

export const name = 'billing';

export const tests = [
  {
    name: 'GET /subscriptions/plans lists purchasable plans',
    run: async (ctx) => {
      const r = await ctx.req('GET', '/subscriptions/plans');
      eq(r.status, 200, 'plans status');
      const plans = r.json?.data;
      assert(Array.isArray(plans) && plans.length > 0, 'expected at least one plan');
      for (const p of plans) {
        assert(typeof p.slug === 'string' && p.slug.length > 0, 'plan.slug');
        assert(typeof p.name === 'string' && p.name.length > 0, `plan ${p.slug} name`);
        assert(Number.isInteger(p.durationDays) && p.durationDays > 0, `plan ${p.slug} durationDays must be a positive integer`);
        assert(Number.isInteger(p.price) && p.price >= 0, `plan ${p.slug} price must be a non-negative integer`);
        assert(typeof p.currency === 'string' && p.currency.length === 3, `plan ${p.slug} currency must be a 3-letter code`);
        assert(Array.isArray(p.features), `plan ${p.slug} features must be an array`);
        assert(Number.isInteger(p.deviceLimit) && p.deviceLimit > 0, `plan ${p.slug} deviceLimit must be positive`);
      }
      const slugs = plans.map((p) => p.slug);
      eq(new Set(slugs).size, slugs.length, 'plan slugs must be unique');
    },
  },
  {
    name: 'longer plans are not priced above shorter ones per day',
    run: async (ctx) => {
      // A pricing table where a longer plan costs more per day than a shorter
      // one is almost always a data-entry slip, and it is user-visible.
      const r = await ctx.req('GET', '/subscriptions/plans');
      const byDuration = [...r.json.data].sort((a, b) => a.durationDays - b.durationDays);
      const perDay = byDuration.map((p) => ({ slug: p.slug, rate: p.price / p.durationDays }));
      for (let i = 1; i < perDay.length; i++) {
        assert(perDay[i].rate <= perDay[i - 1].rate + 0.001,
          `${perDay[i].slug} costs more per day (${perDay[i].rate.toFixed(1)}) than the shorter ${perDay[i - 1].slug} (${perDay[i - 1].rate.toFixed(1)})`);
      }
    },
  },
  {
    name: 'subscription state requires authentication',
    run: async (ctx) => {
      for (const p of ['/me/subscription', '/me/features']) {
        const r = await ctx.req('GET', p, { noCookies: true });
        eq(r.status, 401, `${p} must require auth`);
      }
    },
  },
  {
    name: 'purchase cannot be started anonymously',
    run: async (ctx) => {
      // A *valid* body on purpose: a schema error would 400 before the auth
      // guard runs, which would pass this test without proving anything.
      const plans = await ctx.req('GET', '/subscriptions/plans');
      const r = await ctx.req('POST', '/subscriptions/purchase', {
        body: { planId: plans.json.data[0].id, idempotencyKey: `e2e-${'a'.repeat(12)}` },
        noCookies: true,
      });
      eq(r.status, 401, 'anonymous purchase must be refused');
    },
  },
  {
    name: 'feature authorization cannot be claimed anonymously',
    run: async (ctx) => {
      // The gated features are keyed by capability, not by entitlement name.
      for (const feature of ['multi_frame_generation', 'windows_optimizer']) {
        const r = await ctx.req('POST', `/me/features/${feature}/authorize`, { body: {}, noCookies: true });
        eq(r.status, 401, `anonymous authorize of ${feature} must be refused`);
      }
    },
  },
  {
    name: 'a bogus payment callback fails cleanly, never with a 500',
    run: async (ctx) => {
      // A gateway callback is an unauthenticated, internet-facing endpoint —
      // it is the one place a crash is both reachable and attractive.
      for (const provider of ['zarinpal', 'mock', 'not-a-provider']) {
        const r = await ctx.req('GET', `/payments/${provider}/callback?Authority=bogus9f3a&Status=OK`, { noCookies: true });
        assert(r.status < 500, `${provider} callback returned ${r.status} — an unauthenticated 5xx`);
        assert(!/\bat\s+\w+\s+\(/.test(r.text), `${provider} callback leaked a stack trace`);
      }
    },
  },
  {
    name: 'admin payment listing requires auth and returns an envelope',
    run: async (ctx) => {
      const anon = await ctx.req('GET', '/admin/payments', { noCookies: true });
      eq(anon.status, 401, 'admin payments must require auth');
      const tok = await ctx.adminToken();
      const r = await ctx.req('GET', '/admin/payments', { token: tok });
      eq(r.status, 200, 'admin payments status');
      assert(Array.isArray(r.json?.data), 'admin payments .data must be an array');
    },
  },
  {
    name: 'admin subscription plans match the public list',
    run: async (ctx) => {
      const tok = await ctx.adminToken();
      const [pub, adm] = await Promise.all([
        ctx.req('GET', '/subscriptions/plans'),
        ctx.req('GET', '/admin/subscriptions/plans', { token: tok }),
      ]);
      eq(adm.status, 200, 'admin plans status');
      const pubSlugs = new Set(pub.json.data.map((p) => p.slug));
      const admList = adm.json?.data ?? [];
      // Every publicly purchasable plan must exist on the admin side; the
      // reverse need not hold (an admin may have unpublished drafts).
      for (const s of pubSlugs) {
        assert(admList.some((p) => p.slug === s), `plan ${s} is public but missing from the admin list`);
      }
    },
  },
];
