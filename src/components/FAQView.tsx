import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  HelpCircle,
  Search,
  X,
} from 'lucide-react';
import type { ActiveTab, AppSettings } from '../types';
import { formatINR } from '../utils/solarData';

type FAQCategory = 'Tasks' | 'Earnings' | 'Withdrawals';

interface FAQItem {
  id: string;
  category: FAQCategory;
  question: string;
  answer: string;
  actionTab?: ActiveTab;
  actionLabel?: string;
}

interface FAQViewProps {
  settings: AppSettings;
  onNavigate: (tab: ActiveTab) => void;
}

export const FAQView: React.FC<FAQViewProps> = ({ settings, onNavigate }) => {
  const [selectedCategory, setSelectedCategory] = useState<'All' | FAQCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({
    'tasks-limit': true,
    'earnings-credit': true,
    'withdrawals-min': true,
  });

  const faqItems: FAQItem[] = useMemo(
    () => [
      {
        id: 'tasks-limit',
        category: 'Tasks',
        question: 'How many data entry pages can I complete each day?',
        answer: `You can submit up to ${settings.dailyPageLimit} data entry pages per day. Your Data Entry Workbench also tracks a 100-page daily progress milestone and displays your remaining daily quota in real time.`,
        actionTab: 'work',
        actionLabel: 'Open Data Entry Workbench',
      },
      {
        id: 'tasks-accuracy',
        category: 'Tasks',
        question: 'How do I ensure my submitted pages pass admin verification?',
        answer:
          'Copy every value from the Source Solar Operations Sheet exactly as shown—including Record ID, Customer / Site Entity Name, Site Location, Meter Number, kWh Reading, and Billing Date. Submitting mismatched or incomplete values may result in rejection.',
      },
      {
        id: 'tasks-duplicate',
        category: 'Tasks',
        question: 'Can I submit the same page more than once?',
        answer:
          'No. Each operator is limited to one submission per page ID to prevent duplicate work. Once submitted, the page moves from your Available Queue to your Submitted Pages History.',
      },
      {
        id: 'tasks-rejected',
        category: 'Tasks',
        question: 'What happens if one of my submissions is rejected?',
        answer:
          'If an administrator rejects a page, the rejection reason appears directly under the status column in your Submitted Pages History. Rejected pages do not earn a reward, so always verify your entries before submitting.',
      },
      {
        id: 'earnings-credit',
        category: 'Earnings',
        question: 'How much do I earn per page and when is it added to my balance?',
        answer: `Each verified page earns ${formatINR(settings.perPageReward)}. At ${settings.dailyPageLimit} pages per day, the daily task earning potential is ${formatINR(settings.dailyPageLimit * settings.perPageReward)}. Earnings are credited only after an administrator verifies your submission.`,
      },
      {
        id: 'earnings-pending',
        category: 'Earnings',
        question: 'Why are my newly submitted pages not shown in my Available Balance yet?',
        answer:
          'Newly submitted pages start in Pending status. Until an administrator completes verification, those amounts remain excluded from your Total Earnings and Available Withdrawal Balance.',
      },
      {
        id: 'earnings-referral',
        category: 'Earnings',
        question: 'How do referral rewards work?',
        answer: `Share your unique referral code from the Referrals tab. Once a referred operator joins using your code, completes ${settings.referralEligibilityPages} verified pages, and passes admin eligibility approval, you receive a ${formatINR(settings.referralReward)} referral bonus.`,
        actionTab: 'referrals',
        actionLabel: 'View Referral Program',
      },
      {
        id: 'withdrawals-min',
        category: 'Withdrawals',
        question: 'What is the minimum withdrawal amount?',
        answer: `The minimum withdrawal threshold is ${formatINR(settings.minWithdrawal)}. Your Available Balance equals Total Earnings minus Total Withdrawn and any currently Pending withdrawal requests.`,
        actionTab: 'withdrawals',
        actionLabel: 'Go to Withdrawals',
      },
      {
        id: 'withdrawals-methods',
        category: 'Withdrawals',
        question: 'Which payout methods are supported?',
        answer:
          'You can request payouts via UPI (using your verified UPI ID) or Bank Transfer (Account Holder Name, Bank Name, Account Number, and IFSC Code). You can save your default payout details inside your Profile tab for faster requests.',
        actionTab: 'profile',
        actionLabel: 'Manage Payout Defaults in Profile',
      },
      {
        id: 'withdrawals-timing',
        category: 'Withdrawals',
        question: 'How long does withdrawal approval and payout processing take?',
        answer: `Withdrawals follow four statuses: Pending, Approved, Paid, or Rejected. Standard admin review and payout processing takes ${settings.withdrawalProcessingHours}. If a request is rejected due to incorrect payment details, the reserved funds return to your Available Balance.`,
      },
    ],
    [settings]
  );

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return faqItems.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [faqItems, selectedCategory, searchQuery]);

  const categoryCounts = useMemo(
    () => ({
      All: faqItems.length,
      Tasks: faqItems.filter((i) => i.category === 'Tasks').length,
      Earnings: faqItems.filter((i) => i.category === 'Earnings').length,
      Withdrawals: faqItems.filter((i) => i.category === 'Withdrawals').length,
    }),
    [faqItems]
  );

  const toggleItem = (id: string) => {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-[#15803D]">
            <HelpCircle className="w-4 h-4" />
            <span>Operator Support Center</span>
          </div>
          <h1 className="font-display text-xl font-bold text-[#0F1F16]">
            Frequently Asked Questions
          </h1>
          <p className="text-xs text-[#4A5D52]">
            Clear answers on daily data entry tasks, verification earnings, and withdrawal payouts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('profile')}
          className="px-4 py-2 rounded-lg border border-[#DCE6DE] bg-[#F7FAF7] text-xs font-semibold text-[#0F1F16] hover:bg-[#F0F5F1] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Profile</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F0F5F1] rounded-lg w-fit">
            {(['All', 'Tasks', 'Earnings', 'Withdrawals'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-white text-[#0F1F16] shadow-xs'
                    : 'text-[#4A5D52] hover:text-[#0F1F16]'
                }`}
              >
                {cat} ({categoryCounts[cat]})
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-[#4A5D52] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, earnings, payouts..."
              aria-label="Search frequently asked questions"
              className="w-full pl-9 pr-8 py-2 text-xs bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear FAQ search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A5D52] hover:text-[#0F1F16]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Accordion List */}
        {filteredItems.length === 0 ? (
          <div className="py-10 text-center space-y-2 border-t border-[#EEF3EF]">
            <p className="text-sm text-[#4A5D52]">
              No FAQ entries match &ldquo;{searchQuery}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
              className="text-xs font-semibold text-[#15803D] hover:underline"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#EEF3EF] border-t border-[#EEF3EF]">
            {filteredItems.map((item) => {
              const isOpen = Boolean(openIds[item.id]);
              return (
                <div key={item.id} className="py-4">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${item.id}`}
                    onClick={() => toggleItem(item.id)}
                    className="w-full text-left flex items-start justify-between gap-4 py-1 group"
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="text-[11px] font-medium text-[#15803D] block">
                        {item.category}
                      </span>
                      <span className="font-display text-sm sm:text-base font-semibold text-[#0F1F16] group-hover:text-[#15803D] transition-colors block">
                        {item.question}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-[#4A5D52] shrink-0 mt-1 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-[#15803D]' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div
                      id={`faq-panel-${item.id}`}
                      className="mt-2.5 pr-6 space-y-2.5 text-xs sm:text-sm text-[#4A5D52] leading-relaxed"
                    >
                      <p>{item.answer}</p>
                      {item.actionTab && item.actionLabel && (
                        <button
                          type="button"
                          onClick={() => onNavigate(item.actionTab!)}
                          className="text-xs font-semibold text-[#15803D] hover:underline inline-flex items-center gap-1"
                        >
                          <span>{item.actionLabel}</span>
                          <span aria-hidden="true">&rarr;</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
