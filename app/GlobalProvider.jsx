"use client";

import React from "react";
// import { AuthProvider } from "@/context/AuthContext";
// import { OrderProvider } from "@/context/OrderContext";
// import { ProductProvider } from "@/context/ProductContext";
// import { SettingsProvider } from "@/context/SettingsContext";
// import { SessionProvider } from "next-auth/react";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// eslint-disable-next-line react/prop-types
export function GlobalProvider({ children }) {
  return (
    <>
      <ToastContainer position="bottom-right" />
      {/* <AuthProvider> */}
      {/* <SettingsProvider> */}
      {/* <OrderProvider> */}
      {/* <ProductProvider> */}
      {children}
      {/* </ProductProvider> */}
      {/* </OrderProvider> */}
      {/* </SettingsProvider> */}
      {/* </AuthProvider> */}
    </>
  );
}
