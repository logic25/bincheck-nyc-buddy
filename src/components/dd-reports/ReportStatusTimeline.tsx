import { CheckCircle2, Loader2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = {
  key: string;
  label: string;
};

const STEPS: Step[] = [
  { key: 'ordered', label: 'Ordered' },
  { key: 'generating', label: 'Being Prepared' },
  { key: 'pending_review', label: 'Under Review' },
  { key: 'approved', label: 'Ready' },
];

const statusToStep: Record<string, number> = {
  draft: 0,
  ordered: 0,
  generating: 1,
  pending_review: 2,
  approved: 3,
};

interface ReportStatusTimelineProps {
  status: string;
  className?: string;
}

const ReportStatusTimeline = ({ status, className }: ReportStatusTimelineProps) => {
  const currentStep = statusToStep[status] ?? 0;

  return (
    <div className={cn('flex items-center gap-0', className)}>
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isActive = idx === currentStep;
        const isLast = idx === STEPS.length - 1;

        return (
          <div key={step.key} className="flex items-center">
            {/* Step node */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                  isCompleted && 'text-emerald-500',
                  isActive && status === 'approved' && 'text-emerald-500',
                  isActive && status !== 'approved' && 'text-primary',
                  !isCompleted && !isActive && 'text-muted-foreground/40',
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : isActive && status === 'generating' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isActive ? (
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                    status === 'approved' ? 'border-emerald-500 bg-emerald-500' : 'border-primary bg-primary/10'
                  )}>
                    <div className={cn('w-2 h-2 rounded-full', status === 'approved' ? 'bg-white' : 'bg-primary')} />
                  </div>
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium whitespace-nowrap leading-none',
                  isCompleted && 'text-emerald-500',
                  isActive && status === 'approved' && 'text-emerald-600 font-semibold',
                  isActive && status !== 'approved' && 'text-foreground font-semibold',
                  !isCompleted && !isActive && 'text-muted-foreground/50',
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {!isLast && (
              <div
                className={cn(
                  'h-px w-8 mb-4 mx-1',
                  idx < currentStep ? 'bg-emerald-400' : 'bg-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ReportStatusTimeline;
