export interface Court {
  id: string;
  name: string;
  pricePerHour: number;
  image: string;
  description: string;
}

export type DurationOption = 1 | 1.5 | 2;

export interface DateTimeSelection {
  date: string;
  time: string;
  duration: DurationOption;
}

export interface Addons {
  soccerBall: number;
  bibs: number;
}

export interface ClientDetails {
  fullName: string;
  email: string;
  phone: string;
  teamName: string;
  specialRequests: string;
}

export interface BookingState {
  court: Court | null;
  dateTime: DateTimeSelection | null;
  addons: Addons;
  clientDetails: ClientDetails | null;
}

// 3-step flow: 1=Court, 2=Time, 3=Add-ons, 5=Confirmation
export type BookingStep = 1 | 2 | 3 | 5;

export interface AuthState {
  isLoggedIn: boolean;
  user: { email: string; name: string; phone: string } | null;
}

export type BookingStatus = 'confirmed' | 'cancelled';
export type BookingAttendance = 'pending' | 'played' | 'missed';

export interface BookingRecord {
  id: string;
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: DurationOption;
  status: BookingStatus;
  attendance: BookingAttendance;
  createdAt: number;
  clientDetails: ClientDetails;
  addons: Addons;
  totalPrice: number;
  userEmail: string;
}
