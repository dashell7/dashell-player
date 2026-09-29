import React from 'react';
import { useVocabularyStore } from '../../store/vocabularyStore';
import { t } from '../../i18n';

export function VocabularyStats() {
  const entries = useVocabularyStore((s) => s.entries);

  const stats = React.useMemo(() => {
    const unknown = entries.filter((e) => e.status === 'unknown').length;
    const learning = entries.filter((e) => e.status === 'learning').length;
    const mastered = entries.filter((e) => e.status === 'mastered').length;
    const total = entries.length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();
    const addedToday = entries.filter((e) => e.createdAt >= todayTs).length;

    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const addedThisWeek = entries.filter((e) => e.createdAt >= thisWeek.getTime()).length;

    return { unknown, learning, mastered, total, addedToday, addedThisWeek };
  }, [entries]);

  return (
    <div className="lp-vocab-stats">
      <StatCard label={t('vocab.total')} value={stats.total} color="var(--text-normal)" />
      <StatCard label={t('vocab.unknown')} value={stats.unknown} color="var(--lp-vocab-unknown)" />
      <StatCard label={t('vocab.learning')} value={stats.learning} color="var(--lp-vocab-learning)" />
      <StatCard label={t('vocab.mastered')} value={stats.mastered} color="var(--lp-vocab-mastered)" />
      <StatCard label={t('vocab.today')} value={stats.addedToday} color="var(--interactive-accent)" />
      <StatCard label={t('vocab.thisWeek')} value={stats.addedThisWeek} color="var(--interactive-accent)" />

      {/* Progress bar */}
      {stats.total > 0 && (
        <div className="lp-vocab-progress-wrap">
          <div className="lp-vocab-progress">
            <div style={{
              width: `${(stats.mastered / stats.total) * 100}%`,
            }} className="lp-vocab-progress-mastered" />
            <div style={{
              width: `${(stats.learning / stats.total) * 100}%`,
            }} className="lp-vocab-progress-learning" />
            <div style={{
              width: `${(stats.unknown / stats.total) * 100}%`,
            }} className="lp-vocab-progress-unknown" />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="lp-vocab-stat-card">
      <div className="lp-vocab-stat-value" style={{ color }}>{value}</div>
      <div className="lp-vocab-stat-label">{label}</div>
    </div>
  );
}
