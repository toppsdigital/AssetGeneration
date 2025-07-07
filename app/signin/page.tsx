'use client'

import { signIn } from 'next-auth/react'

export default function SignIn() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-2">
      <h1 className="text-4xl font-bold mb-8">Sign In</h1>
      <button
        onClick={() => signIn('okta', { callbackUrl: '/' })}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Sign in with Okta
      </button>
    </div>
  )
} 