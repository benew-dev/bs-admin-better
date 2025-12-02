import React from "react";
import { GlobalProvider } from "./GlobalProvider";
import "./globals.css"; // Import CSS normal, pas dynamique
import Header from "@/components/layouts/Header";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <GlobalProvider>
          <Header />
          {children}
        </GlobalProvider>
      </body>
    </html>
  );
}
