"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('ams_token');
    const user = JSON.parse(localStorage.getItem('ams_user') || 'null');
    if (token && user) {
      if (user.role === 'SUPER_ADMIN') {
        router.replace('/super-admin');
      } else {
        router.replace('/dashboard');
      }
    } else {
      router.replace('/landing');
    }
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#0a0f0d',
      color: '#fff',
      fontFamily: 'DM Sans, sans-serif'
    }}>
      Loading...
    </div>
  );
}
