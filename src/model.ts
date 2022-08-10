export interface DonationMessage {
  amount: number;
  currency: string;
}

export type DonationCallback = (donation: DonationMessage) => void;

export interface DonationPublisher {
  onDonation: (callback: DonationCallback) => void;
}
