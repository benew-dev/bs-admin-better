export const parseCallbackUrl = (url) => {
  const res = url.replace(/%3A/g, ":").replace(/%2F/g, "/");
  return res;
};

export const getCookieName = () => {
  let cookieName = "";

  if (process.env.NODE_ENV === "development") {
    cookieName = "next-auth.session-token";
  }

  if (process.env.NODE_ENV === "production") {
    cookieName = "__Secure-next-auth.session-token";
  }

  return cookieName;
};

export const customLoader = ({ src, width }) => {
  return `${src}?w=${width}`;
};

export const arrayHasData = (array) => {
  return array === undefined || !Array.isArray(array) || array?.length === 0;
};
