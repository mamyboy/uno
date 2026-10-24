'use client';

import { m } from 'motion/react';
import { PlusCircle, Play, Users } from 'lucide-react';
import { PlayingCard } from '@/components/game/PlayingCard';
import { LinkButton } from '@/components/ui/Button';

const DECOR_CARDS: { color: 'RED' | 'YELLOW' | 'GREEN' | 'BLUE'; value: number; style: string; delay: number }[] = [
  { color: 'RED', value: 7, style: 'top-10 left-6 -rotate-12', delay: 0 },
  { color: 'BLUE', value: 3, style: 'top-24 right-10 rotate-6', delay: 0.3 },
  { color: 'YELLOW', value: 9, style: 'bottom-16 left-16 rotate-12', delay: 0.6 },
  { color: 'GREEN', value: 5, style: 'bottom-24 right-20 -rotate-6', delay: 0.9 },
];

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-[#081710] via-[#0f2b1d] to-black overflow-hidden">
      {DECOR_CARDS.map((c, i) => (
        <m.div
          key={i}
          className={`hidden md:block absolute ${c.style} animate-float`}
          style={{ animationDelay: `${c.delay}s` }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 0.85, scale: 1 }}
          transition={{ delay: c.delay, duration: 0.6 }}
        >
          <PlayingCard card={{ id: `decor-${i}`, kind: 'NUMBER', color: c.color, value: c.value }} size="lg" />
        </m.div>
      ))}

      <m.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-xl mx-auto space-y-6 relative z-10"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
          <Users className="w-4 h-4" /> Real-Time Multiplayer Card Game
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white drop-shadow-md">
          Color Match <span className="text-emerald-400">Arena</span>
        </h1>
        <p className="text-zinc-400 text-lg">
          เกมไพ่จับคู่สีและตัวเลขสุดมันส์ เล่นพร้อมกันแบบเรียลไทม์กับเพื่อนของคุณ ไม่ต้องลงทะเบียน!
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <LinkButton href="/create" variant="gold" size="lg" fullWidth className="sm:w-auto">
            <PlusCircle className="w-5 h-5" /> สร้างห้องใหม่
          </LinkButton>
          <LinkButton href="/join" variant="ghost" size="lg" fullWidth className="sm:w-auto">
            <Play className="w-5 h-5" /> เข้าร่วมห้อง
          </LinkButton>
        </div>
      </m.div>
    </main>
  );
}