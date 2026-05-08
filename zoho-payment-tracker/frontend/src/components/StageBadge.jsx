import React from 'react';

const STAGE_COLORS = {
  'Qualification': 'bg-yellow-100 text-yellow-800',
  'Value Proposition': 'bg-blue-100 text-blue-800',
  'Id. Decision Makers': 'bg-purple-100 text-purple-800',
  'Perception Analysis': 'bg-indigo-100 text-indigo-800',
  'Proposal/Price Quote': 'bg-orange-100 text-orange-800',
  'Negotiation/Review': 'bg-pink-100 text-pink-800',
  'Closed Won': 'bg-green-100 text-green-800',
  'Closed Lost': 'bg-red-100 text-red-800',
};

export default function StageBadge({ stage }) {
  if (!stage) return <span className="text-gray-400">—</span>;

  const colorClass = STAGE_COLORS[stage] || 'bg-gray-100 text-gray-700';

  return <span className={`badge ${colorClass}`}>{stage}</span>;
}
