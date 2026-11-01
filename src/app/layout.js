import './globals.css';
// Softezm Pvt Ltd
export const metadata = {
  title: 'Academy Management System',
  description: 'Multi-tenant Academy Management System with RBAC and JWT auth',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('ams_theme_mode')||'dark';var a=localStorage.getItem('ams_theme_accent')||'lime';document.documentElement.setAttribute('data-theme',m);document.documentElement.setAttribute('data-accent',a);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
