import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "eConsul | აშშ-ის ვიზის საცდელი გასაუბრება";
  const description = "ივარჯიშეთ მშვიდად, იყავით გულწრფელი და გამოსცადეთ საკუთარი თავი ვირტუალურ კონსულ ოფიცერთან.";

  return {
    title,
    description,
    icons: {
      icon: "/econsul-logo.png",
      shortcut: "/econsul-logo.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: `${origin}/og-realistic.png`, width: 1734, height: 907, alt: "eConsul აშშ-ის ვიზის რეალისტური ინტერვიუს პრაქტიკა" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og-realistic.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ka">
      <body className={nunito.variable}>{children}</body>
    </html>
  );
}
