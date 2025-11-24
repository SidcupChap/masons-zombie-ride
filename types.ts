export enum GenerationMode {
  SURVIVAL = 'Survival Upgrade',
  INFECTED = 'Infected Zone',
  BUNKER = 'Mason\'s Bunker',
  GRAFFITI = 'Street Art Style'
}

export interface GeneratedImageResult {
  imageUrl: string;
  promptUsed: string;
}

export interface LoadingState {
  isLoading: boolean;
  message: string;
}