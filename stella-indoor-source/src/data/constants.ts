import type { Court } from '@/types/booking';

export const COURTS: Court[] = [
  {
    id: 'big-court',
    name: 'Big Court',
    pricePerHour: 500,
    image: '/court-original-1.jpg',
    description: 'Our largest indoor court — one of the biggest in Durban. Perfect for soccer, full-court basketball, and large group training.',
  },
  {
    id: 'multi-1',
    name: 'Multipurpose Court 1',
    pricePerHour: 400,
    image: '/court-original-2.jpg',
    description: 'Versatile court ideal for hockey, netball, futsal, and small-group fitness sessions.',
  },
  {
    id: 'multi-2',
    name: 'Multipurpose Court 2',
    pricePerHour: 400,
    image: '/court-original-2.jpg',
    description: 'Versatile court ideal for hockey, netball, futsal, and small-group fitness sessions.',
  },
];

export const ADDON_ITEMS = [
  {
    id: 'soccerBall' as const,
    name: 'Soccer Ball',
    description: 'Premium match ball',
    price: 10,
    image: '/addon-soccer.jpg',
  },
  {
    id: 'bibs' as const,
    name: 'Bibs (Set of 5)',
    description: 'Team training bibs, assorted colors',
    price: 10,
    image: '/addon-bibs.jpg',
  },
];

export const OPERATING_HOURS = {
  weekday: { start: 8, end: 22 },
  sunday: { start: 8, end: 22 },
};

export const DURATION_OPTIONS: { value: 1 | 1.5 | 2; label: string; shortLabel: string }[] = [
  { value: 1, label: '1 Hour', shortLabel: '1 HR' },
  { value: 1.5, label: '1 Hour 30 Min', shortLabel: '1.5 HR' },
  { value: 2, label: '2 Hours', shortLabel: '2 HR' },
];

// 3-step flow
export const STEP_LABELS = ['COURT', 'TIME', 'ADD-ONS'];
