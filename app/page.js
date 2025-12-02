import dynamic from "next/dynamic";
const Login = dynamic(() => import("@/components/auth/Login"));

export const metadata = {
  title: "Dashboard - Login",
};

export default function Home() {
  return <Login />;
}
