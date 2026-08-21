"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useId, useState } from "react";

import { Button, IconButton } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import type {
  AuthCredentials,
  AuthMode,
  AuthSubmissionErrors,
} from "../model/types";

interface AuthFormProps {
  mode: AuthMode;
  onSubmit: (
    credentials: AuthCredentials,
  ) => Promise<AuthSubmissionErrors | null>;
}

const authErrorStyles = "text-sm leading-[1.35] text-(--color-danger)";

export const AuthForm = (props: AuthFormProps) => {
  const emailId = useId();
  const passwordId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email: string | null;
    password: string | null;
  }>({ email: null, password: null });

  const { mode } = props;
  const emailErrorId = `${emailId}-error`;
  const passwordErrorId = `${passwordId}-error`;
  const isSignup = mode === "signup";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({ email: null, password: null });
    setIsSubmitting(true);

    const data = new FormData(event.currentTarget);
    const credentials = {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    };

    try {
      const submissionErrors = await props.onSubmit(credentials);
      if (submissionErrors) {
        setFieldErrors({
          email: submissionErrors.email,
          password: submissionErrors.password,
        });
        setError(submissionErrors.form);
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="flex w-full flex-col" onSubmit={handleSubmit} noValidate>
      <AuthField
        id={emailId}
        label="Email address"
        error={fieldErrors.email}
        errorId={emailErrorId}
      >
        <Input
          data-auth-input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="Email address"
          aria-describedby={fieldErrors.email ? emailErrorId : undefined}
          aria-invalid={Boolean(fieldErrors.email)}
          required
          disabled={isSubmitting}
        />
      </AuthField>

      <AuthField
        id={passwordId}
        label="Password"
        error={fieldErrors.password}
        errorId={passwordErrorId}
      >
        <div className="relative">
          <Input
            adornment="end"
            data-auth-input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={8}
            placeholder="Password"
            aria-describedby={
              fieldErrors.password ? passwordErrorId : undefined
            }
            aria-invalid={Boolean(fieldErrors.password)}
            required
            disabled={isSubmitting}
          />
          <IconButton
            className="absolute top-0.5 right-0.5 text-accent md:-top-0.5"
            variant="secondary"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOffIcon /> : <NotVisibleIcon />}
          </IconButton>
        </div>
      </AuthField>

      <div className="min-h-8.5 pt-0.5 md:min-h-7.5" aria-live="polite">
        {error ? (
          <p className={authErrorStyles} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        className="min-h-12 w-full px-0 font-sans text-base leading-none font-bold disabled:cursor-wait md:min-h-auth-submit-height"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Please wait…" : isSignup ? "Sign Up" : "Login"}
      </Button>

      <Link
        className="my-[-1.5px] mb-[-14.5px] inline-flex min-h-11 items-center self-center px-2 text-xs leading-3.75 text-accessible-link underline underline-offset-[3px]"
        href={isSignup ? "/login" : "/signup"}
      >
        {isSignup
          ? "We’re already friends!"
          : "Oops! I’ve never been here before"}
      </Link>
    </form>
  );
};

interface AuthFieldProps {
  id: string;
  label: string;
  error: string | null;
  errorId: string;
  children: ReactNode;
}

const AuthField = ({ id, label, error, errorId, children }: AuthFieldProps) => {
  return (
    <div className="mb-3 grid gap-1.5">
      <label className="text-xs font-semibold md:sr-only" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className={authErrorStyles} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const NotVisibleIcon = () => {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.07706 9.38876C1.93634 9.62636 2.01488 9.93305 2.25248 10.0738C2.49007 10.2145 2.79676 10.1359 2.93748 9.89835L2.07706 9.38876ZM3.21652 7.4648L2.07706 9.38876L2.93748 9.89835L4.07694 7.97439L3.21652 7.4648Z"
        fill="currentColor"
      />
      <path
        d="M3.00012 7C6.00012 9 10.0001 9 13.0001 7"
        stroke="currentColor"
        strokeLinecap="round"
      />
      <path
        d="M4.67518 10.7114C4.63082 10.984 4.81581 11.2409 5.08837 11.2852C5.36092 11.3296 5.61783 11.1446 5.66219 10.872L4.67518 10.7114ZM5.12951 7.9197L4.67518 10.7114L5.66219 10.872L6.11652 8.08033L5.12951 7.9197Z"
        fill="currentColor"
      />
      <path
        d="M6.99988 11.0001C6.99986 11.2762 7.2237 11.5001 7.49985 11.5001C7.77599 11.5001 7.99986 11.2763 7.99988 11.0002L6.99988 11.0001ZM7.00004 8.50003L6.99988 11.0001L7.99988 11.0002L8.00004 8.5001L7.00004 8.50003Z"
        fill="currentColor"
      />
      <path
        d="M10.0097 11.0981C10.0639 11.3688 10.3273 11.5445 10.5981 11.4903C10.8688 11.4361 11.0445 11.1727 10.9903 10.9019L10.0097 11.0981ZM9.50965 8.59811L10.0097 11.0981L10.9903 10.9019L10.4902 8.40197L9.50965 8.59811Z"
        fill="currentColor"
      />
      <path
        d="M12.5902 10.2866C12.7484 10.5129 13.0601 10.5681 13.2865 10.4099C13.5128 10.2517 13.568 9.93999 13.4098 9.71366L12.5902 10.2866ZM11.1922 8.28658L12.5902 10.2866L13.4098 9.71366L12.0118 7.71365L11.1922 8.28658Z"
        fill="currentColor"
      />
    </svg>
  );
};

const EyeOffIcon = () => {
  return (
    <svg
      className="w-4 fill-none stroke-current stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m3 3 18 18M10.6 6.1c.5-.1.9-.1 1.4-.1 6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-2.6 3.3M6.3 6.3C3.8 8.1 2.5 12 2.5 12s3.5 6 9.5 6c1.3 0 2.5-.3 3.5-.7M9.9 9.9A3 3 0 0 0 12 15c.8 0 1.5-.3 2.1-.9" />
    </svg>
  );
};
