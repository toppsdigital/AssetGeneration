import { NextAuthConfig } from "next-auth";
import Okta from '@auth/core/providers/okta';

export const authConfig: NextAuthConfig = {
  basePath: "/auth",
  providers: [Okta],
};