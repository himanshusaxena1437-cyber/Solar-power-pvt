import React, { useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Search,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AppSettings,
  DataEntryTask,
  SubmissionStatus,
  TaskCategory,
  TaskSubmission,
  UserProfile,
} from '../types';
import { formatINR, formatTimestamp, getTodayDateKey, TASK_CATEGORIES } from '../utils/solarData';
import { playSuccessChime } from '../utils/soundEffects';

interface DataEntryWorkViewProps {
  profile: UserProfile;
  settings: AppSettings;
  tasks: DataEntryTask[];
  submissions: TaskSubmission[];
  onNotify: (tone: 'success' | 'error' | 'info', title: string, detail?: string) => void;
}

export const DataEntryWorkView: React.FC<DataEntryWorkViewProps> = ({
  profile,
  settings,
  tasks,
  submissions,
  onNotify,
}) => {
  const todayKey = getTodayDateKey();
  const todayCount = submissions.filter((s) => s.dateKey === todayKey).length;
  const remainingToday = Math.max(0, settings.dailyPageLimit - todayCount);

  const dailyTargetPages = 100;
  const targetProgressPct = Math.min(100, Math.round((todayCount / dailyTargetPages) * 100));
  const remainingToTarget = Math.max(0, dailyTargetPages - todayCount);

  const progressStage =
    todayCount >= dailyTargetPages
      ? {
          barClass: 'bg-[#15803D]',
          textClass: 'text-[#15803D]',
          statusText: '100-Page Target Completed',
        }
      : targetProgressPct >= 80
        ? {
            barClass: 'bg-[#D97706]',
            textClass: 'text-[#B45309]',
            statusText: `Approaching Completion · ${remainingToTarget} pages left`,
          }
        : targetProgressPct >= 50
          ? {
              barClass: 'bg-[#EAB308]',
              textClass: 'text-[#A16207]',
              statusText: `Past Halfway · ${remainingToTarget} pages left`,
            }
          : {
              barClass: 'bg-[#94A3B8]',
              textClass: 'text-[#4A5D52]',
              statusText: `${remainingToTarget} pages to daily target`,
            };

  const submissionByTaskId = useMemo(() => {
    const map = new Map<string, TaskSubmission>();
    submissions.forEach((sub) => map.set(sub.taskId, sub));
    return map;
  }, [submissions]);

  const activeTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.isActive)
        .sort((a, b) => a.pageNumber - b.pageNumber),
    [tasks]
  );

  const openTasks = useMemo(
    () => activeTasks.filter((t) => !submissionByTaskId.has(t.id)),
    [activeTasks, submissionByTaskId]
  );

  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<'All' | TaskCategory>('All');

  const openTaskCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    openTasks.forEach((t) => {
      counts.set(t.category, (counts.get(t.category) || 0) + 1);
    });
    return counts;
  }, [openTasks]);

  const filteredOpenTasks = useMemo(() => {
    const q = taskSearchQuery.trim().toLowerCase();
    return openTasks.filter((t) => {
      if (taskCategoryFilter !== 'All' && t.category !== taskCategoryFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.sourceSiteLocation.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [openTasks, taskCategoryFilter, taskSearchQuery]);

  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [quickViewTask, setQuickViewTask] = useState<DataEntryTask | null>(null);
  const selectedTask = useMemo(() => {
    if (selectedTaskId) {
      const found = filteredOpenTasks.find((t) => t.id === selectedTaskId);
      if (found) return found;
    }
    return filteredOpenTasks[0] || openTasks[0] || null;
  }, [filteredOpenTasks, openTasks, selectedTaskId]);

  useEffect(() => {
    if (!quickViewTask) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQuickViewTask(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickViewTask]);

  const getCategoryGuidance = (category: TaskCategory): string => {
    switch (category) {
      case 'Verification':
        return 'Cross-check all customer, meter, and subsidy identifiers against the official source sheet before submitting for verification.';
      case 'Reading':
        return 'Record the exact meter number, kWh generation figure (including units), and billing date without rounding or reformatting.';
      case 'Correction':
        return 'Carefully transcribe the corrected site location, record ID, and updated telemetry values exactly as listed on the field sheet.';
      case 'Inverter Telemetry':
        return 'Log inverter telemetry identifiers, MPPT kWh output, and site metadata accurately to preserve grid diagnostics.';
      case 'Customer Billing':
        return 'Transcribe net-metering billing details, customer entity spelling, and cycle dates with zero typographical variance.';
      case 'Panel Inspection':
        return 'Enter array inspection site details, meter reference, and recorded kWh benchmark from the maintenance report.';
      case 'Grid Feed-In':
        return 'Verify substation feed-in customer co-op, meter code, and peak export kWh reading before submitting.';
      case 'Subsidy Record':
        return 'Ensure beneficiary name, installation site, and subsidy record ID match the government dispatch sheet verbatim.';
    }
  };

  const configuredTimerSeconds = Math.min(
    3600,
    Math.max(30, Math.round(settings.taskTimerSeconds ?? 180))
  );
  const [secondsRemaining, setSecondsRemaining] = useState(configuredTimerSeconds);
  const [timerPaused, setTimerPaused] = useState(false);

  useEffect(() => {
    setSecondsRemaining(configuredTimerSeconds);
    setTimerPaused(false);
  }, [selectedTask?.id, configuredTimerSeconds]);

  useEffect(() => {
    if (!selectedTask || timerPaused || secondsRemaining <= 0) return;
    const interval = window.setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [selectedTask, timerPaused, secondsRemaining]);

  const timerMinutes = Math.floor(secondsRemaining / 60);
  const timerSeconds = secondsRemaining % 60;
  const formattedCountdown = `${String(timerMinutes).padStart(2, '0')}:${String(timerSeconds).padStart(2, '0')}`;
  const lowTimeThreshold = Math.min(30, Math.round(configuredTimerSeconds * 0.25));
  const timerState =
    secondsRemaining === 0
      ? { colorClass: 'text-[#DC2626]', label: 'Idle Timeout' }
      : timerPaused
        ? { colorClass: 'text-[#4A5D52]', label: 'Paused' }
        : secondsRemaining <= lowTimeThreshold
          ? { colorClass: 'text-[#B45309]', label: 'Low Time' }
          : { colorClass: 'text-[#15803D]', label: 'Focus Active' };

  // Entry fields
  const [enteredRecordId, setEnteredRecordId] = useState('');
  const [enteredCustomerName, setEnteredCustomerName] = useState('');
  const [enteredSiteLocation, setEnteredSiteLocation] = useState('');
  const [enteredMeterNumber, setEnteredMeterNumber] = useState('');
  const [enteredKwhReading, setEnteredKwhReading] = useState('');
  const [enteredBillingDate, setEnteredBillingDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // History filter
  const [statusFilter, setStatusFilter] = useState<'All' | SubmissionStatus>('All');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState<'All' | string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const resetEntryForm = () => {
    setEnteredRecordId('');
    setEnteredCustomerName('');
    setEnteredSiteLocation('');
    setEnteredMeterNumber('');
    setEnteredKwhReading('');
    setEnteredBillingDate('');
  };

  const handleRestartTimer = () => {
    setSecondsRemaining(configuredTimerSeconds);
    setTimerPaused(false);
  };

  const handleSelectTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    resetEntryForm();
    handleRestartTimer();
  };

  const handleStartFromQuickView = (task: DataEntryTask) => {
    handleSelectTask(task.id);
    setQuickViewTask(null);
  };

  const handleSubmitPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    if (profile.accountStatus !== 'active') {
      onNotify('error', 'Account Suspended', 'Contact an administrator to reactivate submissions.');
      return;
    }
    if (remainingToday <= 0) {
      onNotify(
        'error',
        'Daily Limit Reached',
        `You have reached the ${settings.dailyPageLimit} page daily limit.`
      );
      return;
    }
    if (submissionByTaskId.has(selectedTask.id)) {
      onNotify('error', 'Duplicate Prevented', 'You have already submitted this page.');
      return;
    }

    const docId = `${profile.uid}_${selectedTask.id}`;
    setSubmitting(true);
    try {
      await setDoc(doc(db, 'submissions', docId), {
        userId: profile.uid,
        userName: profile.name,
        userCode: profile.userCode,
        taskId: selectedTask.id,
        taskTitle: selectedTask.title,
        taskCategory: selectedTask.category,
        pageNumber: selectedTask.pageNumber,
        dateKey: todayKey,
        enteredRecordId: enteredRecordId.trim(),
        enteredCustomerName: enteredCustomerName.trim(),
        enteredSiteLocation: enteredSiteLocation.trim(),
        enteredMeterNumber: enteredMeterNumber.trim(),
        enteredKwhReading: enteredKwhReading.trim(),
        enteredBillingDate: enteredBillingDate.trim(),
        rewardAmount: settings.perPageReward,
        creditedAmount: 0,
        status: 'Pending',
        rejectionReason: '',
        verifiedBy: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetEntryForm();
      setSelectedTaskId('');
      playSuccessChime('submit');
      onNotify(
        'success',
        `Page #${selectedTask.pageNumber} Submitted`,
        `${formatINR(settings.perPageReward)} will be credited after admin verification.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `submissions/${docId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      if (statusFilter !== 'All' && sub.status !== statusFilter) return false;
      if (historyCategoryFilter !== 'All' && sub.taskCategory !== historyCategoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          sub.taskTitle.toLowerCase().includes(q) ||
          sub.enteredRecordId.toLowerCase().includes(q) ||
          sub.enteredCustomerName.toLowerCase().includes(q) ||
          sub.taskCategory.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [submissions, statusFilter, historyCategoryFilter, searchQuery]);

  const verifiedCount = submissions.filter((s) => s.status === 'Verified').length;
  const pendingCount = submissions.filter((s) => s.status === 'Pending').length;
  const rejectedCount = submissions.filter((s) => s.status === 'Rejected').length;

  return (
    <div className="space-y-6">
      {/* Header Summary Strip */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-[#0F1F16]">
              Data Entry Workbench
            </h1>
            <p className="text-xs text-[#4A5D52] mt-0.5">
              Transcribe each solar source sheet accurately. Payment of{' '}
              <span className="font-mono font-semibold text-[#15803D]">
                {formatINR(settings.perPageReward)}
              </span>{' '}
              per page is credited only after verification.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div>
              <span className="text-[#4A5D52]">Today&apos;s Quota</span>
              <p className="font-mono text-sm font-bold text-[#0F1F16] tabular-nums">
                {todayCount} / {settings.dailyPageLimit} pages
              </p>
            </div>
            <div>
              <span className="text-[#4A5D52]">Verified</span>
              <p className="font-mono text-sm font-bold text-[#15803D] tabular-nums">
                {verifiedCount}
              </p>
            </div>
            <div>
              <span className="text-[#4A5D52]">Pending Review</span>
              <p className="font-mono text-sm font-bold text-[#CA8A04] tabular-nums">
                {pendingCount}
              </p>
            </div>
            <div>
              <span className="text-[#4A5D52]">Available Queue</span>
              <p className="font-mono text-sm font-bold text-[#0F1F16] tabular-nums">
                {openTasks.length} pages
              </p>
            </div>
          </div>
        </div>

        {/* Daily 100-Page Target Progress Bar */}
        <div className="pt-4 border-t border-[#EEF3EF] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#0F1F16]">Daily 100-Page Target</span>
              <span className={`font-medium ${progressStage.textClass}`}>
                · {progressStage.statusText}
              </span>
            </div>
            <span className="font-mono font-semibold text-[#0F1F16] tabular-nums">
              {todayCount} / {dailyTargetPages} pages ({targetProgressPct}%)
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="Daily progress toward 100-page target"
            aria-valuenow={Math.min(todayCount, dailyTargetPages)}
            aria-valuemin={0}
            aria-valuemax={dailyTargetPages}
            className="w-full h-3 rounded-full bg-[#EEF3EF] overflow-hidden"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressStage.barClass}`}
              style={{ width: `${targetProgressPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-[#4A5D52] tabular-nums">
            <span>0</span>
            <span>50 pages</span>
            <span>80 pages</span>
            <span>100 target</span>
          </div>
        </div>
      </div>

      {profile.accountStatus !== 'active' && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2.5">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Your account is currently suspended. New task submissions are locked.</span>
        </div>
      )}

      {/* Active Task Workbench */}
      {openTasks.length === 0 ? (
        <div className="bg-white border border-[#DCE6DE] rounded-xl p-8 text-center">
          <FileText className="w-8 h-8 text-[#15803D] mx-auto mb-3" />
          <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
            All Active Pages Completed
          </h2>
          <p className="text-sm text-[#4A5D52] mt-1 max-w-md mx-auto">
            You have completed every available active data entry page in the queue. New pages added
            by administrators will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Queue Selector */}
          <div className="lg:col-span-4 bg-white border border-[#DCE6DE] rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#EEF3EF]">
              <h2 className="font-display text-sm font-semibold text-[#0F1F16]">
                Available Pages ({filteredOpenTasks.length}
                {taskSearchQuery.trim() || taskCategoryFilter !== 'All'
                  ? ` of ${openTasks.length}`
                  : ''}
                )
              </h2>
              <span className="font-mono text-xs text-[#15803D]">
                +{formatINR(settings.perPageReward)}/page
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-[#4A5D52] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                  placeholder="Search title or site location..."
                  aria-label="Filter available tasks by title or site location"
                  className="w-full pl-9 pr-8 py-2 text-xs bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                />
                {taskSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTaskSearchQuery('')}
                    aria-label="Clear task search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A5D52] hover:text-[#0F1F16]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={taskCategoryFilter}
                onChange={(e) => setTaskCategoryFilter(e.target.value as 'All' | TaskCategory)}
                aria-label="Filter available tasks by category"
                className="w-full px-3 py-2 text-xs font-medium text-[#0F1F16] bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
              >
                <option value="All">All Categories ({openTasks.length})</option>
                {TASK_CATEGORIES.map((category) => {
                  const count = openTaskCategoryCounts.get(category) || 0;
                  return (
                    <option key={category} value={category}>
                      {category} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="mt-3 space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {filteredOpenTasks.length === 0 ? (
                <div className="py-8 px-3 text-center space-y-2">
                  <p className="text-xs text-[#4A5D52]">
                    No available tasks match the current search or category filter.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTaskSearchQuery('');
                      setTaskCategoryFilter('All');
                    }}
                    className="text-xs font-semibold text-[#15803D] hover:underline"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                filteredOpenTasks.map((task) => {
                  const isSelected = selectedTask?.id === task.id;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setQuickViewTask(task)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-[#DCFCE7]/50 border-[#15803D]'
                          : 'bg-[#F7FAF7] border-[#DCE6DE] hover:border-[#15803D]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-[#4A5D52]">
                        <span className="font-mono font-semibold text-[#0F1F16]">
                          Page #{String(task.pageNumber).padStart(3, '0')}
                        </span>
                        <span>{task.category}</span>
                      </div>
                      <p className="text-sm font-medium text-[#0F1F16] mt-1 truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-[#4A5D52] truncate">
                          {task.sourceSiteLocation}
                        </p>
                        <span className="text-[11px] font-semibold text-[#15803D] inline-flex items-center gap-1 shrink-0">
                          <Eye className="w-3 h-3" />
                          Quick View
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Source Sheet + Entry Form */}
          {selectedTask && (
            <div className="lg:col-span-8 bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#EEF3EF]">
                <div>
                  <p className="text-xs text-[#4A5D52]">
                    Page #{selectedTask.pageNumber} · {selectedTask.category}
                  </p>
                  <h2 className="font-display text-lg font-bold text-[#0F1F16] mt-0.5">
                    {selectedTask.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2.5 text-xs">
                    <div className="text-right">
                      <span className={`font-medium block ${timerState.colorClass}`}>
                        {timerState.label}
                      </span>
                      <span
                        aria-live="polite"
                        className={`font-mono text-sm font-bold tabular-nums inline-flex items-center gap-1 ${timerState.colorClass}`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {formattedCountdown}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTimerPaused((p) => !p)}
                      disabled={secondsRemaining === 0}
                      aria-label={timerPaused ? 'Resume task timer' : 'Pause task timer'}
                      title={timerPaused ? 'Resume Timer' : 'Pause Timer'}
                      className="p-1.5 rounded-lg border border-[#DCE6DE] bg-[#F7FAF7] text-[#4A5D52] hover:text-[#0F1F16] disabled:opacity-40 transition-colors"
                    >
                      {timerPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleRestartTimer}
                      aria-label="Restart task timer"
                      title="Restart Timer"
                      className="p-1.5 rounded-lg border border-[#DCE6DE] bg-[#F7FAF7] text-[#4A5D52] hover:text-[#0F1F16] transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="font-mono text-sm font-semibold text-[#15803D] whitespace-nowrap">
                    Reward: {formatINR(settings.perPageReward)}
                  </span>
                </div>
              </div>

              {secondsRemaining === 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-800 flex flex-wrap items-center justify-between gap-3">
                  <span>
                    Task focus timer reached 00:00. Restart your session timer to stay active and avoid idling.
                  </span>
                  <button
                    type="button"
                    onClick={handleRestartTimer}
                    className="px-3 py-1 rounded-md bg-white border border-red-200 text-red-700 font-semibold hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
                  >
                    Restart Timer
                  </button>
                </div>
              )}

              {/* Source Document Card */}
              <div className="rounded-lg bg-[#F0F5F1] border border-[#DCE6DE] p-4 space-y-3">
                <p className="text-xs font-semibold text-[#15803D]">
                  Source Solar Operations Sheet (Copy Exact Values Below)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[#4A5D52] block">Record ID</span>
                    <span className="font-mono font-semibold text-[#0F1F16] select-all">
                      {selectedTask.sourceRecordId}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#4A5D52] block">Customer / Site Entity</span>
                    <span className="font-medium text-[#0F1F16] select-all">
                      {selectedTask.sourceCustomerName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#4A5D52] block">Site Location</span>
                    <span className="font-medium text-[#0F1F16] select-all">
                      {selectedTask.sourceSiteLocation}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#4A5D52] block">Meter Number</span>
                    <span className="font-mono font-semibold text-[#0F1F16] select-all">
                      {selectedTask.sourceMeterNumber}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#4A5D52] block">kWh Reading</span>
                    <span className="font-mono font-semibold text-[#0F1F16] select-all">
                      {selectedTask.sourceKwhReading}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#4A5D52] block">Billing / Log Date</span>
                    <span className="font-mono font-semibold text-[#0F1F16] select-all">
                      {selectedTask.sourceBillingDate}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#4A5D52] pt-2 border-t border-[#DCE6DE]">
                  Field Notes: {selectedTask.sourceNotes}
                </p>
              </div>

              {/* Operator Input Form */}
              <form onSubmit={handleSubmitPage} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                      Enter Record ID
                    </label>
                    <input
                      type="text"
                      required
                      value={enteredRecordId}
                      onChange={(e) => setEnteredRecordId(e.target.value)}
                      placeholder={selectedTask.sourceRecordId}
                      className="w-full px-3 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                      Enter Customer / Entity Name
                    </label>
                    <input
                      type="text"
                      required
                      value={enteredCustomerName}
                      onChange={(e) => setEnteredCustomerName(e.target.value)}
                      placeholder={selectedTask.sourceCustomerName}
                      className="w-full px-3 py-2 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                      Enter Site Location
                    </label>
                    <input
                      type="text"
                      required
                      value={enteredSiteLocation}
                      onChange={(e) => setEnteredSiteLocation(e.target.value)}
                      placeholder={selectedTask.sourceSiteLocation}
                      className="w-full px-3 py-2 text-sm bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                      Enter Meter Number
                    </label>
                    <input
                      type="text"
                      required
                      value={enteredMeterNumber}
                      onChange={(e) => setEnteredMeterNumber(e.target.value)}
                      placeholder={selectedTask.sourceMeterNumber}
                      className="w-full px-3 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                      Enter kWh Reading
                    </label>
                    <input
                      type="text"
                      required
                      value={enteredKwhReading}
                      onChange={(e) => setEnteredKwhReading(e.target.value)}
                      placeholder={selectedTask.sourceKwhReading}
                      className="w-full px-3 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#4A5D52] mb-1">
                      Enter Billing / Log Date
                    </label>
                    <input
                      type="text"
                      required
                      value={enteredBillingDate}
                      onChange={(e) => setEnteredBillingDate(e.target.value)}
                      placeholder={selectedTask.sourceBillingDate}
                      className="w-full px-3 py-2 text-sm font-mono bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                  <p className="text-xs text-[#4A5D52] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-[#CA8A04]" />
                    Double-check values before submitting; duplicate submissions are disabled.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting || remainingToday <= 0 || profile.accountStatus !== 'active'}
                    className="px-5 py-2.5 rounded-lg bg-[#15803D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>{submitting ? 'Submitting Page...' : 'Submit Page for Verification'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Completed & Pending Submissions Table */}
      <div className="bg-white border border-[#DCE6DE] rounded-xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0F1F16]">
              Submitted Pages History
            </h2>
            <p className="text-xs text-[#4A5D52]">
              {verifiedCount} Verified · {pendingCount} Pending · {rejectedCount} Rejected
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#4A5D52] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search page or record ID"
                className="pl-9 pr-3 py-1.5 text-xs bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
              />
            </div>

            <select
              value={historyCategoryFilter}
              onChange={(e) => setHistoryCategoryFilter(e.target.value)}
              aria-label="Filter submitted pages by category"
              className="px-3 py-1.5 text-xs font-medium text-[#0F1F16] bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg focus:outline-none focus:border-[#15803D]"
            >
              <option value="All">All Categories</option>
              {TASK_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 p-1 bg-[#F0F5F1] rounded-lg">
              {(['All', 'Pending', 'Verified', 'Rejected'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === tab
                      ? 'bg-white text-[#0F1F16] shadow-xs'
                      : 'text-[#4A5D52] hover:text-[#0F1F16]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredSubmissions.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#4A5D52]">
            No task submissions match the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#DCE6DE] text-xs font-medium text-[#4A5D52]">
                  <th className="py-2.5 pr-4">Page</th>
                  <th className="py-2.5 px-4">Record ID</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Submitted</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 pl-4 text-right">Credited</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF3EF]">
                {filteredSubmissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-[#F7FAF7]">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-[#0F1F16]">{sub.taskTitle}</p>
                      <p className="text-xs text-[#4A5D52]">
                        Page #{sub.pageNumber} · {sub.taskCategory}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-[#0F1F16]">
                      {sub.enteredRecordId}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#4A5D52]">
                      {sub.enteredCustomerName}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-[#4A5D52] whitespace-nowrap">
                      {formatTimestamp(sub.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      {sub.status === 'Verified' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      )}
                      {sub.status === 'Pending' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#CA8A04]">
                          <Clock className="w-3.5 h-3.5" />
                          Pending
                        </span>
                      )}
                      {sub.status === 'Rejected' && (
                        <div>
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC2626]">
                            <XCircle className="w-3.5 h-3.5" />
                            Rejected
                          </span>
                          {sub.rejectionReason && (
                            <p className="text-xs text-[#DC2626] mt-0.5">{sub.rejectionReason}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pl-4 text-right font-mono font-semibold tabular-nums">
                      {sub.status === 'Verified' ? (
                        <span className="text-[#15803D]">+{formatINR(sub.creditedAmount)}</span>
                      ) : (
                        <span className="text-[#4A5D52]">{formatINR(0)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick View Modal */}
      {quickViewTask && (
        <div
          className="fixed inset-0 z-50 bg-[#0F1F16]/45 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setQuickViewTask(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-view-task-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-[#DCE6DE] rounded-xl max-w-xl w-full p-6 space-y-5 shadow-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#EEF3EF]">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#15803D]">
                  Quick View · Page #{String(quickViewTask.pageNumber).padStart(3, '0')} · {quickViewTask.category}
                </p>
                <h2
                  id="quick-view-task-title"
                  className="font-display text-lg font-bold text-[#0F1F16] mt-1"
                >
                  {quickViewTask.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setQuickViewTask(null)}
                aria-label="Close quick view modal"
                className="p-1.5 rounded-lg border border-[#DCE6DE] text-[#4A5D52] hover:text-[#0F1F16] hover:bg-[#F7FAF7] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-[#4A5D52] block">Verified Payout</span>
                <span className="font-mono text-sm font-bold text-[#15803D] tabular-nums">
                  {formatINR(settings.perPageReward)}
                </span>
              </div>
              <div>
                <span className="text-[#4A5D52] block">Focus Timer</span>
                <span className="font-mono text-sm font-bold text-[#0F1F16] tabular-nums">
                  {Math.floor(configuredTimerSeconds / 60)}m {String(configuredTimerSeconds % 60).padStart(2, '0')}s
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[#4A5D52] block">Daily Quota Left</span>
                <span className="font-mono text-sm font-bold text-[#0F1F16] tabular-nums">
                  {remainingToday} / {settings.dailyPageLimit}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EEF3EF] space-y-2 text-xs">
              <h3 className="font-display text-sm font-semibold text-[#0F1F16]">
                Task Instructions
              </h3>
              <p className="text-[#4A5D52] leading-relaxed">
                {getCategoryGuidance(quickViewTask.category)}
              </p>
              <p className="text-[#0F1F16] bg-[#F7FAF7] border border-[#DCE6DE] rounded-lg px-3 py-2">
                <span className="font-semibold">Field Context ({quickViewTask.sourceSiteLocation}):</span>{' '}
                {quickViewTask.sourceNotes}
              </p>
            </div>

            <div className="pt-4 border-t border-[#EEF3EF] space-y-2 text-xs">
              <h3 className="font-display text-sm font-semibold text-[#0F1F16]">
                Verification Requirements
              </h3>
              <ul className="space-y-1.5 text-[#4A5D52] list-disc pl-4">
                <li>
                  Transcribe all 6 required fields accurately: <strong className="text-[#0F1F16]">Record ID</strong>,{' '}
                  <strong className="text-[#0F1F16]">Customer / Site Entity</strong>,{' '}
                  <strong className="text-[#0F1F16]">Site Location</strong>,{' '}
                  <strong className="text-[#0F1F16]">Meter Number</strong>,{' '}
                  <strong className="text-[#0F1F16]">kWh Reading</strong>, and{' '}
                  <strong className="text-[#0F1F16]">Billing / Log Date</strong>.
                </li>
                <li>
                  Match capitalization, hyphens, and units (such as <span className="font-mono">kWh</span>) exactly as printed on the source sheet.
                </li>
                <li>
                  Each page can be submitted only once; {formatINR(settings.perPageReward)} is credited after administrator verification.
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-[#EEF3EF] flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setQuickViewTask(null)}
                className="px-4 py-2 rounded-lg border border-[#DCE6DE] bg-white text-xs font-semibold text-[#4A5D52] hover:text-[#0F1F16] hover:bg-[#F7FAF7] transition-colors whitespace-nowrap"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleStartFromQuickView(quickViewTask)}
                className="px-5 py-2 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Working on Page #{quickViewTask.pageNumber}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
