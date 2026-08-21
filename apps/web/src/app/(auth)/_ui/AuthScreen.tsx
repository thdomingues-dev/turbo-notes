"use client";

import { cva } from "class-variance-authority";
import Image from "next/image";
import { useEffect } from "react";

import {
  adaptAuthSubmissionError,
  AuthForm,
  logIn,
  signUp,
  useAuthTransition,
  type AuthCredentials,
  type AuthMode,
} from "@/features/auth";
import { clearRecoverableNoteDrafts } from "@/features/note-autosave";

const authIllustrationStyles = cva(
  "object-contain [@media(max-height:540px)]:mb-2 [@media(max-height:540px)]:h-auto [@media(max-height:540px)]:w-22",
  {
    variants: {
      mode: {
        signup: "mb-[13.8px] h-33.5 w-[188.14px]",
        login: "mb-[33.2px] h-[113.6px] w-[95.21px]",
      },
    },
  },
);

interface AuthScreenProps {
  mode: AuthMode;
}

export const AuthScreen = ({ mode }: AuthScreenProps) => {
  const transitionToSignedIn = useAuthTransition(
    "/notes",
    clearRecoverableNoteDrafts,
  );

  const isSignup = mode === "signup";
  const authenticate = isSignup ? signUp : logIn;

  useEffect(() => {
    clearRecoverableNoteDrafts();
  }, []);

  const handleSubmit = async (credentials: AuthCredentials) => {
    try {
      await authenticate(credentials);
    } catch (error) {
      return adaptAuthSubmissionError(error);
    }
    transitionToSignedIn();
    return null;
  };

  return (
    <main className="grid min-h-dvh items-start overflow-y-auto px-4 pt-[max(32px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))] [@media(max-height:540px)]:pt-[max(16px,env(safe-area-inset-top))] [@media(min-height:650px)]:items-center">
      <section
        className="flex w-[min(100%,var(--spacing-auth-form-width))] flex-col items-center justify-self-center"
        aria-labelledby="auth-title"
      >
        <Image
          className={authIllustrationStyles({
            mode: isSignup ? "signup" : "login",
          })}
          src={
            isSignup ? "/artwork/sleeping-cat.png" : "/artwork/login-cactus.png"
          }
          width={isSignup ? 284 : 145}
          height={isSignup ? 202 : 173}
          preload
          alt={
            isSignup ? "A contented sleeping cat" : "A cheerful potted cactus"
          }
        />
        <h1
          className="mb-11.25 text-center text-[clamp(2.25rem,10vw,3rem)] leading-none text-heading [@media(max-height:540px)]:my-2 [@media(max-height:540px)]:mb-4.5 [@media(max-height:540px)]:text-[2rem]"
          id="auth-title"
        >
          {isSignup ? "Yay, New Friend!" : "Yay, You're Back!"}
        </h1>
        <AuthForm mode={mode} onSubmit={handleSubmit} />
      </section>
    </main>
  );
};
