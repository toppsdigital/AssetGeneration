'use client'

import { SessionProvider } from 'next-auth/react'
import { Inter } from 'next/font/google'
import NavBar from '../components/NavBar'
import '../styles/globals.css'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionProvider>
          <NavBar />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  )
} 