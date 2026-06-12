// Shared application source badge utilities

export interface SourceBadge {
  label: string;
  color: string; // tailwind text color
  bgColor: string; // tailwind bg color
}

const SOURCE_MAP: Record<string, SourceBadge> = {
  'DOB NOW Build': {
    label: 'BUILD',
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/40',
  },
  'DOB NOW Electrical': {
    label: 'Electrical',
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/40',
  },
  'DOB NOW Limited Alteration': {
    label: 'LAA',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/40',
  },
  'DOB NOW Limited Alt': {
    label: 'LAA',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/40',
  },
  'DOB NOW Elevator': {
    label: 'Elevator',
    color: 'text-violet-700 dark:text-violet-300',
    bgColor: 'bg-violet-100 dark:bg-violet-900/40',
  },
  'DOB BIS': {
    label: 'BIS',
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/40',
  },
  'BIS_SCRAPE': {
    label: 'BIS',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/40',
  },
  'MERGED': {
    label: 'BIS+',
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/40',
  },
};

export function getSourceBadge(source: string): SourceBadge {
  return SOURCE_MAP[source] || {
    label: source,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  };
}
