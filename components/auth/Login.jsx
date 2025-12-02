"use client";

import { React, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useRouter, useSearchParams } from "next/navigation";
import { parseCallbackUrl } from "@/helpers/helpers";
import { signIn } from "@/lib/auth-client";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    router.prefetch("/admin");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const callBackUrl = params.get("callbackUrl");

  const submitHandler = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Connexion avec Better Auth
      const { data, error } = await signIn.email({
        email,
        password,
        callbackUrl: callBackUrl ? parseCallbackUrl(callBackUrl) : "/admin",
      });

      console.log("Error Login", error);

      if (error) {
        toast.error(error.message || "Échec de connexion");
        setIsLoading(false);
        return;
      }

      if (data) {
        toast.success("Connexion réussie!");
        router.push("/admin");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Un problème est survenu. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{ maxWidth: "480px" }}
      className="mt-10 mb-20 p-4 md:p-7 mx-auto rounded-sm bg-white shadow-lg"
    >
      <form onSubmit={submitHandler}>
        <h2 className="mb-5 text-2xl font-semibold">Login</h2>

        <div className="mb-4">
          <label className="block mb-1"> Email </label>
          <input
            className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
            type="text"
            placeholder="Type your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1"> Password </label>
          <input
            className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
            type="password"
            placeholder="Type your password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <button
          type="submit"
          className={`my-2 px-4 py-2 text-center w-full inline-block text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
          disabled={isLoading}
        >
          {isLoading ? "Connexion en cours..." : "Login"}
        </button>
      </form>
    </div>
  );
};

export default Login;
