export interface AuthUser {
  id: string; // auth.users UUID (jwt sub)
  phoneNumber?: string;
  email?: string;
  role?: string;
  appMetadata?: Record<string, unknown>;
}
