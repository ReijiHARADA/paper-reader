export type ServiceStatus = {
  checking: boolean;
  available: boolean;
  modelLoaded?: boolean;
  models?: string[];
  error?: string;
};
