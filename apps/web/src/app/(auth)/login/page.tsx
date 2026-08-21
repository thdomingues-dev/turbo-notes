import type { Metadata } from "next";

import { redirectAuthenticatedRequest } from "@/features/auth/index.server";
import { AuthScreen } from "../_ui/AuthScreen";

export const metadata: Metadata = { title: "Log in" };

const LoginPage = async () => {
  await redirectAuthenticatedRequest();
  return <AuthScreen mode="login" />;
};

export default LoginPage;
