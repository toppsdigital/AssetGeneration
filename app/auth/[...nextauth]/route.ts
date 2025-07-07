import NextAuth, { NextAuthOptions } from 'next-auth'
import OktaProvider from 'next-auth/providers/okta'

const authOptions: NextAuthOptions = {
  providers: [
    OktaProvider({
      clientId: process.env.AUTH_OKTA_ID!,
      clientSecret: process.env.AUTH_OKTA_SECRET!,
      issuer: process.env.AUTH_OKTA_ISSUER!,
    }),
  ],
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token
      }
      return token
    },
    async session({ session, token }) {
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'development-secret-key',
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST } 