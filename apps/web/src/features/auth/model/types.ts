export type AuthMode = "login" | "signup";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthSubmissionErrors {
  email: string | null;
  password: string | null;
  form: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
}

export type AuthenticatedSession = {
  authenticated: true;
  user: SessionUser;
};

type AnonymousSession = {
  authenticated: false;
  user: null;
};

export type Session = AuthenticatedSession | AnonymousSession;
