import type { Metadata } from "next";

import { redirectAuthenticatedRequest } from "@/features/auth/index.server";
import { AuthScreen } from "../_ui/AuthScreen";

export const metadata: Metadata = { title: "Sign up" };

const SignupPage = async () => {
  await redirectAuthenticatedRequest();
  return <AuthScreen mode="signup" />;
};

export default SignupPage;
