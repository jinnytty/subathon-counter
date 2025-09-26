export interface DonationMessage {
  amount: number;
  currency: string;
}

export type DonationCallback = (donation: DonationMessage) => void;

export interface DonationPublisher {
  onDonation: (callback: DonationCallback) => void;
}

export interface SubscriptionMessage {
  prime: boolean;
  plan: string;
}

export type SubscriptionCallback = (sub: SubscriptionMessage) => void;

export interface SubscriptionPublisher {
  onSubscription: (callback: SubscriptionCallback) => void;
}

export interface TimerControlMessage {
  command:
    | 'set'
    | 'add'
    | 'sub'
    | 'pause'
    | 'unpause'
    | 'pausesubathon'
    | 'unpausesubathon';
  value?: string;
}

export type TimerControlCallback = (msg: TimerControlMessage) => void;

export interface TimerControlPublisher {
  onTimerControl: (callback: TimerControlCallback) => void;
}
